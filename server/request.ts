import type { Context, Parameters1N } from "./context.ts";
import { Key } from "./key.ts";
import type { Async } from "./mod.ts";
import type { ClassicServer } from "./server.ts";

const $url = new Key<URL>("url");

export const $runtime = new Key<ClassicServer>("runtime");
export const $urlGroups = new Key<Record<string, string>>("urlGroups");
export const $matchedPattern = new Key<string>("matchedPattern");

const nextAlreadyCalled = (): never => {
  throw Error(`Next function has already been called`);
};

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
  get _context(): Context {
    return this.#context;
  }

  readonly #runtime: ClassicServer;
  get runtime(): ClassicServer {
    return this.#runtime;
  }

  readonly #request: Request;
  get request() {
    return this.#request;
  }

  get groups(): Readonly<Params> {
    return this.use($urlGroups) as Readonly<Params>;
  }

  get matchedPattern(): string {
    return this.use($matchedPattern);
  }

  get url() {
    return this.get($url) ?? this.provide($url, new URL(this.request.url));
  }

  use<T>(key: Key<T>): T;
  use<Use extends (context: Context, ...args: never[]) => unknown>(
    use: Use,
    ...args: Parameters1N<Use>
  ): ReturnType<Use>;
  use(...args: never[]) {
    // @ts-ignore forward to context
    return this.#context.use(...args);
  }

  has<T>(key: Key<T>): boolean {
    return this.#context.has(key);
  }

  get<T>(key: Key<T>): T | undefined {
    return this.#context.get(key);
  }

  provide<K extends Key<unknown>>(
    key: K,
    value: K extends Key<infer T> ? T : never,
  ): K extends Key<infer T> ? T : never {
    return this.#context.provide(key, value);
  }

  delete<T>(key: Key<T>): void {
    return this.#context.delete(key);
  }
}

export type ClassicRequest<Params> = ClassicRequestBase<
  Params,
  () => Async<Response | void>
>;

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
      () => next ? runMiddlewares(next, after, context, server, req) : notFound,
    ),
  );

export const notFound = new Response(`Not found`, { status: 404 });
