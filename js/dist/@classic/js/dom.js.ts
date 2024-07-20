import { type JS as 𐏑JS, js as 𐏑js } from "@classic/js";
import 𐏑0 from "./dom/util.js.ts";

type 𐏑M = typeof import("./../../../dom.ts");

const dom: 𐏑JS<𐏑M> = 𐏑js.module(
  "@classic/js/dom",
  import.meta.resolve("./dom.js"),
  { imports: [𐏑0] }
);

export default dom;

export const refs: 𐏑JS<𐏑M["refs"]> = dom["refs"];
export const store: 𐏑JS<𐏑M["store"]> = dom["store"];
export const sub: 𐏑JS<𐏑M["sub"]> = dom["sub"];
