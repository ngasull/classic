/**
 * Update DOM trees preserving as much content as possible
 *
 * `<script>` are evaluated when morphed
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

export { onCleanup } from "./lifecycle.ts";
export { morph, morphChildren } from "./morph.ts";
