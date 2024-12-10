import type { Key } from "./key.ts";

export type ContextInterface = Pick<Context, keyof Context>;

export class Context {
  constructor(parent?: ContextInterface) {
    this.#parent = parent;
  }

  #parent?: ContextInterface;
  #store = new Map<Key<unknown>, unknown>();

  use<T, Args extends any[]>(
    keyOrUse: Key<T> | ((context: Context, ...args: Args) => T),
    ...args: Args
  ): T {
    if (typeof keyOrUse === "function") {
      return keyOrUse(this, ...args);
    } else {
      if (this.#store.has(keyOrUse)) {
        return this.#store.get(keyOrUse) as T;
      } else if (this.#parent) {
        return this.#parent.use(keyOrUse);
      } else {
        throw new Error(
          `Looking up unset context "${keyOrUse.description ?? ""}"`,
        );
      }
    }
  }

  has<T>(key: Key<T>): boolean {
    return this.#store.has(key) || !!this.#parent?.has(key);
  }

  get<T>(key: Key<T>): T | undefined {
    return this.#store.has(key)
      ? this.#store.get(key) as T
      : this.#parent?.get<T>(key);
  }

  provide<T>(key: Key<T>, value: T): T {
    this.#store.set(key, value);
    return value;
  }

  delete<T>(key: Key<T>): void {
    this.#store.delete(key);
  }
}
