import { Context } from "@classic/context";
import type { Async } from "../build/mod.ts";
import type { ClassicServer } from "./runtime.ts";

export const $request = Context.for<ClassicRequest<unknown>>(
  "classic.request",
);

export type Next = () => Promise<Response>;

const $next = Context.for<Next>("classic.next");

/**
 * Execute next middlewares immediately to work on returned {@linkcode Response}.
 */
export const useNext = (): Promise<Response> => {
  return $next.use()();
};

/**
 * Request context in the classic runtime
 */
export class ClassicRequest<Params> {
  constructor(
    /**  Server attached to the request */
    public readonly server: ClassicServer,
    /** Raw {@linkcode Request} */
    public readonly request: TypedRequest<Params>,
  ) {
    Object.defineProperty(this, "server", freezeProperty);
    Object.defineProperty(this, "request", freezeProperty);
  }

  readonly context = new Map<RequestContext<unknown>, unknown>();

  #url?: URL;
  /**
   * Requested {@linkcode URL}
   */
  get url(): URL {
    return this.#url ??= new URL(this.request.url);
  }
}

export class RequestPattern {
  constructor(
    /** Groups resolved from matched {@linkcode URLPattern} */
    public readonly groups: Record<string, string>,
    /** Matched {@linkcode URLPattern}'s pattern */
    public readonly matchedPattern: string,
  ) {}
}

export const $requestPattern = Context.for<RequestPattern>(
  "classic.requestPattern",
);

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
  <Params extends Record<string, string> = Record<string, string>>(): Params;
} = <T>(_req?: TypedRequest<T>): T => $requestPattern.get()!.groups as T;

/**
 * Use current request's matched router pattern
 */
export const useMatchedPattern = (): string =>
  $requestPattern.get()!.matchedPattern;

export type TypedRequest<Params> = Request & { "_@@params": Params };

/**
 * Middleware or handler function
 */
export type Middleware<Params = Record<never, string>> = (
  req: TypedRequest<Params>,
) => Async<Response | void | undefined>;

export const runMiddlewares = <Params>(
  [first, ...after]: Middleware<Params>[],
  req: Request,
): Async<Response> => {
  if (!first) return notFound();

  let hasNextBeenCalled = false;
  const next = async () => {
    if (hasNextBeenCalled) {
      throw Error(
        `useNext() has already been called`,
      );
    } else {
      return runMiddlewares(after, req);
    }
  };

  return $next.provide(
    next,
    async () => {
      const res = await first(req as TypedRequest<Params>);
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
  /**
   * Set an arbitrary value to this context to be available
   * everywhere during current request
   *
   * @param value Attached value
   * @returns Passed `value`
   */
  set(value: T): T {
    $request.use().context.set(this, value);
    return value;
  }

  /**
   * Retrieve an arbitrary request global value
   */
  get(): T | undefined {
    return $request.use().context.get(this) as T | undefined;
  }
}

const freezeProperty = {
  configurable: false,
  writable: false,
} satisfies PropertyDescriptor;
