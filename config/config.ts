import { Context } from "@classic/context";
import type { Stringifiable } from "@classic/js/stringify";
import type { ConfigContext } from "./context.ts";
import {
  isOptionRead,
  type Option,
  type OptionRead,
  OptionUse,
  symbolOption,
  type Unpacked,
} from "./option.ts";

class ConfigRun<T> {
  readonly userData: Map<ConfigContext<unknown>, unknown> = new Map();
  readonly resolved: Map<OptionRead<unknown> | Config<unknown>, unknown> =
    new Map();
  readonly root: Config<T> = new Config(this);
  readonly last: Config<void> = new Config(this);

  constructor(
    public readonly built?: Stringifiable[],
  ) {}

  static async run<T>(
    cb: () => T,
    manifest?: Manifest,
  ): Promise<ConfigResult<T>> {
    const run = new ConfigRun<T>(manifest?.built.slice());
    return new ConfigResult(
      run,
      await run.root.init(cb),
      await run.root.options(),
    );
  }
}

type OptionEntry<T> = readonly [Option<T>, T];

type ConfigEntry =
  | (readonly [unknown, unknown])
  | Config<unknown>
  | OptionRead<unknown, unknown[]>;

const symbolConfig = Symbol.for("classic.config.Config");

class Config<T> {
  #value!: T | OptionRead<Unpacked<T>>;

  readonly entries: ConfigEntry[] = [];

  constructor(
    public readonly run: ConfigRun<unknown>,
    parent?: Config<unknown>,
  ) {
    parent?.entries.push(this);
  }

  init<Args extends unknown[]>(
    cb: (...args: Args) => T,
    ...args: Args
  ): T {
    return this.#value = this.run.built && this !== this.run.root
      ? this.run.built.shift() as T
      : $state.provide(this, cb, ...args);
  }

  defer<O extends unknown[], Args extends unknown[]>(
    dependencies: O,
    callback: (
      ...values: [
        ...{ [I in keyof O]: Unpacked<O[I]> },
        ...Args,
      ]
    ) => T,
    ...args: Args
  ): OptionRead<Unpacked<T>> {
    let mapped;
    if (this.run.built && this !== this.run.root) {
      const value = this.run.built.shift();
      mapped = new OptionUse([], () => value as T) as OptionRead<Unpacked<T>>;
    } else {
      const snapshot = Context.snapshot();
      mapped = new OptionUse(
        dependencies,
        (...values) =>
          snapshot(() => $state.provide(this, callback, ...values, ...args)),
      ) as OptionRead<Unpacked<T>>;

      dependencies.forEach((o) => {
        if (isOptionRead(o)) this.entries.push(o);
      });
    }
    this.entries.push(mapped);

    return this.#value = mapped;
  }

  async options(): Promise<Map<Option<unknown>, unknown[]>> {
    // First recursively wait for all nested configs to finish (add options)
    await this.#await();

    let result, options;
    do {
      result = await this.#optionEntries(options);

      options = new Map<Option<unknown>, unknown[]>();
      for (const [o, value] of result.entries) {
        let values = options.get(o);
        if (values) values.push(value);
        else options.set(o, values = [value]);
      }
    } while (result.incomplete);

    return options;
  }

  async #optionEntries(
    prev?: Map<Option<unknown>, readonly unknown[]>,
  ): Promise<{
    entries: OptionEntry<unknown>[];
    incomplete: boolean;
  }> {
    // When no previous options, always require an iteration next
    // (first add options, then loop while dependencies are required)
    let incomplete = !prev;

    const entriesList = await Promise.all(
      this.entries.map(
        async (e): Promise<OptionEntry<unknown>[]> => {
          if (symbolConfig in e) {
            const res = await e.#optionEntries(prev);
            incomplete ||= res.incomplete;
            return res.entries;
          } else if (symbolOption in e) {
            const optionInternals = e[symbolOption];
            if (prev && !this.run.resolved.has(e)) {
              if (optionInternals.dependencies.length === 0) {
                // This is an optimization: avoid unnecessary await
                this.run.resolved.set(e, optionInternals.callback(prev, []));
              } else if (
                optionInternals.dependencies.every((d) =>
                  !isOptionRead(d) || this.run.resolved.has(d)
                )
              ) {
                this.run.resolved.set(
                  e,
                  optionInternals.callback(
                    prev,
                    await Promise.all(
                      optionInternals.dependencies.map((d) =>
                        isOptionRead(d) ? this.run.resolved.get(d) : d
                      ),
                    ),
                  ),
                );
              } else {
                incomplete = true;
              }
            }
            return [];
          } else {
            return [e as OptionEntry<unknown>];
          }
        },
      ),
    );
    return { entries: entriesList.flatMap((entries) => entries), incomplete };
  }

  async #await(): Promise<void> {
    await this.#value;
    await Promise.all(this.entries.map((e) => symbolConfig in e && e.#await()));
  }

  /** @internal */
  [symbolConfig] = true;
}

export const $state = Context<Config<unknown>>();

/**
 * Run a scoped configuration function (needs a parent configuration scope)
 *
 * @param cb Configuration function
 * @params args Arguments to forward to `cb`
 */
export const config = <
  Args extends unknown[],
  R extends
    | Stringifiable
    | PromiseLike<Stringifiable>
    | OptionRead<Stringifiable>,
>(
  cb: (...args: Args) => R,
  ...args: Args
): R => {
  const state = $state.use();
  const cfg = new Config<R>(state.run, state);
  return cfg.init(cb, ...args);
};

export const configWith = <
  O extends unknown[],
  Args extends unknown[],
  R extends
    | Stringifiable
    | PromiseLike<Stringifiable>
    | OptionRead<Stringifiable>,
>(
  dependencies: O,
  callback: (
    ...values: [
      ...{ [I in keyof O]: Unpacked<O[I]> },
      ...Args,
    ]
  ) => R,
  ...args: Args
): OptionRead<Unpacked<R>> => {
  const state = $state.use();
  const cfg = new Config<R>(state.run, state);
  return cfg.defer(dependencies, callback, ...args);
};

/**
 * Run a configuration at top-level scope
 *
 * @param cb Configuration function
 */
export const runConfig: <T>(
  cb: () => T,
  manifest?: Manifest,
) => Promise<ConfigResult<T>> = ConfigRun.run;

/**
 * Result a config run
 *
 * Allows user to retrieve, modify and then forward options and context
 * to other config runs.
 */
export class ConfigResult<T> {
  readonly #run: ConfigRun<T>;
  readonly #value: T;
  #options: Map<unknown, unknown[]>;
  #context?: Map<ConfigContext<unknown>, unknown>;

  constructor(run: ConfigRun<T>, value: T, options: Map<unknown, unknown[]>) {
    this.#run = run;
    this.#value = value;
    this.#options = options;
  }

  /** Forward options and context to current context's config run */
  forward(): void {
    $state.use().entries.push(
      ...this.options.entries().flatMap(([option, values]) =>
        values.map((v) => [option, v] as const)
      ),
    );
    this.context.forEach((v, c) => c.set(v));
  }

  /** Config function awaited returned value */
  get value(): Unpacked<T> {
    return (
      isOptionRead(this.#value)
        ? this.#run.resolved.get(this.#value as OptionRead<Unpacked<T>>)
        : this.#value
    ) as Unpacked<T>;
  }

  /** Collected options */
  get options(): Map<unknown, unknown[]> {
    return this.#options;
  }

  set options(options: Map<unknown, unknown[]>) {
    this.#options = options;
  }

  /** User context snapshot */
  get context(): Map<ConfigContext<unknown>, unknown> {
    return this.#context ??= new Map(this.#run.userData);
  }

  set context(context: Map<ConfigContext<unknown>, unknown>) {
    this.#context = context;
  }

  manifest(): Manifest {
    return {
      built: this.#run.root.entries.flatMap((e) =>
        symbolConfig in e || symbolOption in e
          ? [this.#run.resolved.get(e) as Stringifiable]
          : []
      ),
    };
  }
}

export type Manifest = {
  built: readonly Stringifiable[];
};
