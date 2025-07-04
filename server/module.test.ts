import { assertEquals } from "@std/assert";
import { specifierToUrl, urlToSpecifier } from "./module.ts";

Deno.test("urlToSpecifier", () => {
  assertEquals(
    urlToSpecifier(new URL(import.meta.resolve("./foo/bar"))),
    "server/foo/bar",
  );
});

Deno.test("specifierToUrl", () => {
  assertEquals(
    specifierToUrl("server/foo/bar").href,
    import.meta.resolve("./foo/bar"),
  );
});
