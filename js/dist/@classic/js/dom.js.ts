import { type JS as 𐏑JS, js as 𐏑js } from "@classic/js";
import 𐏑0 from "./dom/util.js.ts";

type 𐏑M = typeof import("./../../../dom.ts");

/**
 * Server wrapper for `@classic/js/dom`
 */
const dom: 𐏑JS<𐏑M> = 𐏑js.module(
  "@classic/js/dom",
  import.meta.resolve("./dom.js"),
  { imports: [𐏑0] }
);

export default dom;
