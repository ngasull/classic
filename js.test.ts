import { assertEquals } from "./deps/std/assert.ts";
import { js, resource } from "./js.ts";

Deno.test("js.ts", async (test) => {
  await test.step("interpolation with replacements", async () => {
    const r = resource("r", () => ({ i: 1 }));
    assertEquals(await js.eval(js`1 + ${js`1+${r.i}+1`} + 1`), 5);
  });

  await test.step("array interpolation", async () => {
    assertEquals(await js.eval(js`${["a", "b", "c"]}.join("")`), "abc");
  });

  await test.step("object interpolation", async () => {
    assertEquals(
      await js.eval(
        js`Object.entries(${{
          a: 1,
          b: 2,
          c: 3,
        }}).map(([k,v]) => k + v).join(" ")`,
      ),
      "a1 b2 c3",
    );
  });
});
