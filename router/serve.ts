import { Context } from "@classic/context";
import type { Stringifiable } from "@classic/js/stringify";
import {
  Asset,
  type Async,
  restoreBuild,
  useRoute,
} from "@classic/server/build";
import {
  type Method,
  type Middleware,
  type TypedRequest,
  useFetch,
  useRequest,
} from "@classic/server/runtime";

export type RouteParams<T extends string> = T extends
  `${infer Before}:${infer Body}`
  ? Before extends "" | `${string}/`
    ? Body extends `${infer P}/${infer After}`
      ? { [p in P]: string } & RouteParams<After>
    : { [p in Body]: string }
  : RouteParams<Body>
  : unknown;

export const $routeBuild = Context.for<RouteBuild>("classic.routeBuild");

export class RouteBuild {
  constructor(
    public readonly modulePath: string,
    public readonly built: Stringifiable[] = [],
    public readonly requested?: [
      TypedRequest<Record<never, string>>,
      number,
      (res: Async<Response | void | undefined>) => void,
    ],
  ) {}

  #builtMeta?: Asset;
  get builtMeta() {
    return this.#builtMeta ??= new Asset(() => this.built);
  }

  handlers: Array<Middleware<never>> = [];
}

export const useMethod: {
  (method: Method, handler: Middleware<Record<never, string>>): void;
  <Segment extends string>(
    method: Method,
    segment: Segment | undefined,
    handler: Middleware<RouteParams<Segment>>,
  ): void;
} = <Segment extends string>(
  method: Method,
  segment?: Segment | Middleware<unknown>,
  handler?: Middleware<RouteParams<Segment>>,
): void => {
  if (handler) {
    segment = segment as Segment;
  } else {
    handler = segment as Middleware<unknown>;
    segment = undefined;
  }

  const { builtMeta, handlers, modulePath, requested } = $routeBuild.use();

  handlers.push(handler);

  if (requested) {
    const [req, handlerIndex, handleResponse] = requested;

    if (handlerIndex === handlers.length - 1) {
      handleResponse(
        handler(req as TypedRequest<RouteParams<Segment>>),
      );
    }
  } else {
    useRoute(
      method as Method,
      segment ?? "",
      import.meta.url,
      modulePath,
      builtMeta,
      handlers.length - 1,
    );
  }
};

export const useGET: {
  <Params = Record<never, string>>(handler: Middleware<Params>): void;
  <Segment extends string, Params = Record<never, string>>(
    segment: Segment | undefined,
    handler: Middleware<Params & RouteParams<Segment>>,
  ): void;
  <Params extends Record<string, string>>(
    segment: string | undefined,
    handler: Middleware<Params>,
  ): void;
} = (...args: unknown[]): Async<void> =>
  // @ts-ignore forward dynamically
  useMethod("GET", ...args);

export const usePOST: {
  <Params = Record<never, string>>(handler: Middleware<Params>): void;
  <Segment extends string, Params = Record<never, string>>(
    segment: Segment | undefined,
    handler: Middleware<Params & RouteParams<Segment>>,
  ): void;
  <Params extends Record<string, string>>(
    segment: string | undefined,
    handler: Middleware<Params>,
  ): void;
} = (...args: unknown[]): Async<void> =>
  // @ts-ignore forward dynamically
  useMethod("POST", ...args);

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

// NB: this handler is specific to hooks usage (`defineRoute`)
export default async (
  modulePath: string,
  metaAsset: Asset<Stringifiable[]>,
  handlerIndex: number,
): Promise<Middleware> => {
  const [route, built] = await Promise.all([
    import(modulePath)
      .then(({ default: route }) =>
        route as (modulePath: string) => Async<void>
      )
      .catch((e) => {
        console.info("Failed importing %s - see below", modulePath);
        throw e;
      }),
    metaAsset.contents(),
  ]);

  let restored: Promise<Stringifiable[]> | undefined;

  return async (req) => {
    const res = Promise.withResolvers<Response | void | undefined>();

    restored ??= metaAsset.contents();

    await restoreBuild(
      (await restored).slice(),
      () =>
        $routeBuild.provide(
          new RouteBuild(
            modulePath,
            built.slice(),
            [req, handlerIndex, res.resolve],
          ),
          route,
          modulePath,
        ),
    );

    const timeout = Promise.withResolvers<Response | void | undefined>();
    const t = setTimeout(() => timeout.reject(), 10000);

    return Promise.race([
      res.promise,
      timeout.promise,
    ]).finally(() => clearTimeout(t));
  };
};
