declare const $type: unique symbol;

/**
 * Abstract key identifying data to be provided contextually.
 * @see {@linkcode ./context | Context}
 */
export class Key<T> {
  /**
   * @param description Hint describing what the key is associated to. Debug purposes.
   */
  constructor(public readonly description?: string) {}
  declare private [$type]: T;
}
