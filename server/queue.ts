/**
 * Mutable queue of operations
 */
export class Queue {
  #closed = false;
  #last: Promise<unknown> = Promise.resolve();

  /**
   * Add an operation to the queue
   */
  queue<T>(cb: () => T): Promise<Awaited<T>> {
    if (this.#closed) throw Error(`Queue is closed`);
    return this.#last = this.#last.then(cb) as Promise<Awaited<T>>;
  }

  /**
   * Close the queue
   *
   * No further operation may be added.
   *
   * @returns a promise that resolves when all queued operations are done
   */
  async close(): Promise<void> {
    this.#closed = true;
    await this.#last;
  }

  /**
   * Resolves when all queued operations are done
   */
  get closed(): boolean {
    return this.#closed;
  }
}
