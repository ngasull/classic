import type { Context } from "@classic/context";

export {
  indexedUris,
  inline,
  js,
  JSMetaBase,
  jsResources,
  mkJS,
  toJS,
  unsafe,
} from "./js.ts";
export type { Module } from "./js.ts";
export { isJSable, jsSymbol } from "./types.ts";
export type {
  Fn,
  JS,
  JSable,
  JSMeta,
  JSOverrides,
  RefTree,
  Resolver,
} from "./types.ts";

export type JSMetaContext = { readonly user: Context };
