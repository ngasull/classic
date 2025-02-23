import { BaseContext } from "./context.ts";
import { Key } from "./key.ts";
import type { Async } from "./mod.ts";
import type { ClassicServer } from "./server.ts";

const noop = () => {};
export const asyncNoop = async () => {};

export type Middleware<Params = Record<never, string>> = (
  ctx: MiddlewareContext<Params>,
) => Async<Response | void>;

export const $runtime = new Key<ClassicServer>("runtime");
export const $urlGroups = new Key<Record<string, string>>("urlGroups");
export const $matchedPattern = new Key<string>("matchedPattern");

export class ClassicRequest<Params> extends BaseContext {
  constructor(runtime: ClassicServer, req: Request);
  constructor(context: ClassicRequest<unknown>);
  // deno-lint-ignore constructor-super
  constructor(
    runtimeOrCtx: ClassicServer | ClassicRequest<unknown>,
    req?: Request,
  ) {
    if (runtimeOrCtx instanceof ClassicRequest) {
      super(runtimeOrCtx);
      this.#runtime = runtimeOrCtx.#runtime;
      this.#request = runtimeOrCtx.#request;
    } else {
      super();
      this.#runtime = runtimeOrCtx;
      this.#request = req!;
    }
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
}

export class MiddlewareContext<Params> extends ClassicRequest<Params> {
  constructor(
    handle: Middleware<Params>,
    runtime: ClassicServer,
    req: Request,
  );
  constructor(
    handle: Middleware<Params>,
    runtime: MiddlewareContext<unknown>,
  );
  constructor(
    handle: Middleware<Params>,
    runtimeOrCtx: ClassicServer | ClassicRequest<unknown>,
    req?: Request,
  ) {
    // @ts-ignore TS won't infer this because constructor is overloaded
    super(runtimeOrCtx, req);
    this.#next = handle;
  }

  readonly #next: Middleware<Params>;

  async next(): Promise<Response | void> {
    return this.#next(this);
  }

  #url?: URL;
  get url() {
    return this.#url ??= new URL(this.request.url);
  }
}

export const chainMiddlewares = <Params>(
  ...middlewares: Middleware<Params>[]
): Middleware<Params> =>
  // @ts-ignore Goal is to provide type safety from the outside
  middlewares.reduceRight<Middleware<Params>>(
    (next, p) => (parent) =>
      p(new MiddlewareContext(next, parent as MiddlewareContext<unknown>)),
    noop,
  );
