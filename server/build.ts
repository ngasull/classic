import type { JSONable } from "../js/types.ts";
import { type Context, createContext } from "./context.ts";
import type { Key } from "./key.ts";
import { ClassicRuntime } from "./middleware.ts";
import type { Async } from "./mod.ts";

/**
 * @module
 * Build system designed for backends.
 * No need for a central config like other tools such as Vite.
 */

/**
 * Build function wrapper
 *
 * Implementors contain information about when to run.
 */
export abstract class Builder<F> {
  constructor(public readonly fn: F) {}
}

export type BuilderParams<B> = B extends
  Builder<(_: never, ...args: infer Args) => unknown> ? Args : never;

export type BuilderReturnType<B> = B extends
  Builder<(_: never, ...args: never[]) => infer R> ? R : never;

class BaseBuilder<F extends (build: Build, ...args: never[]) => unknown>
  extends Builder<F> {
  constructor(f: F) {
    super(f);
  }
}

export const defineBuilder = <
  F extends (build: Build, ...args: never[]) => unknown,
>(fn: F): Builder<F> => new BaseBuilder(fn);

type Method = "GET" | "POST" | "DELETE" | "PATCH" | "PUT";

type MiddlewareReturnType = Response | void | null;

export type HandlerParam = JSONable | undefined;

export type RequestMapping = [
  Method,
  string,
  string,
  ...Readonly<HandlerParam>[],
];

type BuilderMapping = [Method, string, Readonly<HandlerParam>[]];

const throwIfRelative = (module: string) => {
  if (/^\.\.?\//.test(module)) {
    throw Error(`Can't import module relatively: ${module}`);
  }
};

export const build = async (
  builder:
    | ((route: Build) => Async<void>)
    | Builder<(route: Build) => Async<void>>,
): Promise<ClassicRuntime> => {
  const context = new BuildContext();
  const build = new BaseBuild(context, "");

  build.use(typeof builder === "function" ? defineBuilder(builder) : builder);
  const mappings = await build.close();

  return new ClassicRuntime(mappings, context.assets);
};

export class Queue {
  #closed = false;
  #last: Promise<unknown> = Promise.resolve();

  queue<T>(cb: () => T): Promise<Awaited<T>> {
    if (this.#closed) throw Error(`Queue is closed`);
    return this.#last = this.#last.then(cb) as Promise<Awaited<T>>;
  }

  async close(): Promise<void> {
    this.#closed = true;
    await this.#last;
  }
}

class BuildContext {
  readonly assets: Array<[string, () => Async<string | Uint8Array>]> = [];
  readonly context = createContext();

  readonly #assetKeys = new Set<string>();

  addAsset(
    contents: () => Async<string | Uint8Array>,
    { hint = `${this.assets.length}` }: { hint?: string } = {},
  ) {
    let i = null;
    let key: string;
    while (this.#assetKeys.has(key = i == null ? hint : hint + i++));
    this.#assetKeys.add(key);
    this.assets.push([key, contents]);
    return this.assets.length - 1;
  }
}

export interface Build extends Omit<Context, "use" | "root"> {
  root(pattern: string): Build;

  use<T>(key: Key<T>): Promise<Awaited<T>>;
  use<B extends Builder<(build: Build, ...args: never[]) => unknown>>(
    use: B,
    ...args: BuilderParams<B>
  ): BuilderReturnType<B>;

  segment(segment?: string): Build;

  method(
    method: Method,
    module: string,
    ...params: Readonly<HandlerParam>[]
  ): void;

  asset(
    contents: () => Async<string | Uint8Array>,
    opts?: { hint?: string },
  ): number;

  readonly pattern: string;
}

export class BaseBuild implements Build {
  constructor(
    context: BuildContext,
    pattern: string,
    mappings: RequestMapping[] = [],
    queue: Queue = new Queue(),
  ) {
    this.#context = context;
    this.#pattern = pattern;
    this.#mappings = mappings;
    this.#queue = queue;
  }

  readonly #context: BuildContext;
  readonly #pattern: string;
  readonly #mappings: RequestMapping[];
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

  use<T>(key: Key<T>): Promise<Awaited<T>>;
  use<B extends Builder<(build: Build, ...args: never[]) => unknown>>(
    use: B,
    ...args: BuilderParams<B>
  ): BuilderReturnType<B>;
  use(
    use:
      | Key<unknown>
      | Builder<(build: Build, ...args: never[]) => unknown>,
    ...args: never[]
  ) {
    if (use instanceof Builder) {
      const subBuild = new BaseBuild(this.#context, this.#pattern);
      const used = use.fn(subBuild, ...args);

      this.#queue.queue(async () => {
        await used;
        this.#mappings.push(...await subBuild.close());
      });

      return used;
    } else {
      return this.#context.context.use(use);
    }
  }

  root(pattern: string): BaseBuild {
    return new BaseBuild(this.#context, pattern, this.#mappings, this.#queue);
  }

  segment(segment?: string): BaseBuild {
    return new BaseBuild(
      this.#context,
      segment ? this.#pattern + segment : this.#pattern,
      this.#mappings,
      this.#queue,
    );
  }

  method(
    method: Method,
    module: string,
    ...params: Readonly<HandlerParam>[]
  ): void {
    throwIfRelative(module);
    this.#queue.queue(() => {
      this.#mappings.push([method, this.pattern, module, ...params]);
    });
  }

  asset(
    contents: () => Async<string | Uint8Array>,
    opts?: { hint?: string },
  ): number {
    return this.#context.addAsset(contents, opts);
  }

  get pattern(): string {
    return this.#pattern || "/";
  }

  fork() {
    return new BaseBuild(this.#context, this.#pattern);
  }

  async close() {
    await this.#queue.close();
    return this.#mappings;
  }
}

export type BuildMeta = {
  mappings: RequestMapping[];
  assets: string[];
};
