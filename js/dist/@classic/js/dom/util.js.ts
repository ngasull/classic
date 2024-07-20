import { type JS as 𐏑JS, js as 𐏑js } from "@classic/js";

type 𐏑M = typeof import("./../../../../dom/util.ts");

const util: 𐏑JS<𐏑M> = 𐏑js.module(
  "@classic/js/dom/util",
  import.meta.resolve("./util.js"),
  { imports: [] }
);

export default util;

export const $: 𐏑JS<𐏑M["$"]> = util["$"];
export const FALSE: 𐏑JS<𐏑M["FALSE"]> = util["FALSE"];
export const NULL: 𐏑JS<𐏑M["NULL"]> = util["NULL"];
export const Promise: 𐏑JS<𐏑M["Promise"]> = util["Promise"];
export const TRUE: 𐏑JS<𐏑M["TRUE"]> = util["TRUE"];
export const UNDEFINED: 𐏑JS<𐏑M["UNDEFINED"]> = util["UNDEFINED"];
export const adoptNode: 𐏑JS<𐏑M["adoptNode"]> = util["adoptNode"];
export const arraySlice: 𐏑JS<𐏑M["arraySlice"]> = util["arraySlice"];
export const assign: 𐏑JS<𐏑M["assign"]> = util["assign"];
export const call: 𐏑JS<𐏑M["call"]> = util["call"];
export const cloneNode: 𐏑JS<𐏑M["cloneNode"]> = util["cloneNode"];
export const dataset: 𐏑JS<𐏑M["dataset"]> = util["dataset"];
export const deepMap: 𐏑JS<𐏑M["deepMap"]> = util["deepMap"];
export const defineProperties: 𐏑JS<𐏑M["defineProperties"]> = util["defineProperties"];
export const dispatchPrevented: 𐏑JS<𐏑M["dispatchPrevented"]> = util["dispatchPrevented"];
export const doc: 𐏑JS<𐏑M["doc"]> = util["doc"];
export const domParse: 𐏑JS<𐏑M["domParse"]> = util["domParse"];
export const entries: 𐏑JS<𐏑M["entries"]> = util["entries"];
export const eventType: 𐏑JS<𐏑M["eventType"]> = util["eventType"];
export const first: 𐏑JS<𐏑M["first"]> = util["first"];
export const forEach: 𐏑JS<𐏑M["forEach"]> = util["forEach"];
export const forOf: 𐏑JS<𐏑M["forOf"]> = util["forOf"];
export const freeze: 𐏑JS<𐏑M["freeze"]> = util["freeze"];
export const fromEntries: 𐏑JS<𐏑M["fromEntries"]> = util["fromEntries"];
export const getOwnPropertyDescriptors: 𐏑JS<𐏑M["getOwnPropertyDescriptors"]> = util["getOwnPropertyDescriptors"];
export const global: 𐏑JS<𐏑M["global"]> = util["global"];
export const html: 𐏑JS<𐏑M["html"]> = util["html"];
export const hyphenize: 𐏑JS<𐏑M["hyphenize"]> = util["hyphenize"];
export const id: 𐏑JS<𐏑M["id"]> = util["id"];
export const ifDef: 𐏑JS<𐏑M["ifDef"]> = util["ifDef"];
export const insertBefore: 𐏑JS<𐏑M["insertBefore"]> = util["insertBefore"];
export const isArray: 𐏑JS<𐏑M["isArray"]> = util["isArray"];
export const isFunction: 𐏑JS<𐏑M["isFunction"]> = util["isFunction"];
export const isString: 𐏑JS<𐏑M["isString"]> = util["isString"];
export const keys: 𐏑JS<𐏑M["keys"]> = util["keys"];
export const last: 𐏑JS<𐏑M["last"]> = util["last"];
export const length: 𐏑JS<𐏑M["length"]> = util["length"];
export const listen: 𐏑JS<𐏑M["listen"]> = util["listen"];
export const location: 𐏑JS<𐏑M["location"]> = util["location"];
export const memo1: 𐏑JS<𐏑M["memo1"]> = util["memo1"];
export const noop: 𐏑JS<𐏑M["noop"]> = util["noop"];
export const parse: 𐏑JS<𐏑M["parse"]> = util["parse"];
export const popR: 𐏑JS<𐏑M["popR"]> = util["popR"];
export const preventDefault: 𐏑JS<𐏑M["preventDefault"]> = util["preventDefault"];
export const pushR: 𐏑JS<𐏑M["pushR"]> = util["pushR"];
export const querySelector: 𐏑JS<𐏑M["querySelector"]> = util["querySelector"];
export const querySelectorAll: 𐏑JS<𐏑M["querySelectorAll"]> = util["querySelectorAll"];
export const remove: 𐏑JS<𐏑M["remove"]> = util["remove"];
export const replaceWith: 𐏑JS<𐏑M["replaceWith"]> = util["replaceWith"];
export const reverseForOf: 𐏑JS<𐏑M["reverseForOf"]> = util["reverseForOf"];
export const routeLoadEvent: 𐏑JS<𐏑M["routeLoadEvent"]> = util["routeLoadEvent"];
export const stopPropagation: 𐏑JS<𐏑M["stopPropagation"]> = util["stopPropagation"];
export const toLowerCase: 𐏑JS<𐏑M["toLowerCase"]> = util["toLowerCase"];
export const values: 𐏑JS<𐏑M["values"]> = util["values"];
export const win: 𐏑JS<𐏑M["win"]> = util["win"];
