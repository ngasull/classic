import { Context } from "@classic/context";

export const $buildContext = Context.for<Build>("classic.buildContext");

export class Build {
  constructor(
    public readonly context = new Map<BuildContext<unknown>, unknown>(),
  ) {}
}

/** Share arbitrary data across builders */
export class BuildContext<T> {
  readonly #init?: () => T;

  /**
   * @constructor
   * @param init Lazy initializer
   */
  constructor(init?: () => T) {
    this.#init = init;
  }

  /**
   * Set an arbitrary value to this context to be available
   * everywhere during current build
   *
   * @param value Attached value
   * @returns Passed `value`
   */
  set(value: T): T {
    $buildContext.use().context.set(this, value);
    return value;
  }

  /** Retrieve an arbitrary build-time global value */
  get(): T | undefined {
    const context = $buildContext.use().context;
    let value: T | undefined;
    if (context.has(this)) {
      value = context.get(this) as T;
    } else if (this.#init) {
      context.set(this, value = this.#init());
    }
    return value;
  }

  /** Require an arbitrary build-time global value */
  use(): T {
    const context = $buildContext.use().context;
    if (context.has(this)) {
      return context.get(this) as T;
    } else if (this.#init) {
      const value = this.#init();
      context.set(this, value);
      return value;
    } else {
      throw Error(
        `BuildContext can't be used as it hasn't been set and has no initializer`,
      );
    }
  }
}

export class RoutePathContext {
  readonly #data: Map<unknown, unknown> = new Map();

  constructor(
    public readonly baseDir: string,
    public readonly segments: readonly string[],
    public readonly parent?: RoutePathContext,
  ) {}

  /**
   * Set an arbitrary value in current file route path's context.
   * Child routes will also be able to retrieve the value.
   *
   * @param k Arbitrary key
   * @param v Arbitrary value
   * @returns `v`
   */
  set<T>(k: unknown, v: T): T {
    this.#data.set(k, v);
    return v;
  }

  /**
   * Retrieve an arbitrary value from current file route path's context
   * Also searches parent routes, prioritizing closest relative.
   *
   * @param k Arbitrary key
   * @returns Arbitrary value if found, undefined otherwise
   */
  get<T>(k: unknown): T | undefined {
    return this.#data.has(k)
      ? this.#data.get(k) as T | undefined
      : this.parent?.get(k);
  }
}
