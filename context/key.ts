/** @import { Context } from "./imperative.ts" */

const store: Map<string, unknown> =
  // @ts-ignore dynamic global
  globalThis[Symbol.for("classic.key")] ??= new Map();

declare const $type: unique symbol;

/**
 * Abstract key identifying data to be provided contextually.
 *
 * Acts like `Symbol` but contains type information.
 * @see {@linkcode Context}
 */
export class Key<T> {
  /**
   * @param description Hint describing what the key is associated to. Debug purposes.
   */
  constructor(public readonly description?: string) {}
  declare private [$type]: T;

  /**
   * Given the same parameter, retrieves the same reference. Like {@linkcode Symbol.for}
   *
   * @param description Key description
   */
  static for<T>(description: string): Key<T> {
    if (store.has(description)) {
      return store.get(description) as Key<T>;
    } else {
      const key = new Key<T>(description);
      store.set(description, key);
      return key;
    }
  }
}

/** Utility to infer arguments of a context use function */
export type UseArgs<Fn extends (_: never, ...args: never[]) => unknown> =
  Fn extends (_: never, ...args: infer Args) => unknown ? Args : never;
