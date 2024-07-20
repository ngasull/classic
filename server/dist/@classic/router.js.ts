import { type JS as 𐏑JS, js as 𐏑js } from "@classic/js";
import 𐏑0 from "@classic/js/dom/util/client";

type 𐏑M = typeof import("./../../client-router.ts");

/**
 * Server wrapper for `@classic/router`
 */
const router: 𐏑JS<𐏑M> = 𐏑js.module(
  "@classic/router",
  import.meta.resolve("./router.js"),
  { imports: [𐏑0] }
);

export default router;
