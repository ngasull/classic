import { assertEquals } from "jsr:@std/assert";
import { argn, js, resource, toJs, varArg } from "./js.ts";
import type { JS, JSable } from "./types.ts";

Deno.test("toJs variable ref mapping", () => {
  const a = js<{ a: 1 }>`{a:1}`.a;
  const rawJS = toJs([js`${a} + ${a}`]);
  assertEquals(
    rawJS,
    `let ${varArg}0={a:1}.a;${varArg}0 + ${varArg}0;`,
  );
});

Deno.test("toJs declares variables in the same scope as current runtime", () => {
  const a = js`a`;
  const var0 = js.fn(() => js<number>`${a} + 1`)();
  const rawJS = toJs([js.fn(() => js`${var0} + ${var0}`)()]);
  assertEquals(
    rawJS,
    `let ${varArg}0=a,${varArg}1=(()=>${varArg}0 + 1)();(()=>${varArg}1 + ${varArg}1)();`,
  );
});

Deno.test("toJs declares variables across multiple statements", () => {
  {
    const var0 = js.fn(() => [js<number>`return a`])();
    const rawJS = toJs([js.fn(() => [js`return ${var0}+${var0}`])()]);
    assertEquals(
      rawJS,
      `let ${varArg}0=(()=>{return a})();(()=>{return ${varArg}0+${varArg}0})();`,
    );
  }
  {
    const id = js.fn(() => js`1`);
    const rawJS = toJs([id(), id()]);
    assertEquals(rawJS, `let ${varArg}0=()=>1;${varArg}0();${varArg}0();`);
  }
  {
    const a = js`1`;
    const r = js`${a} + ${a}`;
    assertEquals(
      toJs([js.fn(() => r)]),
      `let ${varArg}0=1,${varArg}1=${varArg}0 + ${varArg}0;()=>${varArg}1;`,
    );
  }
});

Deno.test("toJs declares variables across cleanup-type instance", () => {
  {
    const a = js`setTimeout()`;
    const rawJS = toJs([js.fn(() => js`clearTimeout(${a})`)]);
    assertEquals(
      rawJS,
      `let ${varArg}0=setTimeout();()=>clearTimeout(${varArg}0);`,
    );
  }
  {
    const timeoutEffect = js.fn(() => {
      const t = js`setTimeout(()=>{},20)`;
      return js.fn(() => js`clearTimeout(${t})`);
    });

    const rawJS = toJs([timeoutEffect()]);
    assertEquals(
      rawJS,
      `(()=>{let ${varArg}0=setTimeout(()=>{},20);return ()=>clearTimeout(${varArg}0)})();`,
    );
  }
});

Deno.test("toJs returns expressions as a return statement", () => {
  const rawJS = toJs([js`1 + 1`]);
  assertEquals(rawJS, `1 + 1;`);
});

Deno.test("toJs reuses functions across global uses", () => {
  const addd = js.fn((a: JS<number>) => js<number>`${a}+${a}`);
  const addd1 = addd(1);
  const addd2 = addd(2);
  const rawJS = toJs([js.fn(() => [addd1, addd2])]);
  assertEquals(
    rawJS,
    `let ${varArg}0=${argn(0)}=>${argn(0)}+${
      argn(0)
    },${varArg}1=${varArg}0(1),${varArg}2=${varArg}0(2);()=>{${varArg}1;${varArg}2};`,
  );
});

Deno.test("toJs scope arguments independently than passed value", () => {
  const value = js<number>`a`;
  const addd = js.fn((a: JS<number>) => js<number>`${a}+${a}`);
  const addd1 = addd(value);
  const addd2 = addd(value);
  assertEquals(
    toJs([js.fn(() => [addd1, addd2])]),
    `let ${varArg}0=${argn(0)}=>${argn(0)}+${
      argn(0)
    },${varArg}1=a,${varArg}2=${varArg}0(${varArg}1),${varArg}3=${varArg}0(${varArg}1);()=>{${varArg}2;${varArg}3};`,
  );
  assertEquals(
    toJs([js.fn(() => [addd(value), addd(value)])]),
    `let ${varArg}0=${argn(0)}=>${argn(0)}+${
      argn(0)
    },${varArg}1=a;()=>{${varArg}0(${varArg}1);${varArg}0(${varArg}1)};`,
  );
});

Deno.test("toJs won't broken-assign inner js.comma", () => {
  const a = js`a`;
  const b = js`b`;
  const r = js.comma(js`${a}.foo`, b);
  const rawJS = toJs([js.fn(() => r)]);
  assertEquals(rawJS, `let ${varArg}0=(a.foo,b);()=>${varArg}0;`);
});

Deno.test("toJs won't broken-assign inner js.string interpolation", () => {
  const a = js`a`;
  const r = js.string`/foo/${a}`;
  const rawJS = toJs([js.fn(() => r)]);
  assertEquals(
    rawJS,
    `let ${varArg}0=\`/foo/\${a}\`;()=>${varArg}0;`,
  );
});

// Deno.test("toJs resists to max call stack exceeded", () => {
//   assertEquals(
//     js.eval(
//       Array(5000).fill(0).reduce((a) => js`${a} + 1`, js<number>`0`),
//     ),
//     5000,
//   );
// });

Deno.test("toJs can generate functions that return an object", () => {
  const rawJS = toJs([js.fn(() => js`${{ foo: "bar" }}`)]);
  assertEquals(rawJS, `()=>({foo:"bar"});`);
});

Deno.test("toJs correctly assigns out-of-scope method calls", () => {
  const c = js<number>`1`;
  const res = c.toPrecision();
  const rawJS = toJs([js.fn(() => res)]);
  assertEquals(
    rawJS,
    `let ${varArg}0=1.toPrecision();()=>${varArg}0;`,
  );
});

Deno.test("toJs doesn't assign sub-references of out-of-scope variables", () => {
  const arr = js`${[1, [2, [3]]]}`;
  const rawJS = toJs([js.fn(() => arr)]);
  assertEquals(rawJS, `let ${varArg}0=[1,[2,[3]]];()=>${varArg}0;`);
});

Deno.test("toJs assigns circular dependency correctly when possible", () => {
  const f = js.fn((): JS<void> => g());
  const g = js.fn((): JS<void> => f());
  const r = f();
  const rawJS = toJs([js.fn(() => r)]);
  assertEquals(
    rawJS,
    `let ${varArg}0=()=>${varArg}1(),${varArg}1=()=>${varArg}0(),${varArg}2=${varArg}1();()=>${varArg}2;`,
  );
});

Deno.test("toJs generates correct nested prameter use", () => {
  const f = js.fn((a: JS<unknown>): JSable<void> =>
    js<(a: never) => void>`g`((b) => f(js<unknown>`${a}[${b}]`))
  );
  const rawJS = toJs([f]);
  assertEquals(
    rawJS,
    `let ${varArg}0=${argn(0)}=>g(${argn(1)}=>${varArg}0(${argn(0)}[${
      argn(1)
    }]));${varArg}0;`,
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
  const rawJS = toJs([js.string`/foo`]);
  assertEquals(rawJS, `\`/foo\`;`);
});

Deno.test("js.string escapes backticks and dollars", () => {
  const a = js`a`;
  const b = js`b`;
  const rawJS = toJs([js.string`/\`\$/${a}/\`\$/${b}/\$\`/`]);
  assertEquals(
    rawJS,
    `\`/\\\`\\\$/\${a}/\\\`\\\$/\${b}/\\\$\\\`/\`;`,
  );
});

Deno.test("await-ing a JS should not block", async () => {
  const expr = js<
    Promise<42>
  >`new Promise(resolve => setTimeout(() => resolve(42), 1))`;
  const res = await expr;
  assertEquals(typeof res, "function");
  assertEquals((res as any).then, undefined);
  assertEquals(await js.eval(res), 42);
});
