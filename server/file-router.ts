import { join, relative, resolve, toFileUrl } from "@std/path";
import type { BuildFunction, BuildRoute } from "./build.ts";
import type { Middleware, RequestContextAPI } from "./middleware.ts";
import { pageCss } from "./file-router/page.css.ts";
import { Context } from "./context.ts";

type Async<T> = T | PromiseLike<T>;

const httpMethods = ["GET", "POST", "DELETE", "PATCH", "PUT"] as const;

type Method = typeof httpMethods[number];

type AsRouteParam<Name extends string | number | symbol> = Name extends
  `[[${infer P}]]` ? P : Name extends `[${infer P}]` ? P : never;

export const $rootBuild = Context.key<BuildRoute>("rootBuild");

export const fileRouter = (base: string): BuildFunction => async (route) => {
  route.provide($rootBuild, route);
  await scanDir(base, route, [], route);
};

const routeRegExp = /^((?:(.+)\.)?route)\.(tsx?|css)$/;

const scanDir = async (
  baseDir: string,
  rootBuild: BuildRoute,
  parentSegments: string[],
  parentBuild: BuildRoute,
) => {
  const routeFiles = new Set<[string, string]>();
  const cssRouteFiles = new Set<[string, string]>();
  const directories = new Set<string>();
  let indexFile: string | undefined;
  let cssIndexFile: string | undefined;

  const dir = join(baseDir, ...parentSegments);
  for await (const { isDirectory, name } of Deno.readDir(dir)) {
    if (isDirectory) {
      directories.add(name);
    } else {
      const match = name.match(routeRegExp);
      if (match) {
        const [
          ,
          baseName,
          routeName,
          ext,
        ] = match as [string, string, string, string];

        if (ext === "css") {
          if (baseName === "route") {
            cssIndexFile = name;
          } else {
            cssRouteFiles.add([name, routeName]);
          }
        } else {
          if (baseName === "route") {
            if (indexFile) {
              throw Error(
                `Two route files defined in ${dir} : ${indexFile} and ${name}`,
              );
            } else {
              indexFile = name;
            }
          } else {
            routeFiles.add([name, routeName]);
          }
        }
      }
    }
  }

  const addRouteFile = async (fileName: string, route: BuildRoute) => {
    const path = join(...parentSegments, fileName);
    const cwdFilePath = join(baseDir, path);

    const url = toFileUrl(resolve(cwdFilePath)).href;

    const { default: mod } = await import(url).catch((e) => {
      throw new Error(`Failed importing ${url}: ` + e.message);
    });
    if (!(mod instanceof FileRoute)) {
      throw new Error(`${url} must \`export default\` a FileRouterRoute`);
    }

    route.provide($moduleImportSpec, url);
    route.provide($childRouteIndex, []);
    await mod.build?.(route);
  };

  if (indexFile) {
    // ! \\ CSS First
    if (cssIndexFile) {
      const path = join(dir, cssIndexFile);
      await pageCss({
        css: await Deno.readFile(path),
        fileName: relative(baseDir, path),
      })(parentBuild);
    }

    await addRouteFile(indexFile, parentBuild);
  }

  // ! \\ CSS First
  for (const [name, routeName] of cssRouteFiles) {
    const path = join(dir, name);
    await pageCss({
      css: await Deno.readFile(path),
      fileName: relative(baseDir, path),
    })(parentBuild.segment(segmentToURLPattern(routeName) + "/*"));
  }

  for (const [name, routeName] of routeFiles) {
    await addRouteFile(
      name,
      parentBuild.segment(segmentToURLPattern(routeName)),
    );
  }

  for (const name of directories) {
    await scanDir(
      baseDir,
      rootBuild,
      [...parentSegments, name],
      parentBuild.segment(segmentToURLPattern(name)),
    );
  }
};

const segmentToURLPattern = (segment: string) => {
  const match = segment.match(/^\[(\.\.\.)?([^\]]+)\]$/);
  if (!match) return `/${segment}`;

  const [, spread, param] = match;
  if (spread) return `/:${param}*`;

  const optional = param?.match(/^\[(.+)\]$/)?.[1];
  return optional ? `{/:${optional}}?` : `/:${param}`;
};

//     if (mutation) {
//       for (const name of mutation === true ? [""] : mutation) {
//         router.add(
//           "POST",
//           name ? `${pattern}/${name}` : pattern,
//           async (req, params, context) => {
//             const mod = (await getMod(route))!;
//             const url = new URL(req.url);
//             const rawLocation = url.searchParams.get("location");
//             const requestedLocation = rawLocation
//               ? new URL(rawLocation, url.origin)
//               : null;

//             const modMutation = mutation === true
//               ? mod.mutation as Mutation<string>
//               : (mod.mutation as Record<string, Mutation<string>>)[name];

//             const res = await modMutation({ req, params });
//             if (res instanceof Response) {
//               return res;
//             } else if (
//               requestedLocation && requestedLocation?.pathname !== url.pathname
//             ) {
//               const res = await handleRequest(
//                 new Request(requestedLocation, { headers: req.headers }),
//                 context,
//               );
//               res?.headers.set("Content-Location", requestedLocation.pathname);
//               return res;
//             } else {
//               return new Response();
//             }
//           },
//         );
//       }
//     }

const $moduleImportSpec = Context.key<string>("moduleImportSpec");
const $childRouteIndex = Context.key<number[]>("childRouteIndex");

type RouteFn = {
  <ParamStr extends string, Meta>(
    segment?: ParamStr,
    ...nested: FileRouteOrOpts<RouteParams<ParamStr>, Meta>[]
  ): FileRoute<RouteParams<ParamStr>>;
  <Params, Meta>(
    ...nested: FileRouteOrOpts<Params, Meta>[]
  ): FileRoute<Params>;
};

const asRoute = <Params, Meta>(route: FileRouteOrOpts<Params, Meta>) => {
  if (route instanceof FileRoute) return route;

  const methods = httpMethods.filter((m) => route[m]);
  return new FileRoute<Params, Awaited<Meta>>(
    route.build || methods.length > 0
      ? (async (build) => {
        const meta = await route.build?.(build);

        for (const method of methods) {
          build.method(
            method,
            import.meta.url,
            build.use($moduleImportSpec),
            build.use($childRouteIndex),
            meta!,
          );
        }
      })
      : undefined,
    Object.fromEntries(
      methods.map((m) => [
        m,
        (ctx, _modulePath, _index, meta) => route[m]!(ctx, meta),
      ]),
    ),
  );
};

export const route: RouteFn = <ParamStr extends string, Meta>(
  segment?: ParamStr | FileRouteOrOpts<RouteParams<ParamStr>, Meta>,
  ...nested: FileRouteOrOpts<RouteParams<ParamStr>, Meta>[]
): FileRoute<RouteParams<ParamStr>, void> => {
  if (typeof segment === "object") {
    nested.unshift(segment);
    segment = undefined;
  }

  const fileRoutes = nested.map(asRoute);

  const methods = new Set<Method>();
  for (const m of httpMethods) {
    if (fileRoutes.some((r) => r.handle[m])) {
      methods.add(m);
    }
  }

  return (fileRoutes.length === 1
    ? new FileRoute(
      fileRoutes[0].build &&
        ((build: BuildRoute) => fileRoutes[0].build!(build.segment(segment))),
      fileRoutes[0].handle,
    )
    : new FileRoute(
      async (build: BuildRoute) => {
        for (let i = 0; i < fileRoutes.length; i++) {
          const child = fileRoutes[i];
          if (child.build) {
            const childRoute = build.segment(segment);
            const prevIndex = childRoute.use($childRouteIndex);
            childRoute.provide($childRouteIndex, [...prevIndex, i]);
            await child.build(childRoute);
            childRoute.provide($childRouteIndex, prevIndex);
          }
        }
      },
      Object.fromEntries(
        [...methods].map(
          (m) => [m, async (ctx, modulePath, index, meta: never) => {
            const [i, ...childIndex] = index;
            const child = fileRoutes[i];
            if (child?.handle[m]) {
              return child.handle[m](
                ctx,
                modulePath,
                childIndex,
                meta,
              );
            } else {
              throw new HandlerNotFoundError();
            }
          }],
        ),
      ),
    )) as FileRoute<RouteParams<ParamStr>>;
};

class HandlerNotFoundError extends Error {}

type RouteParams<T extends string> = T extends `${"" | "/"}:${infer P}`
  ? Record<P, string>
  : Record<never, string>;

export class FileRoute<Params = Record<never, string>, Meta = void> {
  constructor(
    public readonly build?: BuildFunction,
    public readonly handle: {
      [method in Method]?: (
        ctx: RequestContextAPI<Params>,
        modulePath: string,
        index: number[],
        meta: Meta,
      ) => Async<void | Response>;
    } = {},
  ) {}
}

type FileRouteOrOpts<Params, Meta> =
  | FileRoute<Params, Meta>
  | FileRouteOpts<Params, Meta>;

type FileRouteOpts<Params, Meta> =
  & { readonly build?: (build: BuildRoute) => Meta }
  & {
    readonly [method in Method]?: (
      ctx: RequestContextAPI<Params>,
      meta: Awaited<Meta>,
    ) => Async<void | Response>;
  };

export default (
  modulePath: string,
  index: number[],
  meta: unknown,
): Middleware => {
  const routeQ = import(modulePath)
    .then(({ default: route }) => {
      if (!(route instanceof FileRoute)) {
        throw Error(`${modulePath} must \`export default\` a FileRoute`);
      }
      return route;
    })
    .catch((e) => {
      console.info("Failed importing %s - see below", modulePath);
      throw e;
    });
  return async (ctx) => {
    const route = await routeQ;
    const handler = route.handle[ctx.request.method as Method];

    if (!handler) {
      throw Error(`${modulePath} route defines no request handler`);
    }

    try {
      return await handler(ctx, modulePath, index, meta);
    } catch (e) {
      throw e instanceof HandlerNotFoundError
        ? Error(
          `${modulePath} route has no ${ctx.request.method} handler at ${
            index.join(".")
          }`,
        )
        : e;
    }
  };
};
