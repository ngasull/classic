import { Fragment, jsx } from "./jsx-runtime.ts";
import type { JSX } from "./types.ts";
import { $build } from "./render.ts";
import { transform as transformCss } from "lightningcss";
import type { VoidElement } from "./void.ts";
import { createUseKey, type Use } from "./use.ts";

export const Bundle: JSX.FC = async (_, use) => {
  const { globalCssPublic, critical, dev } = use($build);
  const [js, css] = await Promise.all([critical.js, critical.css]);
  return Fragment({
    children: [
      ...globalCssPublic.map((href) =>
        jsx("link", { rel: "stylesheet", href })
      ),
      css ? jsx("style", { children: css }) : null,
      jsx("script", { children: js }),
      dev
        ? jsx("script", {
          children:
            `new EventSource("/.hmr").addEventListener("change", () => location.reload());`,
        })
        : null,
    ],
  });
};

export const cssContext = createUseKey<Set<string>>("css");

export const $addCss = (
  use: Use,
  ...styleSheets: [string, ...string[]]
): void => {
  const css = use.get(cssContext) ?? use.provide(cssContext, new Set());
  for (const s of styleSheets) css.add(s);
};

export const PageStyle: JSX.FC = async (_, use) => {
  const styleSheets = use.get(cssContext);
  return styleSheets
    ? jsx(Fragment, {
      children: [...styleSheets].map((s) =>
        jsx("link", { rel: "stylesheet", href: s })
      ),
    })
    : null;
};

export const Shadow: JSX.PFC = ({ children }, use) => {
  // const { globalCssPublic } = use($build);
  return jsx("template", {
    shadowrootmode: "open",
    children: [
      // ...globalCssPublic.map((href) =>
      //   jsx("link", { rel: "stylesheet", href })
      // ),
      children,
    ],
  });
};

export const Layout: JSX.PFC<{
  styleSheets?: readonly string[];
  style?: string;
  tag?: Exclude<keyof JSX.IntrinsicElements, VoidElement>;
  shadow: JSX.Children;
}> = ({ styleSheets, style, tag = "div", shadow, children }) =>
  jsx(tag, {
    children: [
      jsx(Shadow, {
        children: [
          styleSheets?.map((href) => jsx("link", { rel: "stylesheet", href })),
          style,
          shadow,
        ],
      }),
      children,
    ],
  });

const encoder = new TextEncoder();

export const css = (tpl: TemplateStringsArray): string => tpl[0];

export const minified = {
  css: (tpl: TemplateStringsArray): Uint8Array =>
    transformCss({
      filename: Deno.cwd(),
      code: encoder.encode(tpl[0]),
      minify: true,
      sourceMap: false,
    }).code,
};
