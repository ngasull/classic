import { makeWebModuleHandler } from "./api/router.ts";
import type { MiddlewareHandler } from "./deps/hono.ts";
import { jsxRenderer } from "./hono/renderer.ts";
import { BundleResult } from "./js/web.ts";
import { jsx } from "./jsx-runtime.ts";

export const augmente = (webBundle: BundleResult): MiddlewareHandler => {
  const handleModule = makeWebModuleHandler(webBundle);
  const useJsx = jsxRenderer(webBundle);
  return (c, next) => {
    const res = handleModule(c.req.raw);
    return res && !c.finalized ? Promise.resolve(res) : useJsx(c, next);
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
