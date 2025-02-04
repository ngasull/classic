import { join, relative, resolve, toFileUrl } from "@std/path";
import type { BuildRoute } from "./build.ts";
import { pageCss } from "./file-router/page.css.ts";
import type { Middleware, MiddlewareContext } from "./middleware.ts";
import type { JSONable } from "../js/types.ts";

type Empty = { [n in never]: never };

type Async<T> = T | PromiseLike<T>;

const httpMethods = ["GET", "POST", "DELETE", "PATCH", "PUT"] as const;

type Method = typeof httpMethods[number];

type AsRouteParam<Name extends string | number | symbol> = Name extends
  `[[${infer P}]]` ? P : Name extends `[${infer P}]` ? P : never;

export const fileRouter = async (
  route: BuildRoute,
  base: string,
): Promise<void> => {
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

    const { default: mod }: { default: FileRoute<unknown> } = await import(url)
      .catch((e) => {
        throw new Error(`Failed importing ${url}: ` + e.message);
      });
    if (typeof mod !== "function") {
      throw new Error(`${url} must \`export default\` a function`);
    }

    const fileBuild = new FileBuild(url);
    await new FileBuildContextBuild(fileBuild, route).use(mod);
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

export const route: {
  <ParamStr extends string, Params>(
    segment: ParamStr,
    fileRoute: FileRoute<Params & RouteParams<ParamStr>>,
  ): FileRoute<Params & RouteParams<ParamStr>>;
  <F extends FileRoute<any>>(fileRoute: F): F;
} = <ParamStr extends string, Params>(
  segment: ParamStr | FileRoute<Params>,
  fileRoute?: FileRoute<Params & RouteParams<ParamStr>>,
): FileRoute<Params & RouteParams<ParamStr>> =>
  fileRoute
    ? ((r) => fileRoute(r.segment(segment as ParamStr)))
    : segment as FileRoute<Params & RouteParams<ParamStr>>;

type RouteParams<T extends string> = T extends `${"" | "/"}:${infer P}`
  ? { [param in P]: string }
  : { [n in never]: never };

export type FileRoute<Params> = <P extends Params>(
  r: FileBuildContext<P>,
) => Async<void>;

class Queue {
  #last: Promise<unknown> = Promise.resolve();

  queue<T>(cb: () => T): Promise<Awaited<T>> {
    return this.#last = this.#last.then(() => cb()) as Promise<Awaited<T>>;
  }

  get last(): Promise<unknown> {
    return this.#last;
  }
}

/**
 * Represents a file route once processed through `FileBuildContext`.
 * It then contains the information to dispatch the file route requests.
 * It can also be used to store built meta for production restoration.
 */
class FileBuild {
  constructor(
    public readonly modulePath: string,
    public readonly meta: { [i in number]: JSONable } = {},
  ) {}

  metaIndex = 0;
  readonly handlers: Array<
    (req: MiddlewareContext<any>) => Async<Response | void>
  > = [];
}

export interface FileBuildContext<Params> {
  segment<P extends string>(
    segment: P,
  ): FileBuildContext<Params & RouteParams<P>>;
  use<M extends Async<any>, Args extends any[]>(
    use: (context: FileBuildContext<Params>, ...args: Args) => M,
    ...args: Args
  ): Promise<Awaited<M>>;
  useBuild<M extends Async<JSONable | void>, Args extends any[]>(
    builder: (route: BuildRoute, ...args: Args) => M,
    ...args: Args
  ): Promise<Awaited<M>>;
  method(
    method: Method,
    handler: (req: MiddlewareContext<Params>) => Async<void | Response>,
  ): this;
}

export class FileBuildContextBuild<Params> implements FileBuildContext<Params> {
  constructor(
    fileBuild: FileBuild,
    route: BuildRoute,
    uses: Queue = new Queue(),
  ) {
    this.#fileBuild = fileBuild;
    this.#route = route;
    this.#uses = uses;
  }

  readonly #fileBuild: FileBuild;
  readonly #route: BuildRoute;
  #uses: Queue;

  segment<P extends string>(
    segment: P,
  ): FileBuildContext<Params & RouteParams<P>> {
    return new FileBuildContextBuild<Params & RouteParams<P>>(
      this.#fileBuild,
      this.#route.segment(segment),
      this.#uses,
    );
  }

  use<M extends Async<any>, Args extends any[]>(
    use: (context: FileBuildContext<Params>, ...args: Args) => M,
    ...args: Args
  ): Promise<Awaited<M>> {
    return this.#uses.queue(async () => {
      const subCtx = new FileBuildContextBuild<Params>(
        this.#fileBuild,
        this.#route,
      );

      const used = await use(subCtx, ...args);
      await subCtx.#uses.last;

      return used;
    });
  }

  useBuild<M extends Async<JSONable | void>, Args extends any[]>(
    builder: (route: BuildRoute, ...args: Args) => M,
    ...args: Args
  ) {
    return this.#uses.queue(async () => {
      const index = this.#fileBuild.metaIndex++;
      const meta = await builder(this.#route, ...args);
      if (meta !== undefined) {
        this.#fileBuild.meta[index] = meta;
      }
      return meta;
    });
  }

  method(
    method: Method,
    handler: (req: MiddlewareContext<Params>) => Async<void | Response>,
  ): this {
    this.useBuild((route) => {
      const index = this.#fileBuild.handlers.length;
      route.method(
        method,
        import.meta.url,
        this.#fileBuild.modulePath,
        this.#fileBuild.meta,
        index,
      );
      this.#fileBuild.handlers.push(handler);
    });
    return this;
  }
}

export class FileBuildContextRuntime<Params>
  implements FileBuildContext<Params> {
  constructor(
    fileBuild: FileBuild,
    handlerIndex: number,
    req: MiddlewareContext<Params>,
    setResponse: (r: Async<Response | void>) => unknown,
    usedBuilds = 0,
    usedHandlers = 0,
    uses: Queue = new Queue(),
  ) {
    this.#fileBuild = fileBuild;
    this.#handlerIndex = handlerIndex;
    this.#req = req;
    this.#setResponse = setResponse;
    this.#usedBuilds = usedBuilds;
    this.#usedHandlers = usedHandlers;
    this.#uses = uses;
  }

  readonly #fileBuild: FileBuild;
  readonly #handlerIndex: number;
  readonly #req: MiddlewareContext<Params>;
  readonly #setResponse: (r: Async<Response | void>) => unknown;
  #usedBuilds;
  #usedHandlers;
  #uses: Queue;

  get modulePath() {
    return this.#fileBuild.modulePath;
  }

  segment<P extends string>(_: P): FileBuildContext<Params & RouteParams<P>> {
    return this as FileBuildContext<Params & RouteParams<P>>;
  }

  async use<M extends Async<any>, Args extends any[]>(
    use: (context: FileBuildContext<Params>, ...args: Args) => M,
    ...args: Args
  ): Promise<Awaited<M>> {
    return this.#uses.queue(async () => {
      const ctx = new FileBuildContextRuntime(
        this.#fileBuild,
        this.#handlerIndex,
        this.#req,
        this.#setResponse,
        this.#usedBuilds,
        this.#usedHandlers,
      );
      const used = await use(ctx, ...args);
      await ctx.#uses.last;
      this.#usedBuilds = ctx.#usedBuilds;
      this.#usedHandlers = ctx.#usedHandlers;
      return used;
    });
  }

  useBuild<M extends Async<JSONable | void>, Args extends any[]>(
    _builder: (route: BuildRoute, ...args: Args) => M,
    ..._args: Args
  ) {
    return this.#uses.queue(() =>
      this.#fileBuild.meta[this.#usedBuilds++] as M
    );
  }

  method(
    _: Method,
    handler: (req: MiddlewareContext<Params>) => Async<void | Response>,
  ) {
    this.#uses.queue(() => {
      this.#usedBuilds++;
      if (this.#handlerIndex === this.#usedHandlers++) {
        this.#setResponse(handler(this.#req));
      }
    });
    return this;
  }
}

export default async (
  modulePath: string,
  meta: { [i in number]: JSONable },
  index: number,
): Promise<Middleware> => {
  const route = await import(modulePath)
    .then(({ default: route }) => {
      if (typeof route !== "function") {
        throw Error(
          `${modulePath} must \`export default\` a file route function`,
        );
      }
      return route as (r: FileBuildContext<Empty>) => Async<void>;
    })
    .catch((e) => {
      console.info("Failed importing %s - see below", modulePath);
      throw e;
    });

  return async (ctx) => {
    const fileBuild = new FileBuild(modulePath, meta);
    let res: Async<Response | void> | undefined;
    await new FileBuildContextRuntime(fileBuild, index, ctx, (r) => res = r)
      .use(route);
    return res;
  };
};
