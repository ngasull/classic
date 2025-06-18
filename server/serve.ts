import { type Method, type Middleware, useRequest } from "./request.ts";
import { Buildable, type HandlerResult } from "./module.ts";

export type RouteParams<T extends string> = T extends
  `${infer Before}:${infer Body}`
  ? Before extends "" | `${string}/`
    ? Body extends `${infer P}/${infer After}`
      ? { [p in P]: string } & RouteParams<After>
    : { [p in Body]: string }
  : RouteParams<Body>
  : unknown;

export type { DeclareMethod };

class DeclareMethod<Params> extends Buildable<void> {
  readonly #handler: Middleware<Params>;

  constructor(method: Method, handler: Middleware<Params>);
  constructor(
    method: Method,
    segment: string | undefined,
    handler: Middleware<Params>,
  );
  constructor(
    method: Method,
    pattern?: string | Middleware<Params>,
    handler?: Middleware<Params>,
  ) {
    if (handler) {
      pattern = pattern as string;
    } else {
      handler = pattern as Middleware<unknown>;
      pattern = undefined;
    }

    super((exported) => exported.route({ method, pattern }));
    this.#handler = handler;
  }

  override handle(): HandlerResult {
    return this.#handler(useRequest<Params>());
  }
}

export const declareMethod: {
  <Params = Record<never, string>>(
    method: Method,
    handler: Middleware<Params>,
  ): DeclareMethod<Params>;
  <Segment extends string, Params = Record<never, string>>(
    method: Method,
    segment: Segment | undefined,
    handler: Middleware<Params & RouteParams<Segment>>,
  ): DeclareMethod<Params & RouteParams<Segment>>;
  <Params extends Record<string, string>>(
    method: Method,
    segment: string | undefined,
    handler: Middleware<Params>,
  ): DeclareMethod<Params>;
} = (method: Method, ...args: unknown[]): DeclareMethod<unknown> =>
  // @ts-ignore forward dynamically
  new DeclareMethod(method, ...args);

export const declareGET: {
  <Params = Record<never, string>>(
    handler: Middleware<Params>,
  ): DeclareMethod<Params>;
  <Segment extends string, Params = Record<never, string>>(
    segment: Segment | undefined,
    handler: Middleware<Params & RouteParams<Segment>>,
  ): DeclareMethod<Params & RouteParams<Segment>>;
  <Params extends Record<string, string>>(
    segment: string | undefined,
    handler: Middleware<Params>,
  ): DeclareMethod<Params>;
} = (...args: unknown[]): DeclareMethod<unknown> =>
  // @ts-ignore forward dynamically
  new DeclareMethod("GET", ...args);

export const declarePOST: {
  <Params = Record<never, string>>(
    handler: Middleware<Params>,
  ): DeclareMethod<Params>;
  <Segment extends string, Params = Record<never, string>>(
    segment: Segment | undefined,
    handler: Middleware<Params & RouteParams<Segment>>,
  ): DeclareMethod<Params & RouteParams<Segment>>;
  <Params extends Record<string, string>>(
    segment: string | undefined,
    handler: Middleware<Params>,
  ): DeclareMethod<Params>;
} = (...args: unknown[]): DeclareMethod<unknown> =>
  // @ts-ignore forward dynamically
  new DeclareMethod("POST", ...args);
