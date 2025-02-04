export type Async<T> = T | PromiseLike<T>;

export type { Build, BuildFunction, BuildRoute } from "./build.ts";
export { build } from "./build.ts";
export { Bundle, css, Layout, PageStyle, Shadow } from "./component.ts";
export { BaseContext, createContext } from "./context.ts";
export type { Context } from "./context.ts";
export { fileRouter, route } from "./file-router.ts";
export type {} from "./file-router.ts";
export { mutation } from "./file-router/mutation.ts";
export { layout, page } from "./file-router/page.ts";
export { Key } from "./key.ts";
export { load, RequestContext } from "./middleware.ts";
export type { Middleware, MiddlewareContext } from "./middleware.ts";
export { serveAsset } from "./plugin/asset.ts";
export { Effect, render } from "./render.ts";
export type { FCProps, JSX } from "./types.ts";
