import { type JS as 𐏑JS, js as 𐏑js } from "@classic/js";

type 𐏑M = typeof import("./../../../../dom/util.ts");

/**
 * Server wrapper for `@classic/js/dom/util`
 */
const util: 𐏑JS<𐏑M> = 𐏑js.module(
  "@classic/js/dom/util",
  import.meta.resolve("./util.js"),
  { imports: [] }
);

export default util;
