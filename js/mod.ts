/**
 * Generate typed JS on the fly.
 *
 * Keeps track of manipulated references, outputs compact code.
 *
 * @example Provide time in target platform
 * ```ts
 * import { js } from "@classic/js";
 *
 * const now = js<Date>`new Date()`;
 * const time = js.string`Time is ${now.getHours()}:${now.getMinutes()}`;
 *
 * // Generated code looks like:
 * // let now = new Date();
 * // let time = `Time is ${now.getHours()}:${now.getMinutes()}`;
 * ```
 *
 * @example Render a react app
 * ```ts
 * import { js, type JS } from "@classic/js";
 *
 * import type React from "npm:react";
 * import type { Root } from "npm:react-dom/client";
 *
 * const react = js.module<typeof import("npm:react-dom/client")>("npm:react-dom/client");
 * const app = js.module<{ render: (root: Root) => void }>(import.meta.resolve("./app.tsx"));
 *
 * const clientJs = app.render(react.createRoot(js.window.document.body));
 * ```
 *
 * @example Prevent clicks on every link of the document
 * ```ts
 * import { js, type JS } from "@classic/js";
 *
 * const disableClicks = js.window.document.querySelectorAll("a").forEach((a) =>
 *   a.addEventListener("click", (e: JS<MouseEvent>) => [
 *     e.preventDefault(),
 *   ])
 * );
 * ```
 *
 * @module
 */

export {
  indexedUris,
  inline,
  js,
  JSMetaBase,
  jsResources,
  mkJS,
  store,
  toJs,
  unsafe,
} from "./js.ts";
export type { Module } from "./js.ts";
export { isJSable, jsSymbol } from "./types.ts";
export type { Fn, JS, JSable, JSMeta, JSOverrides, Resolver } from "./types.ts";
