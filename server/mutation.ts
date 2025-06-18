import {
  type DeclareMethod,
  declarePOST,
  type Middleware,
  type RouteParams,
  useRedirect,
} from "@classic/server";

export const declareMutation: {
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
} = <Segment extends string, Params extends Record<string, string>>(
  segment?: Segment | Middleware<Params>,
  handler?: Middleware<Params>,
): DeclareMethod<Params> => {
  if (handler) {
    segment = segment as Segment;
  } else {
    handler = segment as Middleware<Params>;
    segment = undefined;
  }

  return declarePOST<Params>(segment, async (req) => {
    let handlerResponse = await handler(req);
    if (handlerResponse) return handlerResponse;

    return useRedirect(new URL(".", req.url).pathname.slice(0, -1));
  });
};
