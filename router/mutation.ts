import { type Middleware, useRedirect } from "@classic/server/runtime";
import { declarePOST, type RouteParams } from "./serve.ts";

export const declareMutation: {
  <Segment extends string>(
    segment: Segment,
    handler: Middleware<RouteParams<Segment>>,
  ): void;
  <Params = Record<never, string>>(handler: Middleware<Params>): void;
} = <Segment extends string, Params extends Record<string, string>>(
  segment?: Segment | Middleware<Params>,
  handler?: Middleware<Params>,
): void => {
  if (handler) {
    segment = segment as Segment;
  } else {
    handler = segment as Middleware<Params>;
    segment = undefined;
  }

  declarePOST<Params>(segment, async (req) => {
    let handlerResponse = await handler(req);
    if (handlerResponse) return handlerResponse;

    return useRedirect(new URL(".", req.url).pathname.slice(0, -1));
  });
};
