import { Key } from "@classic/context";
import type { JSX } from "@classic/html";
import { jsx } from "@classic/html/jsx-runtime";
import type { Middleware } from "@classic/server";

export const $styleSheets = new Key<JSX.Element[]>("styleSheets");

export default (href: string): Middleware => (ctx) => {
  const styleSheets = ctx.get($styleSheets) ?? ctx.provide($styleSheets, []);
  styleSheets.push(jsx("link", { rel: "stylesheet", href }));
  return ctx.next();
};
