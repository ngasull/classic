import { $moduleRequest, type Method } from "./request.ts";
import {
  $buildable,
  type BuildableOptions,
  type HandlerResult,
} from "./module.ts";

/** Statically extract dynamic parameters from an URI */
export type RouteParams<T extends string> = T extends
  `${infer Before}:${infer Body}`
  ? Before extends "" | `${string}/`
    ? Body extends `${infer P}/${infer After}`
      ? { [p in P]: string } & RouteParams<After>
    : { [p in Body]: string }
  : RouteParams<Body>
  : unknown;

export type { DeclareMethod };

/** Method declaration as a buildable handler */
class DeclareMethod<Params> {
  readonly #method: Method;
  readonly #pattern?: string;
  readonly #handler: (groups: Params) => HandlerResult;

  /** @ignore */
  constructor(method: Method, handler: (groups: Params) => HandlerResult);
  constructor(
    method: Method,
    segment: string | undefined,
    handler: (groups: Params) => HandlerResult,
  );
  constructor(
    method: Method,
    pattern?: string | ((groups: Params) => HandlerResult),
    handler?: (groups: Params) => HandlerResult,
  ) {
    if (handler) {
      pattern = pattern as string;
    } else {
      handler = pattern as (groups: Params) => HandlerResult;
      pattern = undefined;
    }

    this.#method = method;
    this.#pattern = pattern;
    this.#handler = handler;
  }

  /** @ignore */
  [$buildable](): BuildableOptions {
    return {
      build: (exported) => {
        exported.route({ method: this.#method, pattern: this.#pattern });
      },

      handle: () => this.#handler($moduleRequest.use().groups as Params),
    };
  }
}

/**
 * Declare an HTTP handler
 *
 * @param method HTTP {@linkcode Method}
 * @param segment Optional route segment to nest the handler into
 * @param handler Custom request handler
 */
export const httpMethod: {
  <Params = Record<never, string>>(
    method: Method,
    handler: (groups: Params) => HandlerResult,
  ): DeclareMethod<Params>;
  <Segment extends string, Params = Record<never, string>>(
    method: Method,
    segment: Segment | undefined,
    handler: (groups: Params & RouteParams<Segment>) => HandlerResult,
  ): DeclareMethod<Params & RouteParams<Segment>>;
  <Params extends Record<string, string>>(
    method: Method,
    segment: string | undefined,
    handler: (groups: Params) => HandlerResult,
  ): DeclareMethod<Params>;
} = (method: Method, ...args: unknown[]): DeclareMethod<unknown> =>
  // @ts-ignore forward dynamically
  new DeclareMethod(method, ...args);

/**
 * Declare an HTTP GET handler
 *
 * @param segment Optional route segment to nest the handler into
 * @param handler Custom request handler
 */
export const httpGET: {
  <Params = Record<never, string>>(
    handler: (groups: Params) => HandlerResult,
  ): DeclareMethod<Params>;
  <Segment extends string, Params = Record<never, string>>(
    segment: Segment | undefined,
    handler: (groups: Params & RouteParams<Segment>) => HandlerResult,
  ): DeclareMethod<Params & RouteParams<Segment>>;
  <Params extends Record<string, string>>(
    segment: string | undefined,
    handler: (groups: Params) => HandlerResult,
  ): DeclareMethod<Params>;
} = (...args: unknown[]): DeclareMethod<unknown> =>
  // @ts-ignore forward dynamically
  new DeclareMethod("GET", ...args);

/**
 * Declare an HTTP POST handler
 *
 * @param segment Optional route segment to nest the handler into
 * @param handler Custom request handler
 */
export const httpPOST: {
  <Params = Record<never, string>>(
    handler: (groups: Params) => HandlerResult,
  ): DeclareMethod<Params>;
  <Segment extends string, Params = Record<never, string>>(
    segment: Segment | undefined,
    handler: (groups: Params & RouteParams<Segment>) => HandlerResult,
  ): DeclareMethod<Params & RouteParams<Segment>>;
  <Params extends Record<string, string>>(
    segment: string | undefined,
    handler: (groups: Params) => HandlerResult,
  ): DeclareMethod<Params>;
} = (...args: unknown[]): DeclareMethod<unknown> =>
  // @ts-ignore forward dynamically
  new DeclareMethod("POST", ...args);
