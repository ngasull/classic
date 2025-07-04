import { Context } from "@classic/context";
import type { HandlerResult, RouteModule } from "./module.ts";
import type { ClassicServer } from "./runtime.ts";

export type Method = "GET" | "POST" | "DELETE" | "PATCH" | "PUT";

export const $moduleRequest = Context.for<ModuleRequest<unknown>>(
  "classic.request",
);

export type Next = () => Promise<Response>;

const $next = Context.for<Next>("classic.next");

/**
 * Execute next middlewares immediately to work on returned {@linkcode Response}.
 */
export const useNext = (): Promise<Response> => $next.use()();

/**
 * Request context in the classic runtime
 */
export class ClassicRequest<Params> {
  constructor(
    /**  Server attached to the request */
    public readonly server: ClassicServer,
    /** Raw {@linkcode Request} */
    public readonly raw: TypedRequest<Params>,
  ) {}

  readonly context = new Map<RequestContext<unknown>, unknown>();

  #url?: URL;
  /** Requested {@linkcode URL} */
  get url(): URL {
    return this.#url ??= new URL(this.raw.url);
  }
}

export class ModuleRequest<Params> {
  constructor(
    /** Classic request */
    public readonly request: ClassicRequest<Params>,
    /** Module declared by the request */
    public readonly module: RouteModule,
    /** Groups resolved from matched {@linkcode URLPattern} */
    public readonly groups: Record<string, string>,
    /** Matched {@linkcode URLPattern}'s pattern */
    public readonly matchedPattern: string,
  ) {}
}

/** {@linkcode Request} but typed with parameter groups */
export type TypedRequest<Params> = Request & { "_@@params": Params };

/**
 * Retrieves the active {@linkcode Request} from current context
 */
export const useRequest = <Params>(): TypedRequest<Params> =>
  $moduleRequest.use().request.raw as TypedRequest<Params>;

/**
 * Use current request's matched parameter groups
 *
 * @param _req Current typed request: allows returning statically typed groups
 */
export const useParams: {
  <R extends TypedRequest<unknown>>(
    req: R,
  ): R extends TypedRequest<infer Params> ? Params : never;
  <T>(req: TypedRequest<T>): T;
  <Params = Record<string, string>>(): Params;
} = <T>(_req?: TypedRequest<T>): T => $moduleRequest.use().groups as T;

/**
 * Use current request's matched router pattern
 */
export const useMatchedPattern = (): string =>
  $moduleRequest.use().matchedPattern;

/**
 * Fetch a {@linkcode Response} in current server's context
 *
 * @param req The {@linkcode Request} to send
 */
export const useFetch = (req: Request): Promise<Response> =>
  $moduleRequest.use().request.server.fetch(req);

/**
 * Redirects to requested path, preferrably softly when
 * current request comes from classic router.
 *
 * @param pathname The from which to send the {@linkcode Response}
 */
export const useRedirect = async (pathname: string): Promise<Response> => {
  const req = useRequest();
  const isClassicRoute = req.headers.has("Classic-Route");
  const contentLocation = new URL(pathname, req.url);

  return isClassicRoute
    ? useFetch(new Request(contentLocation))
    : Response.redirect(contentLocation);
};

export const runMiddlewares = (
  [first, ...after]: Array<() => HandlerResult>,
): Response | PromiseLike<Response> => {
  if (!first) return notFound();

  let hasNextBeenCalled = false;
  const next = async () => {
    if (hasNextBeenCalled) {
      throw Error(
        `useNext() has already been called`,
      );
    } else {
      return runMiddlewares(after);
    }
  };

  return $next.provide(
    next,
    async () => {
      const res = await first();
      if (res) return res;
      if (hasNextBeenCalled) {
        throw Error(
          `Middlewares must return a Response when useNext() has been called`,
        );
      }
      return next();
    },
  );
};

const notFoundResponse = new Response(`Not found`, { status: 404 });

export const notFound = async () => notFoundResponse.clone();

/**
 * API to set and get request-level arbitrary context
 */
export class RequestContext<T> {
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
   * everywhere during current request
   *
   * @param value Attached value
   * @returns Passed `value`
   */
  set(value: T): T {
    $moduleRequest.use().request.context.set(this, value);
    return value;
  }

  /**
   * Retrieve an arbitrary request global value
   */
  get(): T | undefined {
    const context = $moduleRequest.use().request.context;
    let value: T | undefined;
    if (context.has(this)) {
      value = context.get(this) as T;
    } else if (this.#init) {
      context.set(this, value = this.#init());
    }
    return value;
  }

  /**
   * Require an arbitrary request global value
   */
  use(): T {
    const context = $moduleRequest.use().request.context;
    if (context.has(this)) {
      return context.get(this) as T;
    } else if (this.#init) {
      const value = this.#init();
      context.set(this, value);
      return value;
    } else {
      throw Error(
        `RequestContext can't be used as it hasn't been set and has no initializer`,
      );
    }
  }
}
