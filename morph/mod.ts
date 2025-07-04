/**
 * Update DOM trees preserving as much content as possible
 *
 * @example Simple morphing navigation
 * ```ts
 * import { morph } from "@classic/morph";
 *
 * const handleNavigate = async (url: URL) => {
 *   if (url.hostname === location.hostname) {
 *     const res = await fetch(url);
 *     const patch = new DOMParser().parseFromString(await res.text(), "text/html");
 *     morph(document, patch);
 *   } else {
 *     location.href = url.href;
 *   }
 * };
 * ```
 *
 * @module
 */

export { morph, morphChildren } from "./morph.ts";
