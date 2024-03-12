import type { MiddlewareHandler } from "./deps/hono.ts";
import { jsxRenderer } from "./hono/renderer.ts";
import { Bundle, BundleResult } from "./js/bundle.ts";
import { jsx } from "./jsx-runtime.ts";

export const jsxMachine = (
  bundle: Bundle | BundleResult,
): MiddlewareHandler => {
  const useJsx = jsxRenderer(bundle);
  return async (c, next) => {
    const servedRes = bundle instanceof Bundle && bundle.watched &&
      await bundle.watch()(c.req.raw);
    return servedRes && !c.finalized ? servedRes : useJsx(c, next);
  };
};

export const HTMLRoot = ({ lang, title }: {
  lang?: string;
  title?: string;
}) => {
  return jsx("html", {
    lang,
    children: [
      jsx("head", {
        children: [
          title ? jsx("title", { children: title }) : null,
          jsx("meta", { charset: "utf-8" }),
          jsx("meta", {
            name: "viewport",
            content: "width=device-width, initial-scale=1",
          }),
        ],
      }),
      jsx("body", { children: [] }),
    ],
  });
};
