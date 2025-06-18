import type { Stringifiable } from "@classic/js/stringify";
import { SEPARATOR } from "@std/path/constants";
import { relative } from "@std/path/relative";
import type { Method } from "./request.ts";

type AllOrNone<T> = T | { [k in keyof T]?: never };

type Args1N<F> = F extends (_: never, ...args: infer Args) => unknown ? Args
  : never;

export class Route {
  constructor(
    public readonly method: Method | "*",
    public readonly pattern: string,
    public readonly module: RouteModule,
    public readonly exportName: string,
    public readonly params: Stringifiable[],
  ) {}

  static async fromMeta(
    [method, pattern, module, exportName, params]: [
      Method | "*",
      string,
      Parameters<typeof RouteModule.fromMeta>[0],
      string,
      Stringifiable[],
    ],
  ): Promise<Route> {
    return new Route(
      method,
      pattern,
      await RouteModule.fromMeta(module),
      exportName,
      params,
    );
  }

  toMeta(): Stringifiable[] {
    return [
      this.method,
      this.pattern,
      this.module.toMeta(),
      this.exportName,
      this.params,
    ];
  }
}

const $build = Symbol.for("classic.router.built.build");
const $restore = Symbol.for("classic.router.built.restore");

type BoundBuilder<
  B extends (exported: Exported, ...args: unknown[]) => unknown,
> =
  & { build: B }
  & (Args1N<B> extends [] ? unknown : { args: Readonly<Args1N<B>> });

/** Options for `new {@linkcode Buildable}` */
type NewBuildableOptions<T extends Stringifiable | PromiseLike<Stringifiable>> =
  BoundBuilder<(exported: Exported, ...args: unknown[]) => T>;

/**
 * Declare logic to bridge build time to run time.
 */
export class Buildable<
  T extends Stringifiable | PromiseLike<Stringifiable> =
    | Stringifiable
    | PromiseLike<Stringifiable>,
> {
  readonly #build: (exported: Exported, ...args: unknown[]) => T;
  readonly #args: readonly unknown[];

  #built?: T;
  #hasBuilt = false;
  #hasInit = false;

  /**
   * @constructor
   * @param builder Builder function to run only at build time. May be a {@linkcode BoundBuilder}.
   */
  constructor(builder: ((exported: Exported) => T) | NewBuildableOptions<T>) {
    if (typeof builder === "function") {
      this.#build = builder;
      this.#args = [];
    } else {
      this.#build = builder.build;
      this.#args = builder.args;
    }
  }

  /** @internal */
  [$build](exported: Exported): T {
    if (this.#hasBuilt) throw Error(`Can't build value twice`);
    this.#hasBuilt = true; // Before to break infinite recursions

    this.#built = this.#build(exported, ...this.#args);
    return this.#built;
  }

  /** @internal */
  async [$restore](value: Awaited<T>): Promise<void> {
    if (this.#hasInit) throw Error(`Can't restore built value twice`);
    this.#hasInit = true; // Before to break infinite recursions
    await this.restore(value);
  }

  /**
   * Override to hook on build process to use built value for runtime purposes.
   *
   * @param value Awaited builder result
   */
  // deno-lint-ignore no-unused-vars
  restore(value: Awaited<T>): void | PromiseLike<void> {}

  /**
   * Override to define a runtime request handler.
   * Declaring a route targeting this `Buildable` will call this handler on match.
   *
   * @param params Static route parameters declared at build time
   */
  // deno-lint-ignore no-unused-vars
  handle(...params: Stringifiable[]): HandlerResult {}

  /** Override to hook on build process' end */
  stop(): void | PromiseLike<void> {}
}

export type HandlerResult =
  | Response
  | void
  | null
  | PromiseLike<Response | void | null>;

let loadedModules: { [url in string]: Promise<RouteModule> } = {};

export class RouteModule<Args extends unknown[] = any> {
  private constructor(
    public readonly url: URL,
    public readonly module: { [name in string]: unknown },
    public readonly values: { [name in string]: Stringifiable },
    public readonly routes: Route[] | Promise<Route[]>,
  ) {}

  static build(url: URL, baseDir: string): Promise<RouteModule> {
    return loadedModules[url.href] ??= (async () => {
      const mod: { [name in string]: unknown } = await import(url.href);
      const { default: dflt, ...named } = mod;

      const orderedExports = Object.entries(named);
      orderedExports.push(["default", dflt]);

      const ownRoutes: Array<Route | PromiseLike<Route>> = [];
      const resultEntries = await Promise.all(
        orderedExports.map(async ([name, modExport]) => {
          if (isBuildable(modExport)) {
            const exported = new ExportedInternals(url, name, baseDir);
            const value = await modExport[$build](
              new Exported(exported),
            );
            modExport[$restore]?.(value);
            return [[name, value, exported.routes] as const];
          } else {
            return [];
          }
        }),
      );
      const values = Object.fromEntries(
        resultEntries.flatMap((entries) =>
          entries.map(([name, value, routes]) => {
            ownRoutes.push(...routes);
            return [name, value];
          })
        ),
      );

      return new RouteModule(url, mod, values, Promise.all(ownRoutes));
    })();
  }

  static fromMeta(
    [url, values]: [URL, { [name in string]: Stringifiable }],
  ): Promise<RouteModule> {
    return loadedModules[url.href] ??= (async () => {
      const mod: { [name in string]: unknown } = await import(url.href);

      Object.entries(values).forEach(([name, value]) => {
        const modExport = mod[name] as Buildable;
        modExport[$restore]?.(value);
      });

      return new RouteModule(url, mod, values, []);
    })();
  }

  toMeta(): Stringifiable[] {
    return [this.url, this.values];
  }

  async stop(): Promise<void> {
    delete loadedModules[this.url.href];
    await Promise.all(
      Object.values(this.module).map((xport) => {
        if (isBuildable(xport)) return xport.stop();
      }),
    );
  }

  /** @ignore */
  [Symbol.for("Deno.customInspect")](opts: Deno.InspectOptions): string {
    return `HandlerModule(${this.url.href}, { ${
      Object.keys(this.values).map((name) =>
        Deno.inspect(this.module[name], opts)
      ).join(", ")
    } })`;
  }
}

export const isBuildable = (value: unknown): value is Buildable =>
  typeof value === "object" && value != null && $build in value;

export class ExportedInternals {
  constructor(
    public readonly url: URL | undefined,
    public readonly name: string | undefined,
    public readonly baseDir: string,
    public readonly routes: Array<Route | PromiseLike<Route>> = [],
  ) {}
}

const RELATIVE_UP = ".." + SEPARATOR;

export type { Exported };

/** Interact with buildable exported code. */
class Exported {
  readonly #internals: ExportedInternals;

  constructor(internals: ExportedInternals) {
    this.#internals = internals;
  }

  /** Wrapping module's URL */
  get url(): URL {
    if (this.#internals.url === undefined) {
      throw Error(
        `A builder expecting module context (here: URL) can't run in a sub-build`,
      );
    }
    return this.#internals.url;
  }

  /** Export name */
  get name(): string {
    if (this.#internals.name === undefined) {
      throw Error(
        `A builder expecting module context (here: exported name) can't run in a sub-build`,
      );
    }
    return this.#internals.name;
  }

  /**
   * Declare a route in this export's context
   *
   * @param opts Options
   */
  route({
    method = "GET",
    pattern,
    moduleUrl = this.url,
    exportName,
    params,
  }: AddRouteOpts = {}): void {
    if (moduleUrl.protocol === "file:") {
      let relativePath = relative(this.#internals.baseDir, moduleUrl.pathname);
      if (!relativePath.startsWith(RELATIVE_UP)) {
        relativePath = relativePath.replace(routeRegExp, "$2");
        pattern = relativePath
          ? joinSegments(
            ...relativePath.split(SEPARATOR).map(fileSyntaxToURLPattern),
            pattern,
          )
          : relativePath;
      }
    }

    if (pattern == null) {
      throw Error(`Explicit route pattern is required here`);
    }

    exportName ??= moduleUrl === this.#internals.url ? this.name : "default";

    this.#internals.routes.push(
      RouteModule.build(moduleUrl, this.#internals.baseDir)
        .then((module) =>
          new Route(method, pattern, module, exportName, params ?? [])
        ),
    );
  }

  /**
   * Embed a sub-build
   *
   * @param built Buildable to run in current builder
   */
  build<T extends Stringifiable | PromiseLike<Stringifiable>>(
    built: Buildable<T>,
  ): T {
    return built[$build](
      new Exported(
        new ExportedInternals(
          undefined,
          undefined,
          this.#internals.baseDir,
          this.#internals.routes,
        ),
      ),
    );
  }
}

/** Options for {@linkcode Exported.build} */
type AddRouteOpts =
  & {
    /** HTTP method or `"*"` for any method. Defaults to `"GET"` */
    method?: Method | "*";
    /** Pattern relative to current route except if starting with `"/"` */
    pattern?: string;
    /** Static params to pass to the request handler */
    params?: Readonly<Stringifiable>[];
  }
  & AllOrNone<{
    /**
     * Target buildable module URL.
     * Required in sub-builds. Defaults to exported's module URL if available.
     */
    moduleUrl: URL;
    /**
     * Target buildable export name.
     * Defaults to exported name or `"default"` if in a sub-build
     */
    exportName?: string;
  }>;

export const routeRegExp = /^((?:(.+)\.)?route)\.tsx?$/;

const fileSyntaxToURLPattern = (fileName: string) => {
  const match = fileName.match(/^\[(\.\.\.)?([^\]]+)\]$/);
  if (!match) return `/${fileName}`;

  const [, spread, param] = match;
  if (spread) return `/:${param}*`;

  const optional = param?.match(/^\[(.+)\]$/)?.[1];
  return optional ? `{/:${optional}}?` : `/:${param}`;
};

const joinSegments = (
  ...[first, ...segments]: Array<string | undefined>
): string =>
  "/" + segments.reduce(
      (left: string, next = "") =>
        next[0] === "/"
          ? next.slice(1)
          : left
          ? next ? `${left}/${next}` : left
          : next,
      (first ?? "").replace(/^\//, ""),
    ) || "/";
