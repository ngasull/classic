import { makeWebModuleHandler } from "./api/router.ts";
import type { MiddlewareHandler } from "./deps/hono.ts";
import { WebBundle } from "./js/web.ts";
import { jsx } from "./jsx-runtime.ts";

declare module "./deps/hono.ts" {
  interface ContextVariableMap {
    [bundleSymbol]: WebBundle;
  }
}

export const bundleSymbol = Symbol("bundle");

export const webModules = (webBundle: WebBundle): MiddlewareHandler => {
  const handleModule = makeWebModuleHandler(webBundle);
  return (c, next) => {
    const res = handleModule(c.req.raw);
    if (res && !c.finalized) return Promise.resolve(res);

    c.set(bundleSymbol, webBundle);
    return next();
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
