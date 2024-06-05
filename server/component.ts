import { ClassicBundle } from "classic/element/serve";
import { Fragment, jsx } from "./jsx-runtime.ts";
import { createContext } from "./render.ts";
import { JSXComponent } from "./types.ts";

export const classicBundleContext = createContext<ClassicBundle>(
  "classicBundle",
);

export const Bundle: JSXComponent = async (_, ctx) => {
  const classicBundle = ctx(classicBundleContext);
  const [js, css] = await Promise.all([classicBundle.js, classicBundle.css]);
  const decoder = new TextDecoder();
  return Fragment({
    children: [
      css ? jsx("style", { children: decoder.decode(css) }) : null,
      jsx("script", { children: decoder.decode(js) }),
    ],
  });
};
