/**
 * # Classic server
 *
 * Develop a buildable web server without external tool.
 * This module is intended to be used by plugin developers
 * rather than web app developers as it handles the lower-level
 * build system.
 *
 * For web app development, see {@link https://jsr.io/@classic/page|@classic/page}
 *
 * @module
 */

/** A generic type where `T` could have to be awaited */
export type Async<T> = T | PromiseLike<T>;

export { Asset } from "./asset.ts";
export type { AssetOptions } from "./asset.ts";
export {
  Build,
  BuildResult,
  defineServer,
  useBuild,
  useRoute,
} from "./build.ts";
export { restoreBuild } from "../runtime/runtime.ts";
