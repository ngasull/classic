import type { Stringifiable } from "../js/stringify.ts";
import type { Asset } from "./asset.ts";
import type { Build } from "./build.ts";
import type { Parameters1N } from "./context.ts";
import type { Key } from "./key.ts";
import type { Async } from "./mod.ts";
import type { ClassicRequest, Middleware } from "./request.ts";
import type { HandlerParam, Method } from "./server.ts";

export type RouteParams<T extends string> = T extends `${"" | "/"}:${infer P}`
  ? { [param in P]: string }
  : { [n in never]: never };

/**
 * Multiple segments can share the same node.
 *
 * `use`ing forks into a new node.
 */
export class FileBuildNode {
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

export type FileBuildNodeMeta = {
  uses?: readonly FileBuildNodeMeta[];
  assets?: readonly Asset[];
};

class FileBuildRuntimeContext {
  constructor(
    public ctx: ClassicRequest<unknown>,
    public resolve: (res: Async<Response | void>) => void,
  ) {}
}

export interface FileBuild<Params> {
  root<P extends string>(pattern: P): FileBuild<RouteParams<P>>;

  segment<P extends string>(
    segment?: P,
  ): FileBuild<Params & RouteParams<P>>;

  build<
    B extends (build: Build, ...args: never[]) => Async<Stringifiable | void>,
  >(
    use: B,
    ...args: Parameters1N<B>
  ): Promise<Awaited<ReturnType<B>>>;

  use<B extends (build: FileBuild<Params>, ...args: never[]) => unknown>(
    use: B,
    ...args: Parameters1N<B>
  ): ReturnType<B>;

  method(
    method: Method,
    handler: (req: ClassicRequest<Params>) => Async<void | Response>,
  ): void;
}

class FileBuildRuntime<Params> implements FileBuild<Params> {
  constructor(
    context: FileBuildRuntimeContext,
    pattern: string,
    node: FileBuildNode | undefined,
    handlerPath?: readonly number[],
  ) {
    this.#context = context;
    this.#pattern = pattern;
    this.#node = node ?? new FileBuildNode();
    this.#handlerPath = handlerPath;
  }

  readonly #context: FileBuildRuntimeContext;
  readonly #pattern: string;
  readonly #node: FileBuildNode;
  readonly #handlerPath?: readonly number[];

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

  root<P extends string>(pattern: P): FileBuild<RouteParams<P>> {
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

  build<
    B extends (build: Build, ...args: never[]) => Async<Stringifiable | void>,
  >(
    _use: B,
    ..._args: Parameters1N<B>
  ): Promise<Awaited<ReturnType<B>>> {
    return this.asset<Awaited<ReturnType<B>>>(null!).contents();
  }

  asset<T extends Stringifiable | Uint8Array>(
    _contents: () => Async<T>,
    _opts?: { hint?: string },
  ): Asset<T> {
    return this.#node.assets.shift()! as Asset<T>;
  }

  use<B extends (build: FileBuild<Params>, ...args: never[]) => unknown>(
    use: B,
    ...args: Parameters1N<B>
  ): ReturnType<B> {
    const useIndex = this.#node.useIndex++;
    const nodeMeta = this.#node.uses[useIndex];
    const subCtx = new FileBuildRuntime<Params>(
      this.#context,
      this.#pattern,
      nodeMeta ? FileBuildNode.fromMeta(nodeMeta) : undefined,
      this.#handlerPath?.length &&
        this.#handlerPath[0] === useIndex
        ? this.#handlerPath.slice(1)
        : undefined,
    );
    return use(subCtx, ...args) as ReturnType<B>;
  }

  method(
    method: Method,
    module: string,
    ...params: Readonly<HandlerParam>[]
  ): void;
  method(
    method: Method,
    handler: (req: ClassicRequest<Params>) => Async<void | Response>,
  ): void;
  method(
    _: Method,
    handler:
      | string
      | ((req: ClassicRequest<Params>) => Async<void | Response>),
  ): void {
    if (
      typeof handler !== "string" &&
      this.#handlerPath?.length === 1 &&
      this.#handlerPath[0] === this.#node.handlerIndex++
    ) {
      this.#context.resolve(
        handler(this.#context.ctx as ClassicRequest<Params>),
      );
    }
  }

  get pattern(): string {
    return this.#pattern;
  }
}

export default async <Params>(
  modulePath: string,
  metaAsset: Asset<FileBuildNodeMeta>,
  handlerPath: readonly number[],
): Promise<Middleware> => {
  const route = await import(modulePath)
    .then(({ default: route }) =>
      route as (r: FileBuild<Params>) => Async<void>
    )
    .catch((e) => {
      console.info("Failed importing %s - see below", modulePath);
      throw e;
    });

  const wrappedNode = FileBuildNode.fromMeta({
    uses: [await metaAsset.contents()],
  });
  const wrappedPath = [0, ...handlerPath];

  return async (ctx) => {
    let res: Async<Response | void> | undefined;

    await new FileBuildRuntime<Params>(
      new FileBuildRuntimeContext(ctx, (r) => {
        res = r;
      }),
      ctx.matchedPattern,
      wrappedNode,
      wrappedPath,
    ).use(route);

    if (!res) console.warn(`File route didn't hit any handler`);
    return res;
  };
};
