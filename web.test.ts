import { assertThrows } from "./deps/std/assert.ts";
import { Bundle } from "./js/bundle.ts";

Deno.test("web", async (test) => {
  const bundle = Bundle.init();
  bundle.add(import.meta.resolve("./js/bundle.ts"));
  await bundle.build();

  await test.step("prevent modules to be added after build started", () => {
    assertThrows(() => {
      bundle.add(import.meta.resolve("./js.ts"));
    });
  });
});
