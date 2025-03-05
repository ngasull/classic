/** @import { Context } from "./context.ts" */

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
}

/** Utility to infer arguments of a context use function */
export type UseArgs<Fn extends (_: never, ...args: never[]) => unknown> =
  Fn extends (_: never, ...args: infer Args) => unknown ? Args : never;
