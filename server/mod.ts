export type Async<T> = T | PromiseLike<T>;

export type { Build, BuildRoute } from "./build.ts";
export { build } from "./build.ts";
export { Bundle, css, Layout, PageStyle, Shadow } from "./component.ts";
export { Context } from "./context.ts";
export type { ContextInterface } from "./context.ts";
export { fileRouter, route } from "./file-router.ts";
export type { FileRoute } from "./file-router.ts";
export { mutation } from "./file-router/mutation.ts";
export { layout, page } from "./file-router/page.ts";
export { Key } from "./key.ts";
export { load, RequestContext } from "./middleware.ts";
export type { MiddlewareContext } from "./middleware.ts";
export { staticContents } from "./middleware/staticContents.ts";
export { Effect, render } from "./render.ts";
export type { FCProps, JSX } from "./types.ts";
