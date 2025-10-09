/**
 * Generate typed JS on the fly to glue your logic together.
 *
 * - Native types can be used as JS values
 * - Proxy runtime operations to generated code (like property access, function calls and assignments)
 * - Keep track of manipulated references
 * - Import and track modules conveniently
 * - Convert to code or evaluate in current runtime for isomorphic code gen
 * - Evaluation smartly preserves runtime references when possible
 * - Output compact code
 *
 * @example Provide time in target platform
 * ```ts
 * import { js, toJs } from "@classic/js";
 *
 * const code = toJs(() => {
 *   const tomorrow = js.new(Date);
 *   tomorrow.setDate(js<number>`${tomorrow.getDate()} + 1`);
 *   return tomorrow.toISOString();
 * });
 *
 * // Generated code looks like:
 * // const tomorrow = new Date();
 * // tomorrow.setDate(tomorrow.getDate() + 1);
 * // return tomorrow.toISOString();
 * ```
 *
 * @example Render a react app
 * ```ts
 * import { js, jsGlobal, toJs } from "@classic/js";
 *
 * import type React from "npm:react";
 * import type { Root } from "npm:react-dom/client";
 *
 * const react = js.module<typeof import("npm:react-dom/client")>("npm:react-dom/client");
 * const app = js.module<{ render: (root: Root) => void }>(import.meta.resolve("./app.tsx"));
 *
 * const renderScript = toJs(() => {
 *   app.render(react.createRoot(jsGlobal.document.body));
 * });
 * ```
 *
 * @example Prevent clicks on every link of the document
 * ```ts
 * import { type JS, js, jsGlobal, toJs } from "@classic/js";
 *
 * const disableClicksScript = toJs(() => {
 *   jsGlobal.document.querySelectorAll("a").forEach((a) => {
 *     a.addEventListener("click", (e: JS<MouseEvent>) => {
 *       e.preventDefault();
 *     })
 *   });
 * });
 * ```
 *
 * @module
 */

export { isEvaluating, JSContext } from "./entity.ts";
export type { JSWrite } from "./entity.ts";
export { evalJs, js, jsGlobal, toJs } from "./js.ts";
export { asJs, isJs, unsafe } from "./proxy.ts";
export type { Fn, JS, JSArg, JSOverrides } from "./types.ts";
