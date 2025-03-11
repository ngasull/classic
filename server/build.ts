import type { Context, Key, UseArgs } from "@classic/context";
import type { Stringifiable } from "@classic/js/stringify";
import {
  ClassicServer,
  type HandlerParam,
  type Method,
  type RequestMapping,
} from "./runtime.ts";
import type { Async } from "./mod.ts";
import { Asset } from "./asset.ts";
import { Queue } from "./queue.ts";

/**
 * Build system designed for backends.
 * No need for a central config like other tools such as Vite.
 *
 * @module
 */

const throwIfRelative = (module: string) => {
  if (/^\.\.?\//.test(module)) {
    throw Error(`Can't import module relatively: ${module}`);
  }
};

export class ServerBuilder {
  constructor(
    builder: (build: Build) => Async<void>,
  ) {
    this.#server = (async () => {
      const [, mappings] = BaseBuild.use(new Map(), "", builder);
      return new ClassicServer(await mappings);
    })();
  }

  readonly #server: Promise<ClassicServer>;

  fetch = async (req: Request): Promise<Response> => {
    const runtime = await this.runtime;
    this.fetch = runtime.fetch;
    return runtime.fetch(req);
  };

  get runtime(): Promise<ClassicServer> {
    return this.#server;
  }

  async prebuild(path?: string): Promise<void> {
    const runtime = await this.runtime;
    await runtime.write(path);
  }
}

/**
 * Define a buildable server application
 *
 * @param builder The root builder
 */
export const defineServer = (
  builder: (build: Build) => Async<void>,
): ServerBuilder => {
  const server = new ServerBuilder(builder);

  if (Deno.args.includes("prebuild")) {
    server.prebuild();
  }

  return server;
};

// enum Phase {
//   INIT = 0,
//   RESULT = -1,
// }

// const $trigger = Symbol("trigger");

// export class Build {
//   readonly #mappings: RequestMapping[] = [];
//   readonly #assets = new Map<string, () => Async<string | Uint8Array>>();
//   #assetsHint = 0;
//   readonly #callbacks = new Map<
//     Phase,
//     Set<(...args: readonly never[]) => void>
//   >();

//   method(
//     method: Method,
//     pattern: string,
//     module: string,
//     ...params: Readonly<HandlerParam>[]
//   ): void {
//     throwIfRelative(module);
//     this.#mappings.push([method, pattern, module, ...params as HandlerParam[]]);
//   }

//   asset(
//     contents: () => Async<string | Uint8Array>,
//     { hint = `${this.#assetsHint++}` }: { hint?: string } = {},
//   ): string {
//     let i = null;
//     let key: string;
//     while (this.#assets.has(key = i == null ? hint : hint + i++));
//     this.#assets.set(key, contents);
//     return key;
//   }

//   async build(): Promise<RuntimeContext> {
//     return new RuntimeContext(this.#mappings, Object.fromEntries(this.#assets));
//   }

//   #on(phase: Phase, cb: (...args: readonly never[]) => void): void {
//     let cbs = this.#callbacks.get(phase);
//     if (!cbs) this.#callbacks.set(phase, cbs = new Set());
//     cbs.add(cb);
//   }

//   /**
//    * Resolves first after every plugin initialized, before any other step
//    */
//   onInit(cb: () => void): void {
//     return this.#on(Phase.INIT, cb);
//   }

//   /**
//    * Resolves after the build has compiled to a runtime context
//    */
//   onResult(cb: (result: RuntimeContext) => void) {
//     return this.#on(Phase.RESULT, cb);
//   }

//   async [$trigger](phase: Phase, ...args: readonly unknown[]): Promise<void> {
//     const cbs = this.#callbacks.get(phase);
//     if (cbs) {
//       await Promise.all([...cbs].map((cb) => cb(...args as readonly never[])));
//     }
//   }
// }

/**
 * User-facing builder API to interact with current build
 *
 * A `Build` is attached to a relative URL pattern
 */
export interface Build extends Omit<Context, "use" | "root"> {
  /**
   * Senquentially register a builder to run on the build
   *
   * @param builder Builder function
   * @params args `builder`'s extra arguments
   */
  use<B extends (build: Build, ...args: never[]) => unknown>(
    builder: B,
    ...args: UseArgs<B>
  ): ReturnType<B>;

  /**
   * Interact with the build from an absolute pattern
   *
   * @param segment Absolute pattern
   */
  root(pattern: string): Build;

  /**
   * Interact with the build from a relative segment
   *
   * @param segment Relative segment to append to current pattern
   */
  segment(segment?: string): Build;

  /**
   * Register an asset in the build to be required at runtime
   *
   * @param contents Asset loading logic
   * @param options Options
   */
  asset<T extends Stringifiable | Uint8Array>(
    contents: () => Async<T>,
    options?: BuildAssetOptions,
  ): Asset<T>;

  /**
   * Register a handler in the build to be required at runtime
   *
   * @param method HTTP method
   * @param module URL to the lazy-loaded handler module
   * @params params Parameters to pass to the handler
   */
  method(
    method: Method,
    module: string,
    ...params: Readonly<HandlerParam>[]
  ): void;

  /** Current pattern */
  readonly pattern: string;
}

/** Options for {@linkcode Build.asset} */
export interface BuildAssetOptions {
  /** Hint describing the asset (maintainance purpose) */
  hint?: string;
}

class BaseBuild implements Build {
  constructor(
    context: Map<Key<unknown>, unknown>,
    pattern: string,
    mappings: RequestMapping[],
    queue: Queue,
  ) {
    this.#context = context;
    this.#pattern = pattern;
    this.#mappings = mappings;
    this.#queue = queue;
  }

  readonly #context: Map<Key<unknown>, unknown>;
  readonly #pattern: string;
  readonly #mappings: RequestMapping[];
  readonly #queue: Queue;

  has<T>(key: Key<T>): boolean {
    return this.#context.has(key);
  }

  get<T>(key: Key<T>): T | undefined {
    return this.#context.get(key) as T | undefined;
  }

  provide<K extends Key<unknown>>(
    key: K,
    value: K extends Key<infer T> ? T : never,
  ): K extends Key<infer T> ? T : never {
    this.#context.set(key, value);
    return value;
  }

  delete<T>(key: Key<T>): void {
    this.#context.delete(key);
  }

  use<B extends (build: Build, ...args: never[]) => unknown>(
    use: B,
    ...args: UseArgs<B>
  ): ReturnType<B> {
    const [used, mappings] = BaseBuild.use(
      this.#context,
      this.#pattern,
      use,
      ...args,
    );

    this.#queue.queue(async () => {
      this.#mappings.push(...await mappings);
    });

    return used;
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

  asset<T extends Stringifiable | Uint8Array>(
    contents: () => Async<T>,
    opts?: { hint?: string },
  ): Asset<T> {
    return new Asset(contents, opts);
  }

  method(
    method: Method,
    module: string,
    ...params: Readonly<HandlerParam>[]
  ): void {
    if (this.#queue.closed) {
      throw Error(
        `Can't add ${method} ${this.pattern} -> ${module} in closed builder`,
      );
    }
    throwIfRelative(module);

    this.#queue.queue(() => {
      this.#mappings.push([method, this.pattern, module, ...params]);
    });
  }

  get pattern(): string {
    return this.#pattern || "/";
  }

  static use<B extends (build: Build, ...args: never[]) => unknown>(
    context: Map<Key<unknown>, unknown>,
    pattern: string,
    use: B,
    ...args: UseArgs<B>
  ): [ReturnType<B>, Promise<RequestMapping[]>] {
    const mappings: RequestMapping[] = [];
    const queue = new Queue();
    const build = new BaseBuild(context, pattern, mappings, queue);
    const used = use(build, ...args) as ReturnType<B>;
    return [
      used,
      (async () => {
        await used;
        await queue.close();
        return mappings;
      })(),
    ];
  }
}
