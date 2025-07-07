/**
 * Declare assets at build time to be available at run time.
 *
 * @example Serve a dark mode stylesheet and link to it
 * ```ts
 * import { ServedAsset } from "./asset-serve.ts";
 *
 * const darkMode = new ServedAsset({
 *   pathHint: "dark-mode.css",
 *   contents: () => `html { background: black; color: white; }`,
 * });
 *
 * const htmlLink = `<link rel="stylesheet" href="${darkMode.path}" />`;
 * // NB: this example's HTML is not safe
 * ```
 *
 * @module
 */

export { ServedAsset } from "./asset-serve.ts";
export type { ServeAssetOptions } from "./asset-serve.ts";
