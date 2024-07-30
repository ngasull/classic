import type { Bundle as BundleType } from "@classic/build/bundle";
import { Fragment, jsx } from "./jsx-runtime.ts";
import type { JSXComponent } from "./types.ts";
import { $build } from "./router.ts";
import { Html } from "./render.ts";

export const Bundle: JSXComponent<BundleType> = async (_, use) => {
  const { globalCss, critical, dev } = use($build);
  const [js, css] = await Promise.all([critical.js, critical.css]);
  return Fragment({
    children: [
      globalCss ? jsx("link", { rel: "stylesheet", href: globalCss }) : null,
      css ? jsx("style", { children: jsx(Html, { contents: css }) }) : null,
      jsx("script", { children: jsx(Html, { contents: js }) }),
      dev
        ? jsx("script", {
          children:
            `new EventSource("/.hmr").addEventListener("change", () => location.reload());`,
        })
        : null,
    ],
  });
};
