import { join, relative, resolve, toFileUrl } from "@std/path";
import {
  Asset,
  type BaseBuild,
  type Build,
  Builder,
  type BuilderParams,
  type BuilderReturnType,
  defineBuilder,
  type HandlerParam,
  Queue,
} from "./build.ts";
import { type Context, createContext, type Parameters1N } from "./context.ts";
import { pageCss } from "./file-router/page.css.ts";
import type { Key } from "./key.ts";
import type { Middleware, MiddlewareContext } from "./middleware.ts";
import type { Stringifiable } from "../js/stringify.ts";

type Empty = { [n in never]: never };

type Async<T> = T | PromiseLike<T>;

const httpMethods = ["GET", "POST", "DELETE", "PATCH", "PUT"] as const;

type Method = typeof httpMethods[number];

type AsRouteParam<Name extends string | number | symbol> = Name extends
  `[[${infer P}]]` ? P : Name extends `[${infer P}]` ? P : never;

export const fileRouter = defineBuilder(async (
  route: Build,
  base: string,
): Promise<void> => route.use(scanDir, base, []));

const routeRegExp = /^((?:(.+)\.)?route)\.(tsx?|css)$/;

const scanDir = defineBuilder(async (
  parentBuild: Build,
  baseDir: string,
  parentSegments: string[],
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

  const addRouteFile = defineBuilder(
    async (baseBuilder: Build, fileName: string) => {
      const path = join(...parentSegments, fileName);
      const cwdFilePath = join(baseDir, path);

      const url = toFileUrl(resolve(cwdFilePath)).href;

      const { default: mod }: { default: FileRoute<unknown> } = await import(
        url
      )
        .catch((e) => {
          throw new Error(`Failed importing ${url}: ` + e.message);
        });
      if (!mod || !(mod instanceof FileBuilder)) {
        throw new Error(`${url} must \`export default\` a file route builder`);
      }

      const fileMeta = Promise.withResolvers<FileBuildNodeMeta>();
      const fileMetaAsset = new Asset(async () => fileMeta.promise);

      const fileCtx = new FileBuildBuildContext(url, fileMetaAsset);
      const fileBuilder = new FileBuildBuild(
        fileCtx,
        [],
        (baseBuilder as BaseBuild).fork(),
      );

      fileBuilder.use(mod);
      const [mappings, meta] = await fileBuilder.close();

      for (const [method, pattern, ...params] of mappings) {
        baseBuilder.root(pattern).method(method, ...params);
      }

      fileMeta.resolve(meta.uses![0]);
    },
  );

  if (indexFile) {
    // ! \\ CSS First
    if (cssIndexFile) {
      const path = join(dir, cssIndexFile);
      parentBuild.use(pageCss, {
        css: await Deno.readFile(path),
        fileName: relative(baseDir, path),
      });
    }

    parentBuild.use(addRouteFile, indexFile);
  }

  // ! \\ CSS First
  for (const [name, routeName] of cssRouteFiles) {
    const path = join(dir, name);
    parentBuild.segment(segmentToURLPattern(routeName) + "/*")
      .use(pageCss, {
        css: await Deno.readFile(path),
        fileName: relative(baseDir, path),
      });
  }

  for (const [name, routeName] of routeFiles) {
    parentBuild.segment(segmentToURLPattern(routeName))
      .use(addRouteFile, name);
  }

  for (const name of directories) {
    parentBuild.segment(segmentToURLPattern(name))
      .use(scanDir, baseDir, [...parentSegments, name]);
  }
});

const segmentToURLPattern = (segment: string) => {
  const match = segment.match(/^\[(\.\.\.)?([^\]]+)\]$/);
  if (!match) return `/${segment}`;

  const [, spread, param] = match;
  if (spread) return `/:${param}*`;

  const optional = param?.match(/^\[(.+)\]$/)?.[1];
  return optional ? `{/:${optional}}?` : `/:${param}`;
};

export class FileBuilder<
  F extends (build: FileBuild<any>, ...args: never[]) => unknown,
> extends Builder<F> {
  constructor(f: F) {
    super(f);
  }
}

export const defineFileBuilder = <
  F extends <Params>(build: FileBuild<Params>, ...args: never[]) => unknown,
>(fn: F): FileBuilder<F> => new FileBuilder(fn);

export const route: {
  <ParamStr extends string, Params>(
    segment: ParamStr,
    fileRoute: FileRouteFn<Params & RouteParams<ParamStr>>,
  ): FileRoute<Params & RouteParams<ParamStr>>;
  <F extends FileRouteFn<any>>(fileRoute: F): FileRoute<F>;
} = <ParamStr extends string, Params>(
  segment: ParamStr | FileRouteFn<Params>,
  fileRoute?: FileRouteFn<Params & RouteParams<ParamStr>>,
): FileRoute<Params & RouteParams<ParamStr>> =>
  new FileBuilder(
    fileRoute
      ? (r) => fileRoute(r.segment(segment as ParamStr))
      : segment as FileRouteFn<Params & RouteParams<ParamStr>>,
  );

type RouteParams<T extends string> = T extends `${"" | "/"}:${infer P}`
  ? { [param in P]: string }
  : { [n in never]: never };

type FileRouteFn<Params> = <P extends Params>(r: FileBuild<P>) => Async<void>;

export type FileRoute<Params> = FileBuilder<FileRouteFn<Params>>;

export const GET = defineFileBuilder(<Params>(
  builder: FileBuild<Params>,
  handler: (req: MiddlewareContext<Params>) => Async<void | Response>,
): void => builder.method("GET", handler));

export const POST = defineFileBuilder(<Params>(
  builder: FileBuild<Params>,
  handler: (req: MiddlewareContext<Params>) => Async<void | Response>,
): void => builder.method("POST", handler));

export interface FileBuild<Params> extends Build {
  segment<P extends string>(
    segment?: P,
  ): FileBuild<Params & RouteParams<P>>;

  use<T>(key: Key<T>): T;
  use<F extends (build: Context, ...args: never[]) => unknown>(
    use: F,
    ...args: Parameters1N<F>
  ): ReturnType<F>;
  use<
    B extends FileBuilder<
      (build: FileBuild<Params>, ...args: never[]) => unknown
    >,
  >(use: B, ...args: BuilderParams<B>): BuilderReturnType<B>;
  use<
    B extends Builder<(build: Build, ...args: never[]) => Async<Stringifiable>>,
  >(
    use: B,
    ...args: BuilderParams<B>
  ): Promise<Awaited<BuilderReturnType<B>>>;

  method(
    method: Method,
    handler: (req: MiddlewareContext<Params>) => Async<void | Response>,
  ): void;
  method(
    method: Method,
    module: string,
    ...params: Readonly<HandlerParam>[]
  ): void;
}

class FileBuildBuildContext {
  readonly context = createContext();
  handlerIndex = 0;

  constructor(
    public readonly modulePath: string,
    public readonly metaAsset: Asset,
  ) {}
}

class FileBuildBuild<Params> implements FileBuild<Params> {
  constructor(
    context: FileBuildBuildContext,
    handlerPath: number[],
    build: BaseBuild,
    node = new FileBuildNode(),
    queue = new Queue(),
  ) {
    this.#context = context;
    this.#build = build;
    this.#handlerPath = handlerPath;
    this.#node = node;
    this.#queue = queue;
  }

  readonly #context: FileBuildBuildContext;
  readonly #build: BaseBuild;

  readonly #handlerPath: number[];

  readonly #node: FileBuildNode;
  readonly #queue: Queue;

  has<T>(key: Key<T>): boolean {
    return this.#context.context.has(key);
  }

  get<T>(key: Key<T>): T | undefined {
    return this.#context.context.get(key);
  }

  provide<K extends Key<unknown>>(
    key: K,
    value: K extends Key<infer T> ? T : never,
  ): K extends Key<infer T> ? T : never {
    return this.#context.context.provide(key, value);
  }

  delete<T>(key: Key<T>): void {
    this.#context.context.delete(key);
  }

  root<P extends string>(pattern: P): FileBuildBuild<RouteParams<P>> {
    return new FileBuildBuild<RouteParams<P>>(
      this.#context,
      this.#handlerPath,
      this.#build.root(pattern),
      this.#node,
      this.#queue,
    );
  }

  segment<P extends string>(
    segment?: P,
  ): FileBuildBuild<Params & RouteParams<P>> {
    return new FileBuildBuild<Params & RouteParams<P>>(
      this.#context,
      this.#handlerPath,
      this.#build.segment(segment),
      this.#node,
      this.#queue,
    );
  }

  use<T>(key: Key<T>): T;
  use<F extends (build: Context, ...args: never[]) => unknown>(
    use: F,
    ...args: Parameters1N<F>
  ): ReturnType<F>;
  use<
    B extends FileBuilder<
      (build: FileBuild<Params>, ...args: never[]) => unknown
    >,
  >(use: B, ...args: BuilderParams<B>): BuilderReturnType<B>;
  use<
    B extends Builder<(build: Build, ...args: never[]) => Async<Stringifiable>>,
  >(
    use: B,
    ...args: BuilderParams<B>
  ): Promise<Awaited<BuilderReturnType<B>>>;
  use(
    builder:
      | Key<unknown>
      | ((ctx: Context, ...args: never[]) => unknown)
      | FileBuilder<(build: FileBuild<Params>, ...args: never[]) => unknown>
      | Builder<(build: Build, ...args: never[]) => Async<Stringifiable>>,
    ...args: never[]
  ): unknown {
    if (builder instanceof FileBuilder) {
      const subCtx = new FileBuildBuild<Params>(
        this.#context,
        [...this.#handlerPath, this.#node.useIndex++],
        this.#build.fork(),
      );
      const used = builder.fn(subCtx, ...args);

      this.#queue.queue(async () => {
        await used;
        const [mappings, meta] = await subCtx.close();

        for (const [method, pattern, module, ...params] of mappings) {
          this.#build.root(pattern).method(method, module, ...params);
        }

        this.#node.uses.push(meta);
      });

      return used;
    } else if (builder instanceof Builder) {
      const meta = this.#build.use(builder);
      this.asset(() => meta);
      return Promise.resolve(meta);
    } else if (typeof builder === "function") {
      return this.#context.context.use(builder);
    } else {
      return this.#context.context.use(builder);
    }
  }

  method(
    method: Method,
    module: string,
    ...params: Readonly<HandlerParam>[]
  ): void;
  method(
    method: Method,
    handler: (req: MiddlewareContext<Params>) => Async<void | Response>,
  ): void;
  method(
    method: Method,
    handler:
      | string
      | ((req: MiddlewareContext<Params>) => Async<void | Response>),
    ...params: Readonly<HandlerParam>[]
  ): void {
    this.#queue.queue(() => {
      if (typeof handler === "string") {
        this.#build.method(method, handler, ...params);
      } else {
        this.#build.method(
          method,
          import.meta.url,
          this.#context.modulePath,
          this.#context.metaAsset,
          [...this.#handlerPath, this.#node.handlerIndex++],
        );
      }
    });
  }

  asset(
    contents: () => Async<Stringifiable | Uint8Array>,
    opts?: { hint?: string },
  ): Asset {
    const asset = new Asset(contents, opts?.hint);
    this.#node.assets.push(asset);
    return asset;
  }

  get pattern(): string {
    return this.#build.pattern;
  }

  async close() {
    await this.#queue.close();
    const mappings = await this.#build.close();
    return [mappings, this.#node.toMeta()] as const;
  }
}

/**
 * Multiple segments can share the same node.
 *
 * `use`ing forks into a new node.
 */
class FileBuildNode {
  useIndex = 0;
  handlerIndex = 0;

  constructor(
    public uses: FileBuildNodeMeta[] = [],
    public assets: Asset[] = [],
  ) {}

  toMeta(): FileBuildNodeMeta {
    const meta: FileBuildNodeMeta = {};
    if (this.uses.length > 0) meta.uses = this.uses;
    if (this.assets.length > 0) meta.assets = this.assets;
    return meta;
  }

  static fromMeta(meta: FileBuildNodeMeta): FileBuildNode {
    return new FileBuildNode(
      meta.uses?.slice(),
      meta.assets?.slice(),
    );
  }
}

type FileBuildNodeMeta = {
  uses?: readonly FileBuildNodeMeta[];
  assets?: readonly Asset[];
};

class FileBuildRuntimeContext {
  constructor(
    public ctx: MiddlewareContext<unknown>,
    public resolve: (res: Async<Response | void>) => void,
  ) {}
}

class FileBuildRuntime<Params> implements FileBuild<Params> {
  constructor(
    context: FileBuildRuntimeContext,
    pattern: string,
    node: FileBuildNode | undefined,
    handlerPath: readonly number[],
  ) {
    this.#context = context;
    this.#pattern = pattern;
    this.#node = node ?? new FileBuildNode();
    this.#handlerPath = handlerPath;
  }

  readonly #context: FileBuildRuntimeContext;
  readonly #pattern: string;
  readonly #node: FileBuildNode;
  readonly #handlerPath: readonly number[];

  has<T>(key: Key<T>): boolean {
    return this.#context.ctx.has(key);
  }

  get<T>(key: Key<T>): T | undefined {
    return this.#context.ctx.get(key);
  }

  provide<K extends Key<unknown>>(
    key: K,
    value: K extends Key<infer T> ? T : never,
  ): K extends Key<infer T> ? T : never {
    return this.#context.ctx.provide(key, value);
  }

  delete<T>(key: Key<T>): void {
    this.#context.ctx.delete(key);
  }

  root(pattern: string): Build {
    return new FileBuildRuntime(
      this.#context,
      pattern,
      this.#node,
      this.#handlerPath,
    );
  }

  segment<P extends string>(
    segment?: P,
  ): FileBuildRuntime<Params & RouteParams<P>> {
    if (!segment) return this as FileBuildRuntime<Params & RouteParams<P>>;
    return new FileBuildRuntime<Params & RouteParams<P>>(
      this.#context,
      this.#pattern + segment,
      this.#node,
      this.#handlerPath,
    );
  }

  use<T>(key: Key<T>): T;
  use<F extends (build: Context, ...args: never[]) => unknown>(
    use: F,
    ...args: Parameters1N<F>
  ): ReturnType<F>;
  use<
    B extends FileBuilder<
      (build: FileBuild<Params>, ...args: never[]) => unknown
    >,
  >(use: B, ...args: BuilderParams<B>): BuilderReturnType<B>;
  use<
    B extends Builder<(build: Build, ...args: never[]) => Async<Stringifiable>>,
  >(
    build: B,
    ...args: BuilderParams<B>
  ): Promise<Awaited<BuilderReturnType<B>>>;
  use(
    build:
      | Key<unknown>
      | ((context: Context, ...args: never[]) => unknown)
      | Builder<(context: FileBuild<Params>, ...args: never[]) => unknown>,
    ...args: never[]
  ): unknown {
    if (build instanceof FileBuilder) {
      const useIndex = this.#node.useIndex++;
      const nodeMeta = this.#node.uses[useIndex];
      const subCtx = new FileBuildRuntime<Params>(
        this.#context,
        this.#pattern,
        nodeMeta ? FileBuildNode.fromMeta(nodeMeta) : undefined,
        this.#handlerPath.length > 1 &&
          this.#handlerPath[0] === useIndex
          ? this.#handlerPath.slice(1)
          : [],
      );
      return build.fn(subCtx, ...args);
    } else if (build instanceof Builder) {
      return this.asset(null!).contents();
    } else if (typeof build === "function") {
      return this.#context.ctx.use(build);
    } else {
      return this.#context.ctx.use(build);
    }
  }

  method(
    method: Method,
    module: string,
    ...params: Readonly<HandlerParam>[]
  ): void;
  method(
    method: Method,
    handler: (req: MiddlewareContext<Params>) => Async<void | Response>,
  ): void;
  method(
    _: Method,
    handler:
      | string
      | ((req: MiddlewareContext<Params>) => Async<void | Response>),
  ): void {
    if (
      typeof handler !== "string" &&
      this.#handlerPath.length === 1 &&
      this.#handlerPath[0] === this.#node.handlerIndex++
    ) {
      this.#context.resolve(
        handler(this.#context.ctx as MiddlewareContext<Params>),
      );
    }
  }

  asset(
    _contents: () => Async<Stringifiable | Uint8Array>,
    _opts?: { hint?: string },
  ): Asset {
    return this.#node.assets.shift()!;
  }

  get pattern(): string {
    return this.#pattern;
  }
}

export default async (
  modulePath: string,
  metaAsset: Asset<FileBuildNodeMeta>,
  handlerPath: readonly number[],
): Promise<Middleware> => {
  const route = await import(modulePath)
    .then(({ default: route }) =>
      route as FileBuilder<(r: FileBuild<Empty>) => Async<void>>
    )
    .catch((e) => {
      console.info("Failed importing %s - see below", modulePath);
      throw e;
    });

  return async (ctx) => {
    const meta = {
      uses: [await metaAsset.contents()],
    };

    const res = Promise.withResolvers<Response | void>();

    new FileBuildRuntime(
      new FileBuildRuntimeContext(ctx, res.resolve),
      ctx.matchedPattern,
      FileBuildNode.fromMeta(meta),
      handlerPath,
    )
      .use(route);

    return res.promise;
  };
};
