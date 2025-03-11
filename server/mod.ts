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
export type { NewAssetOptions } from "./asset.ts";
export type { Build, BuildAssetOptions } from "./build.ts";
export { defineServer } from "./build.ts";
export { ClassicRequestBase } from "./request.ts";
export type { ClassicRequest, Middleware } from "./request.ts";
