/**
 * # Classic server
 *
 * Develop a buildable backend without external tool.
 * Integrates with the Classic stack in a cohesive way.
 *
 * @module
 */

/** A generic type where `T` could have to be awaited */
export type Async<T> = T | PromiseLike<T>;

export { Asset } from "./asset.ts";
export type { Build } from "./build.ts";
export { defineServer } from "./build.ts";
export { ClassicRequestBase } from "./request.ts";
export type { ClassicRequest, Middleware } from "./request.ts";
