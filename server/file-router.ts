import { join, relative, resolve, toFileUrl } from "@std/path";
import type { BuildRoute } from "./build.ts";
import type { Middleware } from "./middleware.ts";
import { pageCss } from "./file-router/page.css.ts";
import { createUseKey } from "./use.ts";

type Async<T> = T | PromiseLike<T>;

// type RouteModule<
//   Params extends string,
//   Data,
//   Mutations extends string,
//   Children extends Record<string, RouteApi<string, unknown, string, any>>,
// > = {
//   default?: RouteApi<Params, Data, Mutations, Children>;
// };

// type RouteApiDefinition<
//   Params extends string,
//   Data,
//   Mutations extends string,
//   CParams extends string,
//   Children extends {
//     [P in CParams]: P extends string
//       ? RouteApiDefinition<AsRouteParam<P>, unknown, string, string, any>
//       : never;
//   },
// > =
//   & {
//     layout?: JSX.PFC<PageProps<Params, Data>> | {
//       style?: string;
//       render: JSX.PFC<PageProps<Params, Data>>;
//     };
//     page?: JSX.FC<PageProps<Params, Data>> | {
//       style?: string;
//       render: JSX.FC<PageProps<Params, Data>>;
//     };
//     mutation?: Mutation<Params> | { [M in Mutations]: Mutation<Params> };
//     children?: Children;
//   }
//   & {
//     [M in typeof httpMethods[number]]?: (ctx: RouteContext<Params>) =>
//       | Response
//       | JSXElement
//       | Data
//       | Promise<Response | JSXElement | Data>;
//   };

// declare const $params: unique symbol;
// declare const $data: unique symbol;

// type Mutation<Params extends string> = (ctx: RouteContext<Params>) =>
//   | Response
//   | void
//   | Promise<Response | void>;

// type RouteApi<
//   Params extends string,
//   Data,
//   Mutations extends string,
//   Children extends Record<string, RouteApi<string, unknown, string, any>>,
// > =
//   & {
//     [$params]: Params;
//     [$data]: Data;
//   }
//   & RouteApiDefinition<Params, Data, Mutations, string, Children>;

// type RouteContext<Params extends string> = {
//   req: Request;
//   params: Record<Params, string>;
// };

// type PageProps<Params extends string, Data> =
//   & RouteContext<Params>
//   & { data?: Data };

// type RoutesMeta = { base: string; root: RouteMeta };

// type RouteMeta =
//   & {
//     mutation?: true | string[];
//     children?: Record<string, RouteMeta>;
//     layoutCss?: string;
//     css?: string[];
//     methods?: (typeof httpMethods[number])[];
//     staticGETContents?: string;
//   }
//   & (
//     | { path?: never; inline?: never }
//     | { path: string; inline?: never }
//     | { path?: never; inline: string }
//   );

const httpMethods = ["GET", "POST", "DELETE", "PATCH", "PUT"] as const;

type Method = typeof httpMethods[number];

// type AsParams<Params> = Params extends { [$params]: infer P extends string } ? P
//   : string;

// type AsChildren<Children> = undefined extends Children
//   ? Record<string, RouteApi<string, unknown, string, any>>
//   : { [P in keyof Children]: RouteApi<AsRouteParam<P>, unknown, string, any> };

type AsRouteParam<Name extends string | number | symbol> = Name extends
  `[[${infer P}]]` ? P : Name extends `[${infer P}]` ? P : never;

// const defineRoute = <
//   Params,
//   Data,
//   Mutations extends string,
//   CParams extends string,
//   Children extends {
//     [P in CParams]: P extends string
//       ? RouteApiDefinition<AsRouteParam<P>, unknown, string, string, any>
//       : never;
//   },
// >(
//   opts:
//     & {
//       params?: Params;
//       data?: Data;
//     }
//     & RouteApiDefinition<AsParams<Params>, Data, Mutations, CParams, Children>
//     & {
//       [M in typeof httpMethods[number]]?: (
//         ctx: RouteContext<AsParams<Params>>,
//       ) =>
//         | Response
//         | JSXElement
//         | Data
//         | Promise<Response | JSXElement | Data>;
//     },
// ): RouteApi<AsParams<Params>, Data, Mutations, AsChildren<Children>> =>
//   opts as RouteApi<AsParams<Params>, Data, Mutations, AsChildren<Children>>;

// defineRoute.params = <Params extends string>(): {
//   [$params]: Params;
// } => null!;

// defineRoute.data = <Data>(): { [$data]: Data } => null!;

// const defineMutation = <Params>(
//   mutation: Mutation<keyof Params & string>,
// ): RouteApi<AsParams<Params>, never, string, never> =>
//   ({ mutation }) as unknown as RouteApi<AsParams<Params>, never, string, never>;

// export { defineMutation as mutation, defineRoute as route };

export const $rootBuild = createUseKey<BuildRoute>("rootBuild");

export const fileRouter = (
  base: string,
): { build: (build: BuildRoute) => Promise<void> } => {
  return {
    build: (build: BuildRoute) => {
      build.use.provide($rootBuild, build);
      return scanDir(base, build, [], build);
    },
  };
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
        const [, baseName, routeName, ext] = match as [
          string,
          string,
          string,
          string,
        ];

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

        // await addChild(
        //   baseDir,
        //   parentSegments,
        //   routeName,
        //   path,
        //   styleSheet,
        //   route,
        //   parent as RouteMeta,
        // );
      }
    }
  }

  const addRouteFile = async (fileName: string, build: BuildRoute) => {
    const path = join(...parentSegments, fileName);
    const cwdFilePath = join(baseDir, path);

    const url = toFileUrl(resolve(cwdFilePath)).href;

    const { default: mod } = await import(url).catch((e) => {
      throw new Error(`Failed importing ${url}: ` + e.message);
    });
    if (!(mod instanceof FileRoute)) {
      throw new Error(`${url} must \`export default\` a FileRouterRoute`);
    }

    build.use.provide($moduleImportSpec, url);
    build.use.provide($childRouteIndex, []);
    await mod.build?.(build);
  };

  if (indexFile) {
    // ! \\ CSS First
    if (cssIndexFile) {
      const path = join(dir, cssIndexFile);
      await pageCss(parentBuild, {
        css: await Deno.readFile(path),
        fileName: relative(baseDir, path),
      });
    }

    await addRouteFile(indexFile, parentBuild);
  }

  // ! \\ CSS First
  for (const [name, routeName] of cssRouteFiles) {
    const path = join(dir, name);
    await pageCss(parentBuild.segment(segmentToURLPattern(routeName) + "/*"), {
      css: await Deno.readFile(path),
      fileName: relative(baseDir, path),
    });
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

// const addChild = async (
//   baseDir: string,
//   parentSegments: string[],
//   routeName: string | null,
//   path: string,
//   styleSheet: string | null,
//   { page, layout, mutation, children, ...mod }: RouteApi<
//     string,
//     unknown,
//     string,
//     Record<string, RouteApi<string, unknown, string, any>>
//   >,
//   parent: RouteMeta,
// ) => {
//   const segments = routeName == null
//     ? parentSegments
//     : [...parentSegments, routeName];

//   const route = routeName == null ? parent : (
//     parent.children ??= {},
//       parent.children[segmentToURLPattern(routeName)] ??= path === parent.path
//         ? { inline: routeName }
//         : {}
//   ) as RouteMeta;

//   if (!route.inline) {
//     if (route.path != null) {
//       throw Error(`Duplicate route definition: ${route.path} and ${path}`);
//     }
//     // We don't want `route.path` to be refined as nullish here
//     (route as RouteMeta).path = path;
//   }

//   if (layout && typeof layout === "object") {
//     const cssFileBaseName: string = routeName == null
//       ? "indexlayoutinjs"
//       : `${routeName}.layoutinjs`;

//     const { code, map } = transformCss({
//       filename: cssFileBaseName + ".css",
//       code: encoder.encode(layout.style),
//       sourceMap: true,
//     });
//     const cssFileName = `${cssFileBaseName}.${await encodeHash(code)}.css`;
//     route.layoutCss = ["", ...parentSegments, cssFileName].join("/");

//     parent.children ??= {};
//     parent.children["/" + cssFileName] = {
//       methods: ["GET"],
//       staticGETContents: `${
//         decoder.decode(code)
//       }\n/*# sourceMappingURL=${cssFileName}.map */\n`,
//     };
//     if (map) {
//       parent.children["/" + cssFileName + ".map"] = {
//         methods: ["GET"],
//         staticGETContents: decoder.decode(map),
//       };
//     }
//   }

//   if (page && typeof page === "object") {
//     const cssFileBaseName: string = routeName == null
//       ? "indexinjs"
//       : `${routeName}.injs`;
//     const ss = ["", ...parentSegments, cssFileBaseName + ".css"].join("/");
//     route.css = styleSheet ? [styleSheet, ss] : [ss];

//     const { code, map } = transformCss({
//       filename: cssFileBaseName + ".css",
//       code: encoder.encode(page.style),
//       sourceMap: true,
//     });
//     const cssFileName = `${cssFileBaseName}.${await encodeHash(code)}.css`;

//     parent.children ??= {};
//     parent.children["/" + cssFileName] = {
//       methods: ["GET"],
//       staticGETContents: `${
//         decoder.decode(code)
//       }\n/*# sourceMappingURL=${cssFileName}.map */\n`,
//     };
//     if (map) {
//       parent.children["/" + cssFileName + ".map"] = {
//         methods: ["GET"],
//         staticGETContents: decoder.decode(map),
//       };
//     }
//   }

//   if (mutation) {
//     route.mutation = typeof mutation === "function"
//       ? true
//       : Object.keys(mutation);
//   }

//   for (const method of httpMethods) {
//     const ms = new Set(route.methods);
//     if ((mod[method] || method === "GET" && page)) {
//       ms.add(method);
//     }
//     route.methods = [...ms];
//   }

//   if (children) {
//     await Promise.all(
//       Object.entries(children).map(([cname, croute]) =>
//         addChild(
//           baseDir,
//           segments,
//           cname,
//           path,
//           styleSheet,
//           croute,
//           route,
//         )
//       ),
//     );
//   }
// };

const segmentToURLPattern = (segment: string) => {
  const match = segment.match(/^\[(\.\.\.)?([^\]]+)\]$/);
  if (!match) return `/${segment}`;

  const [, spread, param] = match;
  if (spread) return `/:${param}*`;

  const optional = param?.match(/^\[(.+)\]$/)?.[1];
  return optional ? `{/:${optional}}?` : `/:${param}`;
};

// export const fileRouterRuntimeOld = (
//   routes: RoutesMeta,
// ): (
//   req: Request,
//   context?: JSXContextArg,
// ) => Promise<Response | void> => {
//   const router = new RegExpRouter<
//     (req: Request, params: never, context?: JSXContextArg) =>
//       | Response
//       | void
//       | Promise<Response | void>
//   >();

//   const modPathByRoute = new Map<
//     RouteMeta,
//     () => Promise<RouteApi<never, never, string, never> | undefined>
//   >();
//   const getMod = async (route: RouteMeta) => modPathByRoute.get(route)?.();

//   const addRoute = (
//     parents: RouteMeta[],
//     pattern: string,
//     route: RouteMeta,
//   ) => {
//     let ext: string | null;
//     const nestedRoutes = [...parents, route];

//     const { path, inline, methods, staticGETContents, mutation, children } =
//       route;

//     if (inline) {
//       const parent = parents[parents.length - 1];
//       modPathByRoute.set(
//         route,
//         async () =>
//           (await getMod(parent))!
//             .children![inline] as RouteApi<never, never, never, never>,
//       );
//     } else if (path) {
//       const modUrl = toFileUrl(resolve(routes.base, path)).href;
//       modPathByRoute.set(
//         route,
//         async () =>
//           (await import(modUrl)).default as RouteApi<
//             never,
//             never,
//             never,
//             never
//           >,
//       );
//     }

//     if (methods) {
//       for (const method of methods) {
//         router.add(
//           method,
//           pattern,
//           method === "GET" && staticGETContents != null
//             ? () => {
//               ext ??= pattern.match(staticExtRegExp)?.[0] ?? "";
//               return new Response(
//                 staticGETContents,
//                 responseOpts[ext as keyof typeof responseOpts],
//               );
//             }
//             : async (req, params, context) => {
//               const mod = (await getMod(route))!;
//               const ctx: RouteContext<never> = { req, params };
//               const acceptsHtml = accepts(req).includes("text/html");
//               const use = initContext(context);

//               if (method === "GET" && mod.page && (acceptsHtml || !mod.GET)) {
//                 return respondPage(nestedRoutes, ctx, use);
//               } else {
//                 const res = await mod[method]!(ctx);
//                 if (res == null || res instanceof Response) {
//                   return res;
//                 } else if (isJsx(res)) {
//                   return respondHtml(res, use);
//                 } else if (acceptsHtml && mod.page) {
//                   return respondPage(nestedRoutes, { ...ctx, data: res }, use);
//                 } else {
//                   return Response.json(res);
//                 }
//               }
//             },
//         );
//       }
//     }

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

//     if (children) {
//       for (const [subPattern, child] of Object.entries(children)) {
//         addRoute(nestedRoutes, pattern + subPattern, child);
//       }
//     }
//   };

//   const respondPage = async (
//     nestedRoutes: RouteMeta[],
//     props: PageProps<never, never>,
//     use: JSX.Use,
//   ) => {
//     const { data: _, ...ctx } = props;

//     const layouts = (await Promise.all(nestedRoutes.map(async (r) => {
//       const mod = await getMod(r);
//       return mod?.layout == null ? null : [r, fromStylable(mod.layout)];
//     }))).filter(Boolean) as [RouteMeta, JSX.PFC<PageProps<never, unknown>>][];

//     const route = nestedRoutes[nestedRoutes.length - 1];
//     const mod = (await getMod(route))!;
//     const page = fromStylable(mod.page!);

//     if (route.css) {
//       for (const s of route.css) use($addCss, s);
//     }

//     return respondHtml(
//       layouts.reduceRight(
//         (children, [layout, Layout], i) =>
//           i === 0 ? jsx(Layout, { ...ctx, children }) : jsx("div", {
//             children: [
//               jsx(Shadow, {
//                 children: [
//                   layout.layoutCss
//                     ? jsx("link", {
//                       rel: "stylesheet",
//                       href: layout.layoutCss,
//                     })
//                     : null,
//                   jsx(Layout, { ...ctx, children: jsx("slot") }),
//                 ],
//               }),
//               children,
//             ],
//           }),
//         jsx(page, props),
//       ),
//       use,
//     );
//   };

//   addRoute([], "", routes.root);

//   const handleRequest: ReturnType<typeof fileRouter> = async (req, context) => {
//     const url = new URL(req.url);
//     const [[firstMatch], stash] = router.match(req.method, url.pathname);
//     if (firstMatch) {
//       return firstMatch[0](
//         req,
//         (stash
//           ? Object.fromEntries(
//             Object.entries(firstMatch[1]).map(([k, i]) => [k, stash[i]]),
//           )
//           : {}) as never,
//         context,
//       );
//     }
//   };

//   return handleRequest;
// };

export const routeBuildPlugin = <Args extends any[]>(
  build: (build: BuildRoute, ...args: Args) => Async<void>,
  ...args: Args
): FileRoute => {
  const route = new FileRoute((api) => build(api, ...args));
  return route;
};

export const routeGet = <Params>(
  handler: Middleware<Params>,
): FileRoute<Params> =>
  new FileRoute<Params>(
    (build: BuildRoute) =>
      build.get(
        "/",
        import.meta.url,
        build.use($moduleImportSpec),
        build.use($childRouteIndex),
      ),
    (ctx) => {
      if (ctx.request.method === "GET") {
        return handler(ctx);
      }
    },
  );

export const routePost = <Params>(
  handler: Middleware<Params>,
): FileRoute<Params> =>
  new FileRoute<Params>(
    (build: BuildRoute) =>
      build.post(
        "/",
        import.meta.url,
        build.use($moduleImportSpec),
        build.use($childRouteIndex),
      ),
    (ctx) => {
      if (ctx.request.method === "POST") {
        return handler(ctx);
      }
    },
  );

const $childRouteIndex = createUseKey<number[]>("childRouteIndex");

type RouteFn = {
  <ParamStr extends string>(
    segment?: ParamStr,
    ...nested: FileRoute<RouteParams<ParamStr>>[]
  ): FileRoute<RouteParams<ParamStr>>;
  <Params>(...nested: FileRoute<Params>[]): FileRoute<Params>;
};

export const route: RouteFn = <ParamStr extends string>(
  segment?: ParamStr | FileRoute<RouteParams<ParamStr>>,
  ...nested: FileRoute<RouteParams<ParamStr>>[]
): FileRoute<RouteParams<ParamStr>> => {
  if (segment instanceof FileRoute) {
    nested.unshift(segment);
    segment = undefined;
  }

  return new FileRoute<RouteParams<ParamStr>>(
    async (build: BuildRoute) => {
      const childBuild = segment ? build.segment(segment) : build;
      const parentIndex = childBuild.use.provide(
        $childRouteIndex,
        build.use($childRouteIndex),
      );

      let i = 0;
      for (const child of nested) {
        childBuild.use.provide($childRouteIndex, [...parentIndex, i++]);
        await child.build?.(childBuild);
      }
    },
    async (ctx) => {
      const index = ctx.use($childRouteIndex);
      const [i, ...next] = index;

      if (nested[i].handle) {
        ctx.use.provide($childRouteIndex, next);
        const res = await nested[i].handle(ctx);
        ctx.use.provide($childRouteIndex, index);
        return res;
      } else {
        throw Error(`Some routes define no request handler`);
      }
    },
  );
};

type RouteParams<T extends string> = T extends `:${infer P}` ? Record<P, string>
  : Record<never, string>;

const $moduleImportSpec = createUseKey<string>("moduleImportSpec");

export class FileRoute<Params = Record<never, string>> {
  constructor(
    public readonly build?: (build: BuildRoute) => void | PromiseLike<void>,
    public readonly handle?: Middleware<Params>,
  ) {}
}

export default (
  modulePath: string,
  index: readonly number[],
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

    if (!route.handle) {
      throw Error(`${modulePath} route defines no request handler`);
    }

    ctx.use.provide($childRouteIndex, index);
    return route.handle(ctx);
  };
};
