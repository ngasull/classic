import { type JSX, render } from "@classic/html";
import { Fragment, jsx } from "@classic/html/jsx-runtime";
import { type Async, useBuild, useRoute } from "@classic/server/build";
import { RequestContext, type TypedRequest } from "@classic/server/runtime";
import { serveAsset } from "@classic/server/plugin/asset-serve";
import { resolveModule } from "@classic/server/plugin/bundle/runtime";
import { create as createHash } from "@jabr/xxhash64";
import { concat } from "@std/bytes";
import { encodeBase64 } from "@std/encoding";
import { basename } from "@std/path";
import { transform as transformCss } from "lightningcss";
import { type RouteParams, useGET } from "./serve.ts";
import { getStyleSheets } from "./stylesheets.ts";

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

  /**
   * Template function to build a style sheet to link to current layout
   *
   * @example Declare a style sheet that sets dark grey text color for every page of a layout
   * ```tsx
   * import { declareLayout, declareMutation, declarePage } from "@classic/router";
   *
   * export default () => {
   *   const layoutCss = declareLayout.css`
   *     body {
   *       color: #666;
   *     }
   *   `;
   *
   *   declareLayout((children, req) => (
   *     <html>
   *       <head>
   *         <layoutCss.Html />
   *       </head>
   *       <body>{children}</body>
   *     </html>
   *   ));
   * };
   * ```
   */
  css: typeof declareLayoutCss;
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

  useGET("*", () => {
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

  /**
   * Template function to build a style sheet to link to current page
   *
   * @example Declare a style sheet that sets dark grey text color for every page of a layout
   * ```ts
   * import { declareLayout, declareMutation, declarePage } from "@classic/router";
   *
   * export default () => {
   *   declarePage.css`
   *     body {
   *       color: #666;
   *     }
   *   `;
   * };
   * ```
   */
  css: typeof declarePageCss;
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

  useGET<Segment, Params>(segment, (req) => {
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

const cssTpl = async (
  tpl: TemplateStringsArray,
  ...values: Array<string | (() => Async<Uint8Array>)>
): Promise<Uint8Array> => {
  const interpolations = await Promise.all(
    values.map(async (v) =>
      typeof v === "string" ? encoder.encode(v) : await v()
    ),
  );
  const parts = interpolations.flatMap((v, i) => [
    typeof v === "string" ? encoder.encode(v) : v,
    encoder.encode(tpl[i + 1]),
  ]);
  parts.unshift(encoder.encode(tpl[0]));
  return concat(parts);
};

const declareLayoutCss = (
  tpl: TemplateStringsArray,
  ...values: Array<string | (() => Async<Uint8Array>)>
): ServedStyleSheet => {
  const path = useBuild(async () => {
    const path = pageCss({
      css: await cssTpl(tpl, ...values),
      fileName: "/layout.css",
    });

    useRoute(
      "GET",
      "*",
      import.meta.resolve("./stylesheets.ts"),
      await path,
    );

    return path;
  });

  return new ServedStyleSheet(path);
};

declareLayout.css = declareLayoutCss;

const declarePageCss = (
  tpl: TemplateStringsArray,
  ...values: Array<string | (() => Async<Uint8Array>)>
): void => {
  useBuild(async () => {
    const path = pageCss({
      css: await cssTpl(tpl, ...values),
      fileName: "/index.css",
    });

    useRoute(
      "GET",
      "",
      import.meta.resolve("./stylesheets.ts"),
      await path,
    );
  });
};

declarePage.css = declarePageCss;

/** API to link a style sheet */
class ServedStyleSheet {
  #path: Promise<string>;
  #Html?: JSX.FC;
  #linkElement?: JSX.Element;

  constructor(path: Promise<string>) {
    this.#path = path;
  }

  /** Public path to the style sheet */
  get path(): Promise<string> {
    return this.#path;
  }

  /** JSX component linking the stylesheet to the page */
  get Html(): JSX.FC {
    return this.#Html ??= async () => {
      const styleSheets = getStyleSheets();
      styleSheets.unshift(
        this.#linkElement ??= jsx("link", {
          rel: "stylesheet",
          href: await this.#path,
        }),
      );
      return Fragment({ children: styleSheets });
    };
  }
}

export const pageCss = ({ css, fileName }: {
  css: Uint8Array;
  fileName: string;
}): Promise<string> =>
  useBuild(async () => {
    const { code, map } = transformCss({
      filename: fileName,
      code: css,
      sourceMap: true,
    });

    const cssFileName = `/.css/${basename(fileName, ".css")}.${await encodeHash(
      code,
    )}.css`;

    const path = serveAsset({
      pathHint: cssFileName,
      contents: () => code,
    });

    if (map) {
      serveAsset({
        path: path + ".map",
        contents: () => map,
      });
    }

    return path;
  });

const encoder = new TextEncoder();

export const encodeHash = async (data: Uint8Array) => {
  const hasher = await createHash();
  hasher.update(data);
  return encodeBase64(hasher.digest() as Uint8Array);
};
