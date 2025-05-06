import { type JSX, render } from "@classic/html";
import { jsx } from "@classic/html/jsx-runtime";
import { RequestContext, type TypedRequest } from "@classic/server/runtime";
import { resolveModule } from "@classic/server/plugin/bundle/runtime";
import { declareGET, type RouteParams } from "./serve.ts";

type Layout<Params> = (
  children: JSX.Children,
  context: TypedRequest<Params>,
) => JSX.Element;

/**
 * Declare a layout
 *
 * @param segment Optional route segment to nest the layout into
 * @param layout JSX component that receives a page or sub-layout in the `children` property of its `context` parameter. Embedded in parent layout if any
 */
export const declareLayout: {
  <Segment extends string, Params = Record<never, string>>(
    segment: Segment,
    layout: Layout<Params & RouteParams<Segment>>,
  ): void;
  <Params = Record<never, string>>(layout: Layout<Params>): void;
} = <Segment extends string>(
  segment?: Segment | Layout<Record<never, string>>,
  userLayout?: Layout<unknown>,
) => {
  if (userLayout) {
    segment = segment as Segment;
  } else {
    userLayout = segment as Layout<unknown>;
    segment = undefined;
  }

  declareGET("*", () => {
    let layouts = $layouts.get();
    if (!layouts) $layouts.set(layouts = []);
    layouts.push(({ children, req }) => userLayout(children, req));
  });
};

const $layouts = new RequestContext<JSX.PFC<{ req: TypedRequest<never> }>[]>();

/**
 * Declare a page
 *
 * @param segment Optional route segment to nest the page into
 * @param page JSX component to embed in parent layout if any
 */
export const declarePage: {
  <Segment extends string>(
    segment: Segment,
    page: (req: TypedRequest<RouteParams<Segment>>) => JSX.Element,
  ): void;
  <Params = Record<never, string>>(
    page: (req: TypedRequest<Params>) => JSX.Element,
  ): void;
} = <Segment extends string, Params>(
  segment?:
    | ((context: TypedRequest<Params>) => JSX.Element)
    | Segment,
  page?: (context: TypedRequest<Params>) => JSX.Element,
) => {
  if (page) {
    segment = segment as Segment;
  } else {
    page = segment as (context: TypedRequest<Params>) => JSX.Element;
    segment = undefined;
  }

  declareGET<Segment, Params>(segment, (req) => {
    const layouts = $layouts.get() ?? [];
    const el = layouts.reduceRight(
      (el, Layout) => jsx(Layout, { req: req as TypedRequest<never> }, el),
      jsx(() => page(req)),
    );
    return new Response(
      render(el, { resolve: resolveModule }),
      {
        headers: {
          "Content-Type": "text/html; charset=UTF-8",
          "Content-Location": new URL(req.url).pathname,
        },
      },
    );
  });
};
