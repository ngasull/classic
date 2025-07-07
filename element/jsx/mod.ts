/**
 * JSX API for @classic/element
 *
 * @example Self-incrementing counter
 * ```tsx ignore
 * import { css, onDisconnect, define, element, signal } from "@classic/element";
 * import { render } from "@classic/element/jsx";
 *
 * define("x-counter", element({
 *   css: css`
 *     :host {
 *       color: "red";
 *     }
 *   `,
 *   js(host) {
 *     const [count, setCount] = signal(0);
 *
 *     render(host, <>Counting {count}</>)
 *
 *     const t = setInterval(() => setCount(count() + 1), 1000);
 *     onDisconnect(host, () => clearInterval(t));
 *   },
 * }));
 * ```
 *
 * @module
 */

export { Fragment, jsx, jsxs, ref, render, svgns, xmlns } from "./jsx.ts";
export type { ClassicElementJSXProps, CustomElements, JSX } from "./jsx.ts";
