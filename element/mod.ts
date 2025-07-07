/**
 * Thinnest layer over custom elements (Web Components)
 *
 * @example Red date
 * ```tsx ignore
 * import { css, define, element } from "@classic/element";
 *
 * define("x-now", element({
 *   css: css`
 *     :host {
 *       color: "red";
 *     }
 *   `,
 *   js(host) {
 *     host.textContent = new Date().toLocaleString();
 *   },
 * }));
 * ```
 *
 * @example Self-incrementing counter
 * ```tsx ignore
 * import { onDisconnect, define, element, signal } from "@classic/element";
 * import { render } from "@classic/element/jsx";
 *
 * define("x-counter", element({
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
 * @example Custom button with SVG icon
 * ```tsx ignore
 * import { css, define, element } from "@classic/element";
 * import { render, svgns } from "@classic/element/jsx";
 *
 * define(
 *   "x-button",
 *   element({
 *     css: css`
 *       :host {
 *         color: "red";
 *       }
 *       svg {
 *         width: 30px;
 *         height: 30px;
 *       }
 *     `,
 *     props: { circle: Boolean, type: String },
 *     js(host) {
 *       render(
 *         host,
 *         <button type={host.type}>
 *           {svgns(() => (
 *             <svg>
 *               {host.circle
 *                 ? <circle r="15" fill="blue" cx={15} cy={15} />
 *                 : <rect cx={15} cy={15} />}
 *             </svg>
 *           ))}
 *           <slot />
 *         </button>,
 *       );
 *     },
 *   }),
 * );
 * ```
 *
 * @module
 */

export {
  css,
  define,
  element,
  onAdopt,
  onDisconnect,
  shadow,
} from "./element.ts";

export * from "./props.ts";

export type * from "./props.ts";

export type { CustomElement, ElementOptions, ElementProps } from "./element.ts";

export { onChange, signal, track } from "./signal.ts";
export type { Signal } from "./signal.ts";
