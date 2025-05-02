import { Context, type ContextApi } from "@classic/context";

/** Options context configuation */
export interface OptionsConfig {
  /**
   * Notify added values to an option
   *
   * @param option Option to associate values to
   * @params values Values to associate to `option`
   */
  add: (option: unknown, ...values: unknown[]) => void;

  /**
   * Require fully built options
   *
   * @param option Option to retrieve associated values from
   */
  use: (option: unknown) => Promise<unknown[]>;
}

const $options = Context.for<OptionsConfig>("classic.options");

/**
 * Provide configuration for options use
 *
 * @param config Options configuration
 * @param cb Function to provide options to
 * @params args Arguments to forward to `cb`
 */
export const configureOptions: ContextApi<OptionsConfig>["provide"] = (
  config,
  cb,
  ...args
) => $options.provide(config, cb, ...args);

const useCache = new WeakMap<WeakKey, unknown>();

const useOption = async <V, T>(
  option: unknown,
  fromEntries: (entries: readonly V[]) => T,
): Promise<T> => {
  const values = await $options.use().use(option);

  if (useCache.has(values)) return useCache.get(values) as T;
  const res = fromEntries(values as readonly V[]);
  useCache.set(values, res);

  return res;
};

/**
 * Represents an option that can be set at the whole build's level
 * and retrieved anywhere else.
 */
export class Option<T> {
  /** Declare a value to set to the option for current build */
  set(value: T): void {
    $options.use().add(this, value);
  }

  /**
   * Resolves to declared value if any when all the
   * non option-dependent builds are done.
   */
  async use(): Promise<T | undefined> {
    return useOption<T, T | undefined>(
      this,
      (entries) => entries[entries.length - 1],
    );
  }
}

/**
 * Like an {@linkcode Option} that can be extended by values in arbitrary places,
 * making a plugin able to collect values from arbitrary places.
 */
export class ListOption<T> {
  /** Declare values to add to the option for current build */
  add(...values: T[]): void {
    $options.use().add(this, ...values);
  }

  /**
   * Resolves all the declared values when all the
   * non option-dependent builds are done.
   */
  async use(): Promise<readonly T[]> {
    return useOption<T, readonly T[]>(this, Object.freeze) ?? empty;
  }
}

const empty = Object.freeze([]);
