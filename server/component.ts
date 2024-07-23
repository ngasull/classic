import type { ElementsBundle } from "@classic/build";
import { Fragment, jsx } from "./jsx-runtime.ts";
import type { JSXComponent } from "./types.ts";

export const Bundle: JSXComponent<ElementsBundle> = async (bundle) => {
  const [js, css] = await Promise.all([bundle.js, bundle.css]);
  const decoder = new TextDecoder();
  return Fragment({
    children: [
      css ? jsx("style", { children: decoder.decode(css) }) : null,
      jsx("script", { children: decoder.decode(js) }),
    ],
  });
};
