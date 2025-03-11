import type { BuildContext } from "@classic/build";
import { type Context, Key } from "@classic/context";
import { type JSX, render } from "@classic/html";
import { Fragment, jsx } from "@classic/html/jsx-runtime";
import { type Build, ClassicRequestBase } from "@classic/server";
import type { ClassicServer } from "@classic/server/runtime";
import { serveAsset } from "@classic/server/plugin/asset-serve";
import { resolveModule } from "@classic/server/plugin/bundle/runtime";
import { create as createHash } from "@jabr/xxhash64";
import { concat } from "@std/bytes";
import { encodeBase64 } from "@std/encoding";
import { basename } from "@std/path";
import { transform as transformCss } from "lightningcss";
import { GET } from "./build.ts";
import type { FileBuild } from "./serve.ts";
import { $styleSheets } from "./stylesheets.ts";

class LayoutContext<Params> extends ClassicRequestBase<Params> {
  constructor(
    context: Context,
    server: ClassicServer,
    req: Request,
    public readonly children: JSX.Children,
  ) {
    super(context, server, req);
  }
}

/**
 * Declare a layout
 *
 * @param layout JSX component that receives a page or sub-layout in the `children` property of its `context` parameter. Embedded in parent layout if any
 */
export const layout:
  & (
    <Params>(
      r: FileBuild<Params>,
      layout: (context: LayoutContext<Params>) => JSX.Element,
    ) => void
  )
  & {
    /**
     * Template function to build a style sheet to link to current layout
     *
     * @example Declare a style sheet that sets dark grey text color for every page of a layout
     * ```ts
     * const layoutStyleSheet = route.use(layout.css`
     *   body {
     *     color: #666;
     *   }
     * `);
     * ```
     */
    css: (
      tpl: TemplateStringsArray,
      ...values: Array<string | Uint8Array>
    ) => (
      route: FileBuild<{ [n in never]: never }>,
    ) => Promise<ServedStyleSheet>;
  } = (r, userLayout) => {
    r.segment("/*").use(GET, async (ctx) => {
      const layouts = ctx.get($layouts) ?? ctx.provide($layouts, []);
      layouts.push(({ children }) =>
        userLayout(
          new LayoutContext<never>(
            ctx._context,
            ctx.runtime,
            ctx.request,
            children,
          ),
        )
      );
      return ctx.next();
    });
  };

const $layouts = new Key<JSX.PFC[]>("layouts");

export const $buildContext = new Key<BuildContext>("build context");

/**
 * Declare a page
 *
 * @param page JSX component to embed in parent layout if any
 */
export const page:
  & (
    <Params>(
      r: FileBuild<Params>,
      page: (context: ClassicRequestBase<Params>) => JSX.Element,
    ) => Promise<void>
  )
  & {
    /**
     * Template function to build a style sheet to link to current page
     *
     * @example Declare a style sheet that sets dark grey text color for every page of a layout
     * ```ts
     * const layoutStyleSheet = route.use(layout.css`
     *   body {
     *     color: #666;
     *   }
     * `);
     * ```
     */
    css: (
      tpl: TemplateStringsArray,
      ...values: Array<string | Uint8Array>
    ) => (
      route: FileBuild<{ [n in never]: never }>,
    ) => Promise<void>;
  } = async (r, userPage) => {
    r.use(GET, async (ctx) => {
      const layouts = ctx.get($layouts) ?? [];
      const el = layouts.reduceRight(
        (el, Layout) => jsx(Layout, null, el),
        jsx(() =>
          userPage(
            new ClassicRequestBase(ctx._context, ctx.runtime, ctx.request),
          )
        ),
      );
      return new Response(
        render(el, { context: ctx._context, resolve: ctx.use(resolveModule) }),
        {
          headers: {
            "Content-Type": "text/html; charset=UTF-8",
          },
        },
      );
    });
  };

const makeTpl =
  <T>(cb: (css: Uint8Array) => T) =>
  (tpl: TemplateStringsArray, ...values: Array<string | Uint8Array>): T => {
    const parts = values.flatMap((v, i) => [
      typeof v === "string" ? encoder.encode(v) : v,
      encoder.encode(tpl[i + 1]),
    ]);
    parts.unshift(encoder.encode(tpl[0]));
    return cb(concat(parts));
  };

layout.css = makeTpl((css) => async (r) =>
  new ServedStyleSheet(
    await r.build(pageCss, {
      css,
      fileName: "/layout.css",
    }),
  )
);

page.css = makeTpl((css) => async (r) => {
  r.build(async (build) => {
    const path = await build.use(pageCss, {
      css,
      fileName: "/index.css",
    });

    build.method(
      "GET",
      import.meta.resolve("./stylesheets.ts"),
      path,
    );
  });
});

/** API to link a style sheet */
class ServedStyleSheet {
  #path: string;

  #Html?: JSX.FC;
  #linkElement?: JSX.Element;

  constructor(path: string) {
    this.#path = path;
  }

  /** Public path to the style sheet */
  get path(): string {
    return this.#path;
  }

  /** JSX component linking the stylesheet to the page */
  get Html(): JSX.FC {
    return this.#Html ??= (_, context) => {
      const styleSheets = context.get($styleSheets)?.slice() ?? [];
      styleSheets.unshift(
        this.#linkElement ??= jsx("link", {
          rel: "stylesheet",
          href: this.#path,
        }),
      );
      return Fragment({ children: styleSheets });
    };
  }
}

export const pageCss = async (build: Build, { css, fileName }: {
  css: Uint8Array;
  fileName: string;
}): Promise<string> => {
  const { code, map } = transformCss({
    filename: fileName,
    code: css,
    sourceMap: true,
  });

  const cssFileName = `${basename(fileName, ".css")}.${await encodeHash(
    code,
  )}.css`;

  const path = build.use(serveAsset, {
    pathHint: cssFileName,
    contents: () => code,
  });

  if (map) {
    build.use(serveAsset, {
      path: path + ".map",
      contents: () => map,
    });
  }

  return path;
};

const encoder = new TextEncoder();

export const encodeHash = async (data: Uint8Array) => {
  const hasher = await createHash();
  hasher.update(data);
  return encodeBase64(hasher.digest() as Uint8Array);
};
