import { type JS, js } from "@classic/js";
import type { Stringifiable } from "@classic/js/stringify";
import { SEPARATOR } from "@std/path/constants";
import { relative } from "@std/path/relative";
import { toFileUrl } from "@std/path/to-file-url";
import type { RoutePathContext } from "./build/context.ts";
import type { Method } from "./request.ts";

type AllOrNone<T> = T | { [k in keyof T]?: never };

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

  toJs(): JS<Promise<Route>> {
    return moduleJs.Route.fromMeta([
      this.method,
      this.pattern,
      this.module.toMeta(),
      this.exportName,
      this.params,
    ]);
  }
}

const moduleJs = js.module<typeof import("./module.ts")>(import.meta.url);

export const $buildable = Symbol.for("classic.buildable");
export const $internal = Symbol.for("classic.internal");

/** Declares behavior on build and runtime restoration */
export type BuildableOptions<T extends Stringifiable = Stringifiable> = {
  /** Builder function */
  build: (
    exported: Exported,
    ...args: any[]
  ) => T | PromiseLike<T>;

  /** Builder static arguments */
  args?: readonly any[];

  /** Whether `build` runs after regular builders */
  isAfter?: boolean;

  /* Hook on build process to use built value for runtime purposes.
     *
     * @param value Awaited builder result
     */
  restore?: (value: T) => void | PromiseLike<void>;

  /**
   * Defines the runtime request handler.
   * Declaring a route targeting this `Buildable` will call this handler on match.
   *
   * @param params Static route parameters declared at build time (@see {@linkcode Exported.route})
   */
  handle?: (...params: Stringifiable[]) => HandlerResult;

  /** Hook on build process' end */
  stop?: () => void | PromiseLike<void>;
};

class BuildableInternal<T> {
  readonly #build: (exported: Exported, ...args: unknown[]) => T;
  readonly #args: readonly unknown[];
  readonly #restore?: (value: Awaited<T>) => void | PromiseLike<void>;

  #built?: T;
  #hasBuilt = false;
  #hasInit = false;

  constructor(
    build: (exported: Exported, ...args: unknown[]) => T,
    args: readonly unknown[] = [],
    restore?: (value: Awaited<T>) => void | PromiseLike<void>,
    public readonly handle?: (...params: Stringifiable[]) => HandlerResult,
    public readonly stop?: () => void | PromiseLike<void>,
    public readonly isAfter?: boolean,
  ) {
    this.#build = build;
    this.#args = args;
    this.#restore = restore;
  }

  build(exported: ExportedInternals): T {
    if (this.#hasBuilt) throw Error(`Can't build value twice`);
    this.#hasBuilt = true; // Before to break infinite recursions

    this.#built = this.#build(new Exported(exported), ...this.#args);
    return this.#built;
  }

  async restore(value: Awaited<T>): Promise<void> {
    if (this.#hasInit) throw Error(`Can't restore built value twice`);
    this.#hasInit = true; // Before to break infinite recursions
    await this.#restore?.(value);
  }
}

/** Union of acceptable request hanlder return types (async {@linkcode Response} or nothing) */
export type HandlerResult =
  | Response
  | void
  | null
  | PromiseLike<Response | void | null>;

let loadedModules: { [url in string]: Promise<RouteModule> } = {};

export class RouteModule {
  private constructor(
    public readonly url: URL,
    public readonly module: { [name in string]: unknown },
    public readonly values: { [name in string]: Stringifiable },
    public readonly routes: Route[] | Promise<Route[]>,
  ) {}

  static build(
    url: URL,
    context: RoutePathContext,
  ): Promise<RouteModule> {
    return loadedModules[urlToSpecifier(url)] ??= (async () => {
      const mod: { [name in string]: unknown } = await import(url.href);
      const { default: dflt, ...named } = mod;

      const orderedExports = Object.entries(named);
      orderedExports.push(["default", dflt]);

      const building: unknown[] = [];
      const after = Promise.withResolvers();

      const ownRoutes: Array<Route | PromiseLike<Route>> = [];
      const resultEntriesPromise = Promise.all(
        orderedExports.map(async ([name, modExport]) => {
          const buildable = getBuildable(modExport);
          if (buildable) {
            if (buildable.isAfter) await after.promise;

            const exported = new ExportedInternals(url, name, context);
            let value = buildable.build(exported);

            // This instruction must run before any await for after.resolve to work
            if (!buildable.isAfter) building.push(value);

            value = await value;
            await buildable.restore(value);
            return [[name, value, exported.routes] as const];
          } else {
            return [];
          }
        }),
      );

      after.resolve(Promise.all(building));

      const resultEntries = await resultEntriesPromise;
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
    [spec, values]: [string, { [name in string]: Stringifiable }],
  ): Promise<RouteModule> {
    return loadedModules[spec] ??= (async () => {
      const url = specifierToUrl(spec);
      const mod: { [name in string]: unknown } = await import(url.href);

      await Promise.all(
        Object.entries(values).map(([name, value]) => {
          getBuildable(mod[name])?.restore(value);
        }),
      );

      return new RouteModule(url, mod, values, []);
    })();
  }

  toMeta(): Parameters<typeof RouteModule.fromMeta>[0] {
    return [urlToSpecifier(this.url), this.values];
  }

  async stop(): Promise<void> {
    delete loadedModules[this.url.href];
    await Promise.all(
      Object.values(this.module).map((xport) => {
        const buildable = getBuildable(xport);
        if (buildable) {
          return buildable.stop?.();
        }
      }),
    );
  }

  /** @ignore */
  [Symbol.for("Deno.customInspect")](opts: Deno.InspectOptions): string {
    return `HandlerModule(${urlToSpecifier(this.url)}, { ${
      Object.keys(this.values).map((name) =>
        Deno.inspect(this.module[name], opts)
      ).join(", ")
    } })`;
  }
}

const buildables: Map<unknown, BuildableInternal<unknown>> =
  (globalThis as any)[Symbol.for("classic.buildable.store")] ??= new Map();

export const getBuildable = <
  T extends Stringifiable | PromiseLike<Stringifiable>,
>(value: unknown): BuildableInternal<T> | undefined => {
  const existing = buildables.get(value);
  if (existing) return existing as BuildableInternal<T>;

  if (
    typeof value === "object" && value != null &&
    $buildable in value &&
    typeof value[$buildable] === "function"
  ) {
    const opts: BuildableOptions = value[$buildable]();

    const buildable = typeof opts === "function"
      ? new BuildableInternal<T>(opts)
      : new BuildableInternal<T>(
        opts.build as (exported: Exported, ...args: any[]) => T,
        opts.args,
        opts.restore,
        opts.handle,
        opts.stop,
        opts.isAfter,
      );
    buildables.set(value, buildable as BuildableInternal<unknown>);
    return buildable;
  }

  return undefined;
};

export class ExportedInternals {
  constructor(
    public readonly url: URL | undefined,
    public readonly name: string | undefined,
    public readonly context: RoutePathContext,
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

  /** Exported route-level context. Modifications will be available in child routes only */
  get context(): ExportedContext {
    return new ExportedContext(this.#internals.context);
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
      let relativePath = relative(
        this.#internals.context.baseDir,
        moduleUrl.pathname,
      );
      if (!relativePath.startsWith(RELATIVE_UP)) {
        relativePath = relativePath.replace(routeRegExp, "$2");
        pattern = relativePath
          ? joinSegments(
            relativePath.split(SEPARATOR).map(fileSyntaxToURLPattern).join(""),
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
      RouteModule.build(moduleUrl, this.#internals.context)
        .then((module) =>
          new Route(method, pattern, module, exportName, params ?? [])
        ),
    );
  }

  /**
   * Embed a sub-build
   *
   * @param buildable Buildable to run in current builder
   */
  build<T extends Stringifiable | PromiseLike<Stringifiable>>(
    buildable: unknown,
  ): T {
    const internal = getBuildable<T>(buildable);
    if (!internal) throw Error(`Requested value is not buildable`);

    return internal.build(
      new ExportedInternals(
        undefined,
        undefined,
        this.#internals.context,
        this.#internals.routes,
      ),
    );
  }
}

class ExportedContext {
  readonly #internal: RoutePathContext;

  constructor(context: RoutePathContext) {
    this.#internal = context;
  }

  /**
   * Set an arbitrary value in current file route path's context.
   * Child routes will also be able to retrieve the value.
   *
   * @param k Arbitrary key
   * @param v Arbitrary value
   * @returns `v`
   */
  set<T>(k: unknown, v: T): T {
    return this.#internal.set(k, v);
  }

  /**
   * Retrieve an arbitrary value from current file route path's context
   * Also searches parent routes, prioritizing closest relative.
   *
   * @param k Arbitrary key
   * @returns Arbitrary value if found, undefined otherwise
   */
  get<T>(k: unknown): T | undefined {
    return this.#internal.get(k);
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

/**
 * Convert an URL to a project-specific specifier when possible
 *
 * @param url URL (absolute)
 * @returns Project-specific specifier if possible, `url.href` otherwise
 */
export const urlToSpecifier = (url: URL): string => {
  if (url.protocol === "file:") {
    const r = relative(Deno.cwd(), url.pathname);
    if (!r.startsWith(RELATIVE_UP)) {
      return r;
    }
  }

  return url.href;
};

/**
 * Convert a project-specific specifier to an URL
 *
 * @param spec Project-specific specifier or stringified URL
 * @returns URL (absolute)
 */
export const specifierToUrl = (spec: string): URL => {
  try {
    return new URL(spec);
  } catch (_) {
    return new URL(spec, cwdUrl);
  }
};

const cwdUrl = toFileUrl(Deno.cwd()) + "/";
