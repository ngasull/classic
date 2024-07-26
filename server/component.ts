import type { Bundle as BundleType } from "@classic/build/bundle";
import { Fragment, jsx } from "./jsx-runtime.ts";
import type { JSXComponent } from "./types.ts";

export const Bundle: JSXComponent<BundleType> = async (bundle) => {
  const [js, css] = await Promise.all([bundle.js, bundle.css]);
  const decoder = new TextDecoder();
  return Fragment({
    children: [
      css ? jsx("link", { rel: "stylesheet", href:"/global.css" }) : null,
      jsx("script", { children: decoder.decode(js) }),
    ],
  });
};
