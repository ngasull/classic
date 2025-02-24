import { join, relative, resolve, toFileUrl } from "@std/path";
import type { Stringifiable } from "../js/stringify.ts";
import { Asset, type AssetContents } from "./asset.ts";
import { type Build, Queue } from "./build.ts";
import { createContext, type Parameters1N } from "./context.ts";
import { pageCss } from "./file-router/page.css.ts";
import {
  type FileBuild,
  FileBuildNode,
  type FileBuildNodeMeta,
  type RouteParams,
} from "./file-router-serve.ts";
import type { Key } from "./key.ts";
import type { Async } from "./mod.ts";
import type { ClassicRequest } from "./request.ts";
import type { Method, RequestMapping } from "./server.ts";

export const fileRouter = async (
  route: Build,
  base: string,
): Promise<void> => route.use(scanDir, base, []);

const routeRegExp = /^((?:(.+)\.)?route)\.(tsx?|css)$/;

const scanDir = async (
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

  const addRouteFile = async (build: Build, fileName: string) => {
    const path = join(...parentSegments, fileName);
    const cwdFilePath = join(baseDir, path);

    const url = toFileUrl(resolve(cwdFilePath)).href;

    const { default: mod }: { default: FileRoute<unknown> } = await import(
      url
    )
      .catch((e) => {
        throw new Error(`Failed importing ${url}: ` + e.message);
      });
    if (!mod || typeof mod !== "function") {
      throw new Error(`${url} must \`export default\` a file route builder`);
    }

    const fileMeta = Promise.withResolvers<FileBuildNodeMeta>();
    const fileMetaAsset = new Asset(async () => fileMeta.promise);
    const [, built] = FileBuildBuild.use(
      new FileBuildBuildContext(url, fileMetaAsset),
      build,
      [],
      mod,
    );
    const [mappings, meta] = await built;

    for (const [method, pattern, ...params] of mappings) {
      build.root(pattern).method(method, ...params);
    }

    fileMeta.resolve(meta);
  };

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
    fileRoute: FileRouteFn<Params & RouteParams<ParamStr>>,
  ): FileRoute<Params & RouteParams<ParamStr>>;
  <F extends FileRouteFn<any>>(fileRoute: F): FileRoute<F>;
} = <ParamStr extends string, Params>(
  segment: ParamStr | FileRouteFn<Params>,
  fileRoute?: FileRouteFn<Params & RouteParams<ParamStr>>,
): FileRoute<Params & RouteParams<ParamStr>> =>
  fileRoute
    ? (r) => fileRoute(r.segment(segment as ParamStr))
    : segment as FileRouteFn<Params & RouteParams<ParamStr>>;

type FileRouteFn<Params> = <P extends Params>(r: FileBuild<P>) => Async<void>;

export type FileRoute<Params> = FileRouteFn<Params>;

export const GET = <Params>(
  builder: FileBuild<Params>,
  handler: (req: ClassicRequest<Params>) => Async<void | Response>,
): void => builder.method("GET", handler);

export const POST = <Params>(
  builder: FileBuild<Params>,
  handler: (req: ClassicRequest<Params>) => Async<void | Response>,
): void => builder.method("POST", handler);

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
    build: Build,
    handlerPath: number[],
    node: FileBuildNode,
    queue: Queue,
  ) {
    this.#context = context;
    this.#build = build;
    this.#handlerPath = handlerPath;
    this.#node = node;
    this.#queue = queue;
  }

  readonly #context: FileBuildBuildContext;
  readonly #build: Build;

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
      this.#build.root(pattern),
      this.#handlerPath,
      this.#node,
      this.#queue,
    );
  }

  segment<P extends string>(
    segment?: P,
  ): FileBuildBuild<Params & RouteParams<P>> {
    return new FileBuildBuild<Params & RouteParams<P>>(
      this.#context,
      this.#build.segment(segment),
      this.#handlerPath,
      this.#node,
      this.#queue,
    );
  }

  build<
    B extends (build: Build, ...args: never[]) => Async<Stringifiable | void>,
  >(
    use: B,
    ...args: Parameters1N<B>
  ): Promise<Awaited<ReturnType<B>>> {
    const meta = this.#queue.queue(() => this.#build.use(use, ...args));
    this.asset(() => meta);
    return Promise.resolve(meta);
  }

  asset<T extends Stringifiable | Uint8Array>(
    contents: AssetContents<T>,
    opts?: { hint?: string },
  ): Asset<T> {
    const asset = this.#build.asset(contents, opts);
    this.#node.assets.push(asset);
    return asset;
  }

  use<B extends (build: FileBuild<Params>, ...args: never[]) => unknown>(
    use: B,
    ...args: Parameters1N<B>
  ): ReturnType<B> {
    const [used, built] = FileBuildBuild.use<Params, B>(
      this.#context,
      this.#build,
      [...this.#handlerPath, this.#node.useIndex++],
      use,
      ...args,
    );

    this.#queue.queue(async () => {
      const [mappings, meta] = await built;

      for (const [method, pattern, module, ...params] of mappings) {
        this.#build.root(pattern).method(method, module, ...params);
      }

      this.#node.uses.push(meta);
    });

    return used;
  }

  method(
    method: Method,
    _handler: (req: ClassicRequest<Params>) => Async<void | Response>,
  ): void {
    this.#queue.queue(() => {
      this.#build.method(
        method,
        import.meta.resolve("./file-router-serve.ts"),
        this.#context.modulePath,
        this.#context.metaAsset,
        [...this.#handlerPath, this.#node.handlerIndex++],
      );
    });
  }

  get pattern(): string {
    return this.#build.pattern;
  }

  static use<
    Params,
    B extends (build: FileBuild<Params>, ...args: never[]) => unknown,
  >(
    context: FileBuildBuildContext,
    build: Build,
    handlerPath: number[],
    use: B,
    ...args: Parameters1N<B>
  ): [ReturnType<B>, Promise<[RequestMapping[], FileBuildNodeMeta]>] {
    const node = new FileBuildNode();
    const queue = new Queue();
    const mappings: RequestMapping[] = [];
    const fileBuild = new FileBuildBuild<Params>(
      context,
      build,
      handlerPath,
      node,
      queue,
    );
    const used = use(fileBuild, ...args) as ReturnType<B>;
    return [
      used,
      (async () => {
        await used;
        await queue.close();
        return [mappings, node.toMeta()];
      })(),
    ];
  }
}
