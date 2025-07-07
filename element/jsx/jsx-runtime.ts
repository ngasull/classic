/**
 * JSX runtime for @classic/element
 *
 * See [TypeScript's docs](https://www.typescriptlang.org/docs/handbook/jsx.html) for specifications
 *
 * @example deno.json
 * ```json
 * {
 *   "compilerOptions": {
 *     "jsx": "react-jsx",
 *     "jsxImportSource": "@classic/element"
 *   },
 *    "lib": [
 *      "DOM",
 *      "DOM.Iterable",
 *      "ES2021"
 *    ]
 * }
 * ```
 */

export { Fragment, jsx, jsxs } from "./jsx.ts";
export type { JSX } from "./jsx.ts";
