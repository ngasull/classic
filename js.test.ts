import { assertEquals } from "./deps/std/assert.ts";
import { EffectAPI } from "./dom.ts";
import { varArg } from "./dom/arg-alias.ts";
import { JSONable } from "./dom/store.ts";
import { js, resource, toRawJS } from "./js.ts";
import { JS } from "./js/types.ts";

Deno.test("js interpolation with replacements", async () => {
  const r = resource("r", () => ({ i: 1 }));
  assertEquals(await js.eval(js`1 + ${js`1+${r.i}+1`} + 1`), 5);
});

Deno.test("js array interpolation", async () => {
  assertEquals(await js.eval(js`${["a", "b", "c"]}.join("")`), "abc");
});

Deno.test("js object interpolation", async () => {
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

Deno.test("js.comma evaluates and types based of last expression", async () => {
  const chained: JS<2> = js.comma(js<1>`1`, js<2>`2`);
  assertEquals(await js.eval(chained), 2);
});

Deno.test("toRawJS variable ref mapping", () => {
  const a = js<{ a: 1 }>`{a:1}`.a;
  const [rawJS] = toRawJS(() => js`${a} + ${a}`);
  assertEquals(
    rawJS,
    `let ${varArg}0={a:1}.a;return ${varArg}0 + ${varArg}0`,
  );
});

Deno.test("toRawJS declares variables as deep as possible (for now, simple, little risk)", () => {
  const [rawJS, a] = toRawJS((a) => {
    const fn1 = js.fn(() => js<number>`${a}`);
    const res1 = fn1();
    const fn2 = js.fn(() => js`${res1}+${res1}`);
    return fn2();
  });
  assertEquals(
    rawJS,
    `return (()=>{let ${varArg}0=(()=>(${a}))();return ${varArg}0+${varArg}0})()`,
  );
});

Deno.test("toRawJS declares variables across multiple statements", () => {
  const [rawJS, a] = toRawJS((a) => {
    const fn1 = js.fn(() => [js<number>`return ${a}`]);
    const res1 = fn1();
    const fn2 = js.fn(() => [js`return ${res1}+${res1}`]);
    return fn2();
  });
  assertEquals(
    rawJS,
    `return (()=>{let ${varArg}0=(()=>{return ${a}})();return ${varArg}0+${varArg}0})()`,
  );
});

Deno.test("toRawJS declares variables across cleanup-type instance", () => {
  const [rawJS, arg] = toRawJS((arg) => {
    const a = js`${arg}`;
    return [a, js`return ${a}`];
  });
  assertEquals(rawJS, `let ${varArg}0=${arg};${varArg}0;return ${varArg}0`);
});
