import { assertEquals } from "./deps/std/assert.ts";
import { argn, varArg } from "./dom/arg-alias.ts";
import { js, resource, toRawJS } from "./js.ts";
import { JS } from "./js/types.ts";

Deno.test("toRawJS variable ref mapping", () => {
  const a = js<{ a: 1 }>`{a:1}`.a;
  const [rawJS] = toRawJS(() => js`${a} + ${a}`);
  assertEquals(
    rawJS,
    `let ${varArg}0={a:1}.a;return ${varArg}0 + ${varArg}0;`,
  );
});

Deno.test("toRawJS declares variables in the same scope as current runtime", () => {
  const [rawJS, a] = toRawJS((a) => {
    const fn1 = js.fn(() => js<number>`${a} + 1`);
    const res1 = fn1();
    const fn2 = js.fn(() => js`${res1} + ${res1}`);
    return fn2();
  });
  assertEquals(
    rawJS,
    `let ${varArg}0=(()=>(${a} + 1))();return (()=>(${varArg}0 + ${varArg}0))();`,
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
    `let ${varArg}0=(()=>{return ${a}})();return (()=>{return ${varArg}0+${varArg}0})();`,
  );

  assertEquals(
    toRawJS(() => {
      const id = js.fn(() => js`1`);
      return [id(), id()];
    })[0],
    `let ${varArg}0=()=>(1);${varArg}0();${varArg}0();`,
  );
});

Deno.test("toRawJS declares variables across cleanup-type instance", () => {
  const [rawJS] = toRawJS(() => {
    const a = js`setTimeout()`;
    return js.fn(() => js`clearTimeout(${a})`);
  });
  assertEquals(
    rawJS,
    `let ${varArg}0=setTimeout();return (()=>(clearTimeout(${varArg}0)));`,
  );
});

Deno.test("toRawJS returns expressions as a return statement", () => {
  assertEquals(toRawJS(() => js`1 + 1`)[0], `return 1 + 1;`);
});

Deno.test("toRawJS reuses functions across global uses", () => {
  const addd = js.fn((a: JS<number>) => js<number>`${a}+${a}`);
  const addd1 = addd(1);
  const addd2 = addd(2);
  assertEquals(
    toRawJS(() => js.fn(() => [addd1, addd2]))[0],
    `let ${varArg}0=${argn(0)}=>(${argn(0)}+${
      argn(0)
    }),${varArg}1=${varArg}0(1),${varArg}2=${varArg}0(2);return (()=>{${varArg}1;${varArg}2});`,
  );
});

Deno.test("toRawJS scope arguments independently than passed value", () => {
  const value = js<number>`a`;
  const addd = js.fn((a: JS<number>) => js<number>`${a}+${a}`);
  const addd1 = addd(value);
  const addd2 = addd(value);
  assertEquals(
    toRawJS(() => js.fn(() => [addd1, addd2]))[0],
    `let ${varArg}0=${argn(0)}=>(${argn(0)}+${
      argn(0)
    }),${varArg}1=a,${varArg}2=${varArg}0(${varArg}1),${varArg}3=${varArg}0(${varArg}1);return (()=>{${varArg}2;${varArg}3});`,
  );
  assertEquals(
    toRawJS(() => js.fn(() => [addd(value), addd(value)]))[0],
    `let ${varArg}0=${argn(0)}=>(${argn(0)}+${
      argn(0)
    }),${varArg}1=a;return (()=>{${varArg}0(${varArg}1);${varArg}0(${varArg}1)});`,
  );
});

Deno.test("toRawJS won't broken-assign inner js.comma", () => {
  const [rawJS, a, b] = toRawJS((a, b) => {
    const r = js.comma(js`${a}.foo`, b);
    return js.fn(() => r);
  });
  assertEquals(
    rawJS,
    `let ${varArg}0=(${a}.foo,${b});return (()=>(${varArg}0));`,
  );
});

Deno.test("toRawJS won't broken-assign inner js.string interpolation", () => {
  const [rawJS, a] = toRawJS((a) => {
    const r = js.string`/foo/${a}`;
    return js.fn(() => r);
  });
  assertEquals(
    rawJS,
    `let ${varArg}0=\`/foo/\${${a}}\`;return (()=>(${varArg}0));`,
  );
});

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

Deno.test("js.string works without interpolation", () => {
  const [rawJS] = toRawJS(() => js.string`/foo`);
  assertEquals(rawJS, `return \`/foo\`;`);
});

Deno.test("js.string escapes backticks and dollars", () => {
  const [rawJS, a, b] = toRawJS((a, b) =>
    js.string`/\`\$/${a}/\`\$/${b}/\$\`/`
  );
  assertEquals(
    rawJS,
    `return \`/\\\`\\\$/\${${a}}/\\\`\\\$/\${${b}}/\\\$\\\`/\`;`,
  );
});

Deno.test("await-ing a JS should not block", async () => {
  const expr = js`a`;
  const res = await expr;
  assertEquals(typeof res, "function");
  assertEquals((res as any).then, undefined);
  assertEquals(toRawJS(() => [res])[0], "(await a);");
});
