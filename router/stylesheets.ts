import type { JSX } from "@classic/html";
import { jsx } from "@classic/html/jsx-runtime";
import { type Middleware, RequestContext } from "@classic/server/runtime";

const $styleSheets = new RequestContext<JSX.Element[]>();

export const getStyleSheets = (): JSX.Element[] =>
  $styleSheets.get()?.slice() ?? [];

export default (href: string): Middleware => () => {
  const styleSheets = $styleSheets.get() ?? $styleSheets.set([]);
  styleSheets.push(jsx("link", { rel: "stylesheet", href }));
};
