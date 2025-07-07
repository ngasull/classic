import {
  type DeclareMethod,
  type HandlerResult,
  httpPOST,
  type RouteParams,
  useRedirect,
} from "@classic/server";

/**
 * Declare a mutation
 *
 * @param segment Optional route segment to nest the mutation into
 * @param handler Custom request handler
 */
export const declareMutation: {
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
} = <Segment extends string, Params extends Record<string, string>>(
  segment?: Segment | ((groups: Params) => HandlerResult),
  handler?: (groups: Params) => HandlerResult,
): DeclareMethod<Params> => {
  if (handler) {
    segment = segment as Segment;
  } else {
    handler = segment as (groups: Params) => HandlerResult;
    segment = undefined;
  }

  return httpPOST<Params>(segment, async (req) => {
    let handlerResponse = await handler(req);
    if (handlerResponse) return handlerResponse;

    return useRedirect(new URL(".", req.url).pathname.slice(0, -1));
  });
};
