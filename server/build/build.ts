import { Context } from "@classic/context";
import { configureOptions, type OptionsConfig } from "@classic/context/option";
import type { Stringifiable } from "@classic/js/stringify";
import {
  $buildRestore,
  type ClassicServer,
  type HandlerParam,
  type Method,
  Route,
  RuntimeServer,
} from "../runtime/runtime.ts";
import type { Async } from "./mod.ts";

/**
 * Build system designed for backends.
 * No need for a central config like other tools such as Vite.
 *
 * @module
 */

const throwIfRelative = (module: string) => {
  if (/^\.\.?\//.test(module)) {
    throw Error(`Can't import module relatively: ${module}`);
  }
};

class BuildServer implements ClassicServer {
  readonly #server: Promise<RuntimeServer>;

  constructor(server: Promise<RuntimeServer>) {
    this.#server = server;
  }

  fetch = async (req: Request): Promise<Response> => {
    const server = await this.#server;
    this.fetch = server.fetch;
    return server.fetch(req);
  };

  async write(path?: string): Promise<void> {
    const server = await this.#server;
    await server.write(path);
  }
}

/**
 * Define a buildable server application
 *
 * @param builder The root builder
 */
export const defineServer = (builder: () => void): ClassicServer =>
  configureOptions(optionsConfig, () => {
    const build = new Build(builder);
    const { routes, options, resolveOptions } = build.run();
    options.then(resolveOptions);
    return new BuildServer(routes.then((routes) => new RuntimeServer(routes)));
  });

// Top-level context working with contextual build's options
const optionsConfig = {
  add: (option: unknown, ...values: unknown[]): void => {
    $buildInstance.use().options.push(
      ...values.map((v): OptionEntry => [option, v]),
    );
  },

  use: async (option: unknown): Promise<unknown[]> => {
    const build = $buildInstance.use();
    build.optionsUsePhase.resolve();

    const fullOptions = await build.fullOptions.promise;
    let values = fullOptions.get(option);
    if (!values) fullOptions.set(option, values = []);
    return values;
  },
} satisfies OptionsConfig;

type Options = Map<unknown, unknown[]>;
type OptionEntry = [unknown, unknown];

/**
 * Build representation that can be embedded in other builds.
 * This allows parallelizing multiple builds without manual Promise management.
 */
export class Build<T extends Async<Stringifiable> = Async<Stringifiable>> {
  #segment: string;
  #builder: () => T;

  /**
   * @param builder Builder function - may be asynchronous
   */
  constructor(builder: () => T);
  constructor(segment: string, builder: () => T);
  constructor(...args: [() => T] | [string, () => T]);
  constructor(...[segment, builder]: [() => T] | [string, () => T]) {
    if (builder) {
      this.#builder = builder;
      this.#segment = segment as string;
    } else {
      this.#builder = segment as () => T;
      this.#segment = "";
    }
  }

  /**
   * Run the builder while tracking added routes.
   *
   * @returns Builder's returned value and produced routes
   */
  run(): BuildResult<T> {
    // Only data to pass down from parent: fully resolved options
    const parentInstance = $buildInstance.get();
    const instance = new BuildInstance(parentInstance?.fullOptions);
    const value = $buildInstance.provide(instance, this.#builder);

    const built = [] as Async<Stringifiable>[];

    const routes = (async () => {
      await value;

      const mappings: Route[] = [];
      const segmentRoute: (route: Route) => Route = this.#segment
        ? (r) =>
          r.pattern[0] === "/" ? r : new Route(
            r.method,
            r.pattern ? `${this.#segment}/${r.pattern}` : this.#segment,
            r.module,
            r.params,
          )
        : (r) => r;
      for (const r of instance.routes) {
        if (r instanceof BuildResult) {
          mappings.push(...(await r.routes).map(segmentRoute));
          built.push(r.value);
        } else {
          mappings.push(segmentRoute(r));
        }
      }
      return Object.freeze(mappings);
    })();

    // Current builder done or in use phase
    const optionsUsePhase = Promise.race([
      value,
      instance.optionsUsePhase.promise,
    ]);

    const options = optionsUsePhase.then(async () => {
      const options = new Map<unknown, unknown[]>();
      const addEntry = (key: unknown, value: unknown) => {
        let values = options.get(key);
        if (!values) options.set(key, values = []);
        values.push(value);
      };
      for (const o of instance.options) {
        if (o instanceof BuildResult) {
          (await o.options).entries()
            .forEach(([k, vs]) => vs.forEach((v) => addEntry(k, v)));
        } else {
          addEntry(o[0], o[1]);
        }
      }
      return options;
    });

    return new BuildResult(
      value,
      routes.then(() => Promise.all(built)),
      routes,
      options,
      instance.fullOptions.resolve,
    );
  }
}

class BuildInstance {
  readonly routes: Array<Route | BuildResult<Async<Stringifiable>>> = [];
  readonly options: Array<OptionEntry | BuildResult<Async<Stringifiable>>> = [];
  readonly optionsUsePhase = Promise.withResolvers<void>();

  constructor(
    readonly fullOptions = Promise.withResolvers<Options>(),
  ) {}
}

/**
 * Contains a builder's returned value and tracks routes that it is producing.
 *
 * May be instanciated while the associated builder is still running.
 *
 * @internal
 */
export class BuildResult<T extends Async<Stringifiable>> {
  constructor(
    /** Builder's returned value */
    public readonly value: T,
    /** Sub-builders' returned values */
    public readonly built: Promise<Stringifiable[]>,
    /** Promise resolving to generated routes once built */
    public readonly routes: Promise<readonly Route[]>,
    /** Resolves to options that the builder set */
    public readonly options: Promise<Options>,
    /** Relaunch builder with fully built options */
    public readonly resolveOptions: (fullOptions: Options) => void,
  ) {
    Object.defineProperty(this, "value", freezeProperty);
    Object.defineProperty(this, "built", freezeProperty);
    Object.defineProperty(this, "routes", freezeProperty);
    Object.defineProperty(this, "options", freezeProperty);
    Object.defineProperty(this, "resolveOptions", freezeProperty);
  }

  use(): T {
    $buildInstance.use().routes.push(this);
    $buildInstance.use().options.push(this);
    return this.value;
  }
}

/**
 * Synchronously create a build that can be embedded in other builds.
 * This allows parallelizing multiple builds without manual Promise management.
 *
 * @param builder Builder function - may be asynchronous
 */
export const useBuild: {
  <T extends Async<Stringifiable>>(builder: () => T): T;
  <T extends Async<Stringifiable>>(segment: string, builder: () => T): T;
} = <T extends Async<Stringifiable>>(
  ...args: [() => T] | [string, (() => T)]
): T => {
  const restored = $buildRestore.get();
  if (restored) return restored.shift() as T;

  return new Build(...args).run().use();
};

export const $buildInstance = Context.for<BuildInstance>(
  "classic.buildInstance",
);

/**
 * Register a handler in the build to be imported at runtime
 *
 * @param method HTTP method to bind to the pattern
 * @param pattern URL Pattern to bind
 * @param module URL to the lazy-loaded handler module
 * @params params Parameters to pass to the handler
 */
export const useRoute = (
  method: Method,
  pattern: string,
  module: string,
  ...params: Readonly<HandlerParam>[]
): void => {
  throwIfRelative(module);
  $buildInstance.use().routes.push(
    new Route(method, pattern, module, params),
  );
};

const freezeProperty = {
  configurable: false,
  writable: false,
} satisfies PropertyDescriptor;
