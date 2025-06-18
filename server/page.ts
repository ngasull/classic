import { type JSX, render } from "@classic/html";
import { jsx } from "@classic/html/jsx-runtime";
import { useResolver } from "@classic/server/plugin/bundle/runtime";
import {
  Buildable,
  RequestContext,
  type TypedRequest,
  useRequest,
} from "./mod.ts";

type LayoutFn<Params> = (
  children: JSX.Children,
  req: TypedRequest<Params>,
) => JSX.Element;

/**
 * Declare a layout
 *
 * @param segment Optional route segment to nest the layout into
 * @param layout JSX component that receives a page or sub-layout in the `children` property of its `context` parameter. Embedded in parent layout if any
 */
export const declareLayout = <Params = Record<never, string>>(
  layout: LayoutFn<Params>,
): Layout<Params> => new Layout(layout);

const $layouts = new RequestContext<JSX.PFC<{ req: TypedRequest<never> }>[]>();

class Layout<Params> extends Buildable<void> {
  readonly #layout: LayoutFn<Params>;

  constructor(layout: LayoutFn<Params>) {
    super((exported) => {
      exported.route({ pattern: "*" });
    });
    this.#layout = layout;
  }

  /** @internal */
  override handle(): void {
    const layouts = $layouts.get() ?? $layouts.set([]);
    layouts.push(({ children, req }) => this.#layout(children, req));
  }
}

/**
 * Declare a page
 *
 * @param segment Optional route segment to nest the page into
 * @param page JSX component to embed in parent layout if any
 */
export const declarePage = <Params>(
  page: (req: TypedRequest<Params>) => JSX.Element,
): Page<Params> => new Page(page);

class Page<Params> extends Buildable<void> {
  readonly #page: (req: TypedRequest<Params>) => JSX.Element;

  constructor(page: (req: TypedRequest<Params>) => JSX.Element) {
    super((exported) => {
      exported.route();
    });
    this.#page = page;
  }

  /** @internal */
  override handle(): Response {
    const req = useRequest<never>();
    const layouts = $layouts.get() ?? [];
    const el = layouts.reduceRight(
      (el, Layout) => jsx(Layout, { req }, el),
      jsx(() => this.#page(req)),
    );
    return new Response(
      render(el, { resolve: useResolver() }),
      {
        headers: {
          "Content-Type": "text/html; charset=UTF-8",
          "Content-Location": new URL(useRequest().url).pathname,
        },
      },
    );
  }
}
