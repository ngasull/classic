import { $state } from "./config.ts";

export const symbolOption = Symbol.for("classic.config.OptionRead");

export interface OptionRead<
  T,
  // deno-lint-ignore no-explicit-any
  O extends unknown[] = any,
> {
  /** @internal */
  [symbolOption]: BuiltInternals<T, O>;
}

export type Unpacked<O> = O extends OptionRead<infer T> | PromiseLike<infer T>
  ? Unpacked<T>
  : O;

export const isOptionRead = <T>(value: unknown): value is OptionRead<T> =>
  typeof value === "object" && value != null && symbolOption in value;

class BuiltInternals<T, O extends unknown[]> {
  constructor(
    public readonly dependencies: O,
    public readonly callback: (
      options: Map<OptionRead<unknown>, unknown>,
      values: {
        [I in keyof O]: O[I] extends OptionRead<infer V> ? Awaited<V>
          : Awaited<O[I]>;
      },
    ) => T | PromiseLike<T>,
  ) {}
}

/**
 * Represents an option that can be set at the whole config's level
 * and retrieved anywhere else. Collects every added value
 * from arbitrary places.
 */
export class Option<T> implements OptionRead<readonly T[]> {
  /** Declare values to add to the option for current config */
  add(...values: T[]): void {
    const state = $state.use();
    values.forEach((v) => state.entries.push([this, v] as const));
  }

  readonly [symbolOption]: BuiltInternals<readonly T[], never[]> =
    new BuiltInternals(
      [],
      (options): readonly T[] => options.get(this) as readonly T[] ?? [],
    );
}

export class OptionUse<T, O extends unknown[]> implements OptionRead<T, O> {
  constructor(
    public readonly dependencies: O,
    public readonly callback: (
      ...values: { [I in keyof O]: Unpacked<O[I]> }
    ) => T,
  ) {
    this[symbolOption] = new BuiltInternals(
      dependencies,
      (_, values) => callback(...values as Parameters<typeof callback>),
    );
  }

  readonly [symbolOption]: BuiltInternals<T, O>;
}

/**
 * Represents an option that can be set at the whole config's level
 * and retrieved anywhere else.
 */
export class OptionValue<T>
  implements OptionRead<T, [OptionRead<readonly T[]>]> {
  readonly #list = new Option<T>();

  /** Declare a value to set to the option for current config */
  set(value: T): void {
    this.#list.add(value);
  }

  readonly [symbolOption] = new BuiltInternals<
    T,
    [OptionRead<readonly T[]>]
  >([this.#list], (_, [list]) => list[list.length - 1]);
}
