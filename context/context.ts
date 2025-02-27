import type { Key } from "./key.ts";

/**
 * Context interface
 *
 * Represents values that are exepected given provided {@linkcode Key}
 */
export interface Context extends BaseContext {}

export type Parameters1N<Fn extends (_: never, ...args: never[]) => unknown> =
  Fn extends (_: never, ...args: infer Args) => unknown ? Args : never;

/**
 * Idiomatic {@linkcode Context} factory
 *
 * @param parent Optional context to fork from
 */
export const createContext = (parent?: Context): Context =>
  new ClassicContext(parent);

/**
 * Base {@linkcode Context} implementation
 *
 * Can be extended to expose a richer API
 */
export abstract class BaseContext {
  /**
   * @param parent Optionally provide a parent {@linkcode Context}
   */
  constructor(parent?: Context) {
    this.#root = parent ? parent.#root : this;
    this.#parent = parent;
  }

  #root: Context;
  #parent?: Context;
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
   * Executes a function using this {@linkcode Context}
   *
   * @param use An abstracted logic to be running upon context
   * @param args List of arguments that expects `use`
   *
   * @returns The result of `use`
   */
  use<Use extends (context: this, ...args: never[]) => unknown>(
    use: Use,
    ...args: Parameters1N<Use>
  ): ReturnType<Use>;
  use<T, Args extends unknown[]>(
    keyOrUse: Key<T> | ((context: this, ...args: Args) => T),
    ...args: Args
  ): T {
    if (typeof keyOrUse === "function") {
      return keyOrUse(this, ...args);
    } else {
      // deno-lint-ignore no-this-alias
      let node: Context | undefined = this;
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
  get root(): BaseContext {
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

class ClassicContext extends BaseContext {}
