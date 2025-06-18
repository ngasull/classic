/**
 * # Classic context
 *
 * Type-safe dynamic runtime state API.
 *
 * 1. Declare a key for a specific runtime type
 * 2. Create a runtime context _(example: a context attached to a sever request's life cycle)
 * 3. Provide the typed data in the context
 * 4. Retrieve data in user modules
 *
 * ### Deriving contexts
 *
 * Sub-contexts can be created: they derive from their ancestors but won't modify them.
 * See related example.
 *
 * @example End-to-end declare, provide & use summary
 * ```ts ignore
 * import { Key } from "@classic/context/imperative";
 * import { assert } from "@std/assert";
 *
 * type User = {
 *   id: bigint;
 *   name: string;
 * };
 *
 * // Shared code - export this key to provider and consumers
 * export const $user = new Key<User>("user");
 *
 * // Provider code
 * import { createContext } from "@classic/context/imperative";
 *
 * const john = {
 *   id: 42n,
 *   name: "John",
 * };
 * const context = createContext();
 * context.provide($user, john);
 *
 * // Consumer code - `user` is correctly typed as `User`
 * const user = context.use($user);
 * assert(user === john);
 * ```
 *
 * @example Use functions: same consumer API, custom provider logic
 * ```ts ignore
 * import { type Context, createContext, Key } from "@classic/context/imperative";
 * import { assert } from "@std/assert";
 *
 * type User = {
 *   id: bigint;
 *   name: string;
 * };
 *
 * export const $user = new Key<User>("user");
 * export const $userId = (ctx: Context) => ctx.use($user).id;
 *
 * const context = createContext();
 * context.provide($user, {
 *   id: 42n,
 *   name: "John"
 * });
 *
 * // Looks the same, but abstracts logic over the context
 * const userId = context.use($userId);
 * assert(userId === 42n);
 * ```
 *
 * @example Safe or optional context access
 * ```ts ignore
 * import { createContext, Key } from "@classic/context/imperative";
 * import { assert, assertThrows } from "@std/assert";
 *
 * export const $sessionId = new Key<string>("sessionId");
 * const context = createContext();
 *
 * assertThrows(() => context.use($sessionId));
 * assert(context.get($sessionId) === undefined);
 * ```
 *
 * @example Derive a context
 * ```ts ignore
 * import { createContext, Key } from "@classic/context/imperative";
 * import { assert, assertThrows } from "@std/assert";
 *
 * const context = createContext();
 *
 * export const $sessionId = new Key<string>("sessionId");
 * const session = createContext(context);
 * session.provide($sessionId, "secret")
 *
 * assert(context.get($sessionId) === undefined);
 * assert(session.get($sessionId) === "secret");
 * ```
 *
 * @module
 */

import { Key } from "./key.ts";

export { Key };

/**
 * Context interface
 *
 * Represents values that are exepected given provided {@linkcode Key}
 */
export interface ImperativeContext extends ClassicContext {}

/** Utility to infer arguments of a context use function */
export type UseArgs<Fn extends (_: never, ...args: never[]) => unknown> =
  Fn extends (_: never, ...args: infer Args) => unknown ? Args : never;

/**
 * Idiomatic {@linkcode ImperativeContext} factory
 *
 * @param parent Optional context to fork from
 */
export const createImperativeContext = (
  parent?: ImperativeContext,
): ImperativeContext => new ClassicContext(parent);

/**
 * Base {@linkcode ImperativeContext} implementation
 */
class ClassicContext {
  /**
   * @param parent Optionally provide a parent {@linkcode ImperativeContext}
   */
  constructor(parent?: ImperativeContext) {
    this.#root = parent ? parent.#root : this;
    this.#parent = parent;
  }

  #root: ImperativeContext;
  #parent?: ImperativeContext;
  #store = new Map<Key<unknown>, unknown>();

  /**
   * Expect the value from given `key`
   *
   * Checks closer-level contexts first
   *
   * @param key Key that must have been used to provide the value
   *
   * @return the expected value
   *
   * @throw {Error} if expected value hasn't been provided
   */
  use<T>(key: Key<T>): T;
  /**
   * Executes a function using this {@linkcode ImperativeContext}
   *
   * @param use An abstracted logic to be running upon context
   * @param args List of arguments that expects `use`
   *
   * @returns The result of `use`
   */
  use<Use extends (context: this, ...args: never[]) => unknown>(
    use: Use,
    ...args: UseArgs<Use>
  ): ReturnType<Use>;
  use<T, Args extends unknown[]>(
    keyOrUse: Key<T> | ((context: this, ...args: Args) => T),
    ...args: Args
  ): T {
    if (typeof keyOrUse === "function") {
      return keyOrUse(this, ...args);
    } else {
      // deno-lint-ignore no-this-alias
      let node: ImperativeContext | undefined = this;
      while (node) {
        if (node.#store.has(keyOrUse)) {
          return node.#store.get(keyOrUse) as T;
        }
        node = node.#parent;
      }

      throw new Error(
        `Looking up unset context "${keyOrUse.description ?? ""}"`,
      );
    }
  }

  /**
   * Check if a value is provided for given `key`
   *
   * @param {Key} key {@linkcode Key} identifying value to retrieve
   *
   * @returns Whether a value is provided for `key`
   */
  has<T>(key: Key<T>): boolean {
    return this.#store.has(key) || !!this.#parent?.has(key);
  }

  /**
   * Safely get the value provided for given `key`
   *
   * @param key {@linkcode Key} identifying value to retrieve
   *
   * @returns The provided value if it exists, `undefined` otherwise
   */
  get<T>(key: Key<T>): T | undefined {
    return this.#store.has(key)
      ? this.#store.get(key) as T
      : this.#parent?.get<T>(key);
  }

  /**
   * Provide a value to associate to given `key` for this context and its children
   *
   * @param key {@linkcode Key} identifying value to provide
   * @param value Value to provide
   *
   * @returns `value`, allowing the following pattern: `const value = ctx.get(key) ?? ctx.provide(key, initialValue)`
   */
  provide<K extends Key<unknown>>(
    key: K,
    value: K extends Key<infer T> ? T : never,
  ): K extends Key<infer T> ? T : never {
    this.#store.set(key, value);
    return value;
  }

  /**
   * Top-level context
   *
   * @returns Top-level context
   */
  get root(): ClassicContext {
    return this.#root;
  }

  /**
   * Delete any value associated to given `key` **only in current context**.
   *
   * @param key {@linkcode Key} identifying value to delete
   */
  delete<T>(key: Key<T>): void {
    this.#store.delete(key);
  }
}
