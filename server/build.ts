import type { JSONable } from "../js/types.ts";
import { Context } from "./context.ts";
import { RuntimeContext } from "./middleware.ts";

/**
 * @module
 * Build system designed for backends.
 * No need for a central config like other tools such as Vite.
 */

type Async<T> = T | PromiseLike<T>;

export type BuildFunction<R = void> = (route: BuildRoute) => Async<R>;

type Method = "GET" | "POST" | "DELETE" | "PATCH" | "PUT";

type MiddlewareReturnType = Response | void | null;

export type HandlerParam = JSONable | undefined;

export type RequestMapping = [Method, string, string, ...HandlerParam[]];

const throwIfRelative = (module: string) => {
  if (/^\.\.?\//.test(module)) {
    throw Error(`Can't import module relatively: ${module}`);
  }
};

export const build = async (plugin: BuildFunction): Promise<RuntimeContext> => {
  const build = new Build();
  await plugin(new BuildRoute(build, []));

  const result = await build.build();
  await build[$trigger](Phase.RESULT, result);
  return result;
};

enum Phase {
  INIT = 0,
  RESULT = -1,
}

const $trigger = Symbol("trigger");

export class Build {
  readonly #mappings: RequestMapping[] = [];
  readonly #assets = new Map<string, () => Async<string | Uint8Array>>();
  #assetsHint = 0;
  readonly #callbacks = new Map<
    Phase,
    Set<(...args: readonly never[]) => void>
  >();

  method(
    method: Method,
    pattern: string,
    module: string,
    ...params: Readonly<HandlerParam>[]
  ): void {
    throwIfRelative(module);
    this.#mappings.push([method, pattern, module, ...params as HandlerParam[]]);
  }

  asset(
    contents: () => Async<string | Uint8Array>,
    { hint = `${this.#assetsHint++}` }: { hint?: string } = {},
  ): string {
    let i = null;
    let key: string;
    while (this.#assets.has(key = i == null ? hint : hint + i++));
    this.#assets.set(key, contents);
    return key;
  }

  async build(): Promise<RuntimeContext> {
    return new RuntimeContext(this.#mappings, Object.fromEntries(this.#assets));
  }

  #on(phase: Phase, cb: (...args: readonly never[]) => void): void {
    let cbs = this.#callbacks.get(phase);
    if (!cbs) this.#callbacks.set(phase, cbs = new Set());
    cbs.add(cb);
  }

  /**
  Resolves first after every plugin initialized, before any other step
  */
  onInit(cb: () => void): void {
    return this.#on(Phase.INIT, cb);
  }

  /**
  Resolves after the build has compiled to a runtime context
  */
  onResult(cb: (result: RuntimeContext) => void) {
    return this.#on(Phase.RESULT, cb);
  }

  async [$trigger](phase: Phase, ...args: readonly unknown[]): Promise<void> {
    const cbs = this.#callbacks.get(phase);
    if (cbs) {
      await Promise.all([...cbs].map((cb) => cb(...args as readonly never[])));
    }
  }
}

export type { BuildRoute };

class BuildRoute extends Context {
  // deno-lint-ignore constructor-super
  constructor(
    parent: BuildRoute | Build,
    parentSegments: readonly string[],
  ) {
    if (parent instanceof BuildRoute) {
      super(parent);
      this.build = parent.build;
    } else {
      super();
      this.build = parent;
    }

    this.#parentSegments = parentSegments;
  }

  readonly build: Build;
  readonly #parentSegments: readonly string[];

  segment(segment?: string): BuildRoute {
    const api = segment
      ? new BuildRoute(this, [...this.#parentSegments, segment])
      : new BuildRoute(this, this.#parentSegments);
    return api;
  }

  method(
    method: Method,
    module: string,
    ...params: Readonly<HandlerParam>[]
  ): void {
    return this.build.method(
      method,
      this.#parentSegments.join("").replace(/\/$/, "") || "/",
      module,
      ...params,
    );
  }

  get pattern(): string {
    return this.#parentSegments.join("");
  }
}

export type BuildMeta = {
  mappings: RequestMapping[];
  assets: string[];
};

// class SortedValues<T> {
//   readonly #indices: number[] = [];
//   readonly #values: T[][] = [];

//   insert(index: number, value: T): void {
//     for (let i = 0; i < this.#indices.length; i++) {
//       if (this.#indices[i] === index) {
//         this.#values[i].push(value);
//         return;
//       } else if (index < this.#indices[i]) {
//         this.#indices.splice(i, 0, index);
//         this.#values.splice(i, 0, [value]);
//         return;
//       }
//     }
//     this.#indices.push(index);
//     this.#values.push([value]);
//   }

//   shift(): [number, T[]] | undefined {
//     const index = this.#indices.shift();
//     const values = this.#values.shift();
//     return values ? [index!, values] : undefined;
//   }
// }
