import type { Context } from "@classic/context";

export {
  indexedUris,
  inline,
  js,
  JSMetaBase,
  jsResources,
  mkJS,
  store,
  toJS,
  unsafe,
} from "./js.ts";
export type { Module } from "./js.ts";
export { isJSable, jsSymbol } from "./types.ts";
export type { Fn, JS, JSable, JSMeta, JSOverrides, Resolver } from "./types.ts";

export type JSMetaContext = { readonly user: Context };
