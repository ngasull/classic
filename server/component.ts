import { Fragment, jsx } from "./jsx-runtime.ts";
import type { ClassicBundle } from "./serve-element.ts";
import type { JSXComponent } from "./types.ts";

export const Bundle: JSXComponent<ClassicBundle> = async (bundle) => {
  const [js, css] = await Promise.all([bundle.js, bundle.css]);
  const decoder = new TextDecoder();
  return Fragment({
    children: [
      css ? jsx("style", { children: decoder.decode(css) }) : null,
      jsx("script", { children: decoder.decode(js) }),
    ],
  });
};
