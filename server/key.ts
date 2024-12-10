declare const $type: unique symbol;

export class Key<T> {
  constructor(public readonly description?: string) {}
  declare [$type]: T;
}
