/**
 * Type-safe dynamic runtime state API.
 *
 * 1. Declare a key for a specific runtime type
 * 2. Provide the typed data in an async closure
 * 3. Retrieve data directly in user modules
 *
 * @example End-to-end declare, provide & use summary
 * ```ts
 * import { Context } from "@classic/context";
 * import { assert } from "@std/assert";
 *
 * type User = {
 *   id: bigint;
 *   name: string;
 * };
 *
 * // Shared code - export this key to provider and consumers
 * export const $user = Context.for<User>("user");
 *
 * // Provider code
 * const john = {
 *   id: 42n,
 *   name: "John",
 * };
 *
 * $user.provide(john, () => {
 *   // Consumer code - `user` is correctly typed as `User`
 *   assert($user.use() === john);
 * });
 * ```
 *
 * @example Use functions: expect context transparently in custom logic
 * ```ts
 * import { Context } from "@classic/context";
 * import { assert } from "@std/assert";
 *
 * type User = {
 *   id: bigint;
 *   name: string;
 * };
 *
 * export const $user = Context.for<User>("user");
 * export const getUserId = () => $user.use().id;
 *
 * // Provider code
 * $user.provide({ id: 42n, name: "John" }, () => {
 *   // Looks the same, but only exposes read access
 *   assert(getUserId() === 42n);
 * });
 * ```
 *
 * @example Safe or optional context access
 * ```ts
 * import { Context } from "@classic/context";
 * import { assert, assertThrows } from "@std/assert";
 *
 * export const $sessionId = Context.for<string>("sessionId");
 *
 * assertThrows(() => $sessionId.use());
 * assert($sessionId.get() === undefined);
 * ```
 *
 * @module
 */

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Declare a context by reference
 *
 * @param key Optional hint to describe the context
 */
const Context = <T>(key?: string): ContextApi<T> => new ContextApi<T>(key);

/**
 * Declare a uniquely global context by key
 *
 * @param key Required key to identify the context
 */
Context.for = <T>(key: string): ContextApi<T> => {
  const existing = contextStore[key]?.deref();
  if (existing) return existing as ContextApi<T>;

  const context = new ContextApi<T>(key);

  globalStoreFinalizer.register(context, key);
  contextStore[key] = new WeakRef(context as ContextApi<unknown>);

  return context;
};

/**
 * Retrieve the key or hint from a context
 *
 * @param context Context to retrieve key from
 */
Context.keyFor = (context: ContextApi<unknown>): string | undefined => {
  return context[$key];
};

/**
 * Take a snapshot from current context's state.
 * Returns a runner that restores captured state.
 */
Context.snapshot = (): <Args extends unknown[], R>(
  cb: (...args: Args) => R,
  ...args: Args
) => R => AsyncLocalStorage.snapshot();

export { Context };

const $key = Symbol();

export type { ContextApi };

/** Asynchronous contexts API */
class ContextApi<T> {
  readonly #asyncStorage = new AsyncLocalStorage<T>();
  private readonly [$key]?: string;

  /** @internal */
  constructor(key?: string) {
    this[$key] = key;
  }

  /**
   * Provide a value retrievable in a function's async execution scope.
   *
   * @param value Contextual value
   * @param cb Function to provide context to
   * @params args Arguments to forward to `cb`
   */
  provide<Args extends unknown[], R>(
    value: T,
    cb: (...args: Args) => R,
    ...args: Args
  ): R {
    return this.#asyncStorage.run(value, cb, ...args);
  }

  /**
   * Remove any a parent occurence of this context from a function's async execution scope
   *
   * @param cb Function to deprive context to
   * @params args Arguments to forward to `cb`
   */
  deprive<Args extends unknown[], R>(
    cb: (...args: Args) => R,
    ...args: Args
  ): R {
    return this.#asyncStorage.exit(cb, ...args);
  }

  /**
   * Return contextual value if provided, `undefined` otherwise
   */
  get(): T | undefined {
    return this.#asyncStorage.getStore();
  }

  /**
   * Require contextual value, throws otherwise
   */
  use(): Exclude<T, undefined> {
    const value = this.#asyncStorage.getStore();
    if (value === undefined) {
      throw Error(
        `Can't retrieve context value ${
          JSON.stringify(this[$key])
        } while not running it`,
      );
    }
    return value as Exclude<T, undefined>;
  }

  /** @ignore */
  [Symbol.for("Deno.customInspect")](_opts: Deno.InspectOptions): string {
    return `Context(${this[$key] || ""})`;
  }
}

let contextStore: Record<string, WeakRef<ContextApi<unknown>>> =
  // @ts-ignore dynamically reference
  globalThis[Symbol.for("classic.contexts")] ??= {};

const globalStoreFinalizer = new FinalizationRegistry<string>((key) => {
  delete contextStore[key];
});
