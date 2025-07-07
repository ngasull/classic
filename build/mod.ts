/**
 * Simplified module bundling
 *
 * _Only internal use in classic at the moment_
 *
 * @module
 */

/** A generic type where `T` could have to be awaited */
export type Async<T> = T | PromiseLike<T>;

export { buildApp, devApp, loadApp } from "./app.ts";
export { buildModules } from "./modules.ts";
export type { AppBuild, BuildOpts } from "./app.ts";
export type { BuildContext, ModuleApi } from "./context.ts";
