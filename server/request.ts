import { type Context, Key, type UseArgs } from "@classic/context";
import type { Async } from "./mod.ts";
import type { ClassicServer } from "./runtime.ts";

const $url = new Key<URL>("url");

export const $runtime = new Key<ClassicServer>("runtime");
export const $urlGroups = new Key<Record<string, string>>("urlGroups");
export const $matchedPattern = new Key<string>("matchedPattern");

const nextAlreadyCalled = (): never => {
  throw Error(`Next function has already been called`);
};

/**
 * @internal
 * Base {@linkcode ClassicRequest} implementation
 */
export class ClassicRequestBase<
  Params,
  Next extends undefined | (() => Async<Response | void>) = undefined,
> {
  constructor(
    context: Context,
    server: ClassicServer,
    req: Request,
    next?: Next,
  ) {
    this.#context = context;
    this.#runtime = server;
    this.#request = req;

    if (next) {
      this.next = (async () => {
        this.next = nextAlreadyCalled as never;
        return next();
      }) as typeof this.next;
    }
  }

  next!: undefined extends Next ? undefined : () => Promise<Response | void>;
  readonly #context: Context;
  readonly #runtime: ClassicServer;
  readonly #request: Request;

  /**
   * @internal
   * Underlying {@linkcode Context}
   */
  get _context(): Context {
    return this.#context;
  }

  /**
   * Runtime attached to the request
   */
  get runtime(): ClassicServer {
    return this.#runtime;
  }

  /**
   * Raw {@linkcode Request}
   */
  get request() {
    return this.#request;
  }

  /**
   * Groups resolved from matched {@linkcode URLPattern}
   */
  get groups(): Readonly<Params> {
    return this.use($urlGroups) as Readonly<Params>;
  }

  /**
   * Matched {@linkcode URLPattern}'s pattern
   */
  get matchedPattern(): string {
    return this.use($matchedPattern);
  }

  /**
   * Requested {@linkcode URL}
   */
  get url(): URL {
    return this.get($url) ?? this.provide($url, new URL(this.request.url));
  }

  /**
   * Retrive a value from current request's {@linkcode Context}
   */
  use<T>(key: Key<T>): T;
  /**
   * Logic abstraction alternative
   */
  use<Use extends (context: Context, ...args: never[]) => unknown>(
    use: Use,
    ...args: UseArgs<Use>
  ): ReturnType<Use>;
  use(...args: never[]) {
    // @ts-ignore forward to context
    return this.#context.use(...args);
  }

  /**
   * Check the existence of a {@linkcode Key} in current request's {@linkcode Context}
   */
  has<T>(key: Key<T>): boolean {
    return this.#context.has(key);
  }

  /**
   * Get a value from current request's {@linkcode Context}
   */
  get<T>(key: Key<T>): T | undefined {
    return this.#context.get(key);
  }

  /**
   * Provide a value in current request's {@linkcode Context}
   */
  provide<K extends Key<unknown>>(
    key: K,
    value: K extends Key<infer T> ? T : never,
  ): K extends Key<infer T> ? T : never {
    return this.#context.provide(key, value);
  }

  /**
   * Delete a value from current request's {@linkcode Context}
   */
  delete<T>(key: Key<T>): void {
    return this.#context.delete(key);
  }
}

/**
 * Request context in the classic runtime
 */
export type ClassicRequest<Params> = ClassicRequestBase<
  Params,
  () => Async<Response | void>
>;

/**
 * Middleware or handler function
 */
export type Middleware<Params = Record<never, string>> = (
  ctx: ClassicRequest<Params>,
) => Async<Response | void>;

export const runMiddlewares = <Params>(
  first: Middleware<Params>,
  [next, ...after]: Middleware<Params>[],
  context: Context,
  server: ClassicServer,
  req: Request,
): Async<Response | void> =>
  first(
    new ClassicRequestBase(
      context,
      server,
      req,
      next ? () => runMiddlewares(next, after, context, server, req) : notFound,
    ),
  );

const notFoundResponse = new Response(`Not found`, { status: 404 });

export const notFound = () => notFoundResponse.clone();
