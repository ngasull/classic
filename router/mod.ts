/**
 * Minimal routing script to enable dynamic navigation in any standard website.
 *
 * Features :
 * - Differential morphing between pages
 * - Morph shadow DOM when possible
 * - Execute scripts from received pages
 * - Understand "Content-Location" as pre-rendered redirections
 * - Compiles down super small (loads ultra fast)
 *
 * @example Enable dynamic routing in current window
 * ```ts ignore
 * import { init } from "@classic/router";
 * init();
 * ```
 *
 * @module
 */

export { init } from "./router.ts";
