import { AsyncLocalStorage } from "node:async_hooks";

const symbolLazyPromise = Symbol.for("classic.LazyPromise");

/**
 * When awaited, calls its inner logic
 *
 * NB: Passed callback runs **in external async context**
 */
export class LazyPromise<T> implements PromiseLike<T> {
  readonly #cb: () => T | PromiseLike<T>;
  readonly #snapshot: ReturnType<typeof AsyncLocalStorage.snapshot>;
  #resolved?: boolean;
  #value?: Promise<T>;

  constructor(cb: () => T | PromiseLike<T>) {
    this.#cb = cb;
    this.#snapshot = AsyncLocalStorage.snapshot();
  }

  /**
   * Maps wrapped result without awaiting it yet
   *
   * @param transform Result transformer
   */
  map<R>(
    transform: (value: T) => R | PromiseLike<R>,
  ): LazyPromise<R> {
    return new LazyPromise(async () =>
      transform(await this.#snapshot(this.#cb))
    );
  }

  async then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): Promise<TResult1 | TResult2> {
    // Be lazy but only call once
    if (!this.#resolved) {
      try {
        this.#value = Promise.resolve(this.#snapshot(this.#cb));
      } catch (e) {
        this.#value = Promise.reject(e);
      }
      this.#resolved = true;
    }
    return this.#value!.then(onfulfilled, onrejected);
  }

  readonly [symbolLazyPromise] = true;

  static [Symbol.hasInstance](o: unknown): o is LazyPromise<unknown> {
    return typeof o === "object" && o != null && symbolLazyPromise in o;
  }
}
