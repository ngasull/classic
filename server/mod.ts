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

export type { Build } from "./build.ts";
export { defineServer } from "./build.ts";
export { Bundle, css, Layout, PageStyle, Shadow } from "./component.ts";
export { BaseContext, createContext } from "./context.ts";
export type { Context } from "./context.ts";
export { fileRouter, route } from "./file-router.ts";
export type {} from "./file-router.ts";
export { mutation } from "./file-router/mutation.ts";
export { layout, page } from "./file-router/page.ts";
export { Key } from "./key.ts";
export { ClassicRequestBase } from "./request.ts";
export { devModules } from "./plugin/build.ts";
export { resolveModule } from "./plugin/build-serve.ts";
export { serveAsset } from "./plugin/serveAsset.ts";
export { Effect, render } from "./render.ts";
export type { ClassicRequest, Middleware } from "./request.ts";
export type { FCProps, JSX } from "./types.ts";
