import { type JS as 𐏑JS, js as 𐏑js } from "@classic/js";
import 𐏑0 from "@classic/js/dom/util/js";

type 𐏑M = typeof import("./../../client-router.ts");

const router: 𐏑JS<𐏑M> = 𐏑js.module(
  "@classic/router",
  import.meta.resolve("./router.js"),
  { imports: [𐏑0] }
);

export default router;

export const init: 𐏑JS<𐏑M["init"]> = router["init"];
