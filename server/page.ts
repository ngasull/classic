import { type JSX, render } from "@classic/html";
import { jsx } from "@classic/html/jsx-runtime";
import {
  type BuildableOptions,
  specifierToUrl,
  type TypedRequest,
  urlToSpecifier,
  useRequest,
} from "./mod.ts";

const $layout = Symbol.for("classic.page.layout");

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

class Layout<Params> {
  constructor(layout: LayoutFn<Params>) {
    this[$layout] = layout;
  }

  /** @internal */
  [$layout]: LayoutFn<Params>;

  /** @ignore */
  [Symbol.for("classic.buildable")](): BuildableOptions {
    return {
      build: (exported) => {
        const layouts =
          exported.context.get<Array<[string, string]>>($layout) ?? [];
        exported.context.set($layout, [
          ...layouts,
          [urlToSpecifier(exported.url), exported.name],
        ]);
      },
    };
  }

  /** @ignore */
  [Symbol.for("Deno.customInspect")](_opts: Deno.InspectOptions): string {
    return `Layout`;
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

class Page<Params> {
  readonly #page: (req: TypedRequest<Params>) => JSX.Element;

  constructor(page: (req: TypedRequest<Params>) => JSX.Element) {
    this.#page = page;
  }

  /** @ignore */
  [Symbol.for("classic.buildable")](): BuildableOptions {
    return ({
      build: (exported) => {
        exported.route({
          params: [
            exported.context.get<ReadonlyArray<[string, string]>>($layout),
          ],
        });
      },

      handle: async (layoutKeys) => {
        const req = useRequest<never>();
        const layouts = await Promise.all(
          (layoutKeys as ReadonlyArray<[string, string]>)
            .map(async ([spec, name]) => {
              const module = await import(specifierToUrl(spec).href);
              return module[name] as Layout<Params>;
            }),
        );
        const el = layouts.reduceRight<JSX.Element>(
          (el, layout) => layout[$layout](el, req),
          jsx(() => this.#page(req)),
        );
        return new Response(render(el), {
          headers: {
            "Content-Type": "text/html; charset=UTF-8",
            "Content-Location": new URL(useRequest().url).pathname,
          },
        });
      },
    });
  }

  /** @ignore */
  [Symbol.for("Deno.customInspect")](_opts: Deno.InspectOptions): string {
    return `Page`;
  }
}
