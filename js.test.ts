import { assertEquals } from "./deps/std/assert.ts";
import { argn, varArg } from "./dom/arg-alias.ts";
import { js, resource, resources, toJS, unsafe } from "./js.ts";
import { JS, JSable } from "./js/types.ts";

Deno.test("toJS variable ref mapping", async () => {
  const a = js<{ a: 1 }>`{a:1}`.a;
  const [rawJS] = await toJS(() => js`${a} + ${a}`);
  assertEquals(
    rawJS,
    `let ${varArg}0={a:1}.a;return ${varArg}0 + ${varArg}0;`,
  );
});

Deno.test("toJS declares variables in the same scope as current runtime", async () => {
  const [rawJS, a] = await toJS((a) => {
    const fn1 = js.fn(() => js<number>`${a} + 1`);
    const res1 = fn1();
    const fn2 = js.fn(() => js`${res1} + ${res1}`);
    return fn2();
  });
  assertEquals(
    rawJS,
    `let ${varArg}0=(()=>${a} + 1)();return (()=>${varArg}0 + ${varArg}0)();`,
  );
});

Deno.test("toJS declares variables across multiple statements", async () => {
  {
    const [rawJS, a] = await toJS((a) => {
      const fn1 = js.fn(() => [js<number>`return ${a}`]);
      const res1 = fn1();
      const fn2 = js.fn(() => [js`return ${res1}+${res1}`]);
      return fn2();
    });
    assertEquals(
      rawJS,
      `let ${varArg}0=(()=>{return ${a}})();return (()=>{return ${varArg}0+${varArg}0})();`,
    );
  }
  {
    const [rawJS] = await toJS(() => {
      const id = js.fn(() => js`1`);
      return [id(), id()];
    });
    assertEquals(rawJS, `let ${varArg}0=()=>1;${varArg}0();${varArg}0();`);
  }
  {
    const a = js`1`;
    const r = js`${a} + ${a}`;
    assertEquals(
      (await toJS(() => js.fn(() => r)))[0],
      `let ${varArg}0=1,${varArg}1=${varArg}0 + ${varArg}0;return ()=>${varArg}1;`,
    );
  }
});

Deno.test("toJS declares variables across cleanup-type instance", async () => {
  {
    const [rawJS] = await toJS(() => {
      const a = js`setTimeout()`;
      return js.fn(() => js`clearTimeout(${a})`);
    });
    assertEquals(
      rawJS,
      `let ${varArg}0=setTimeout();return ()=>clearTimeout(${varArg}0);`,
    );
  }
  {
    const timeoutEffect = js.fn(() => {
      const t = js`setTimeout(()=>{},20)`;
      return js.fn(() => js`clearTimeout(${t})`);
    });

    const [rawJS] = await toJS(() => timeoutEffect());
    assertEquals(
      rawJS,
      `return (()=>{let ${varArg}0=setTimeout(()=>{},20);return ()=>clearTimeout(${varArg}0)})();`,
    );
  }
});

Deno.test("toJS returns expressions as a return statement", async () => {
  const [rawJS] = await toJS(() => js`1 + 1`);
  assertEquals(rawJS, `return 1 + 1;`);
});

Deno.test("toJS reuses functions across global uses", async () => {
  const addd = js.fn((a: JS<number>) => js<number>`${a}+${a}`);
  const addd1 = addd(1);
  const addd2 = addd(2);
  const [rawJS] = await toJS(() => js.fn(() => [addd1, addd2]));
  assertEquals(
    rawJS,
    `let ${varArg}0=${argn(0)}=>${argn(0)}+${
      argn(0)
    },${varArg}1=${varArg}0(1),${varArg}2=${varArg}0(2);return ()=>{${varArg}1;${varArg}2};`,
  );
});

Deno.test("toJS scope arguments independently than passed value", async () => {
  const value = js<number>`a`;
  const addd = js.fn((a: JS<number>) => js<number>`${a}+${a}`);
  const addd1 = addd(value);
  const addd2 = addd(value);
  assertEquals(
    (await toJS(() => js.fn(() => [addd1, addd2])))[0],
    `let ${varArg}0=${argn(0)}=>${argn(0)}+${
      argn(0)
    },${varArg}1=a,${varArg}2=${varArg}0(${varArg}1),${varArg}3=${varArg}0(${varArg}1);return ()=>{${varArg}2;${varArg}3};`,
  );
  assertEquals(
    (await toJS(() => js.fn(() => [addd(value), addd(value)])))[0],
    `let ${varArg}0=${argn(0)}=>${argn(0)}+${
      argn(0)
    },${varArg}1=a;return ()=>{${varArg}0(${varArg}1);${varArg}0(${varArg}1)};`,
  );
});

Deno.test("toJS won't broken-assign inner js.comma", async () => {
  const [rawJS, a, b] = await toJS((a, b) => {
    const r = js.comma(js`${a}.foo`, b);
    return js.fn(() => r);
  });
  assertEquals(
    rawJS,
    `let ${varArg}0=(${a}.foo,${b});return ()=>${varArg}0;`,
  );
});

Deno.test("toJS won't broken-assign inner js.string interpolation", async () => {
  const [rawJS, a] = await toJS((a) => {
    const r = js.string`/foo/${a}`;
    return js.fn(() => r);
  });
  assertEquals(
    rawJS,
    `let ${varArg}0=\`/foo/\${${a}}\`;return ()=>${varArg}0;`,
  );
});

Deno.test("toJS assigns scoped awaits correctly", async () => {
  const [rawJS, a] = await toJS((a) => {
    const r = js.string`/foo/${a}`;
    return js.fn(() => r);
  });
  assertEquals(
    rawJS,
    `let ${varArg}0=\`/foo/\${${a}}\`;return ()=>${varArg}0;`,
  );
});

Deno.test("toJS resists to max call stack exceeded", async () => {
  assertEquals(
    await js.eval(
      Array(5000).fill(0).reduce((a) => js`${a} + 1`, js<number>`0`),
    ),
    5000,
  );
});

Deno.test("toJS can generate functions that return an object", async () => {
  const [rawJS] = await toJS(() => js.fn(() => js`${{ foo: "bar" }}`));
  assertEquals(rawJS, `return ()=>({foo:"bar"});`);
});

Deno.test("toJS correctly assigns out-of-scope method calls", async () => {
  const c = js<number>`1`;
  const res = c.toPrecision();
  const [rawJS] = await toJS(() => js.fn(() => res));
  assertEquals(
    rawJS,
    `let ${varArg}0=1.toPrecision();return ()=>${varArg}0;`,
  );
});

Deno.test("toJS doesn't assign sub-references of out-of-scope variables", async () => {
  const arr = js`${[1, [2, [3]]]}`;
  const [rawJS] = await toJS(() => js.fn(() => arr));
  assertEquals(rawJS, `let ${varArg}0=[1,[2,[3]]];return ()=>${varArg}0;`);
});

Deno.test("toJS assigns circular dependency correctly when possible", async () => {
  const f = js.fn((): JS<void> => g());
  const g = js.fn((): JS<void> => f());
  const r = f();
  const [rawJS] = await toJS(() => js.fn(() => r));
  assertEquals(
    rawJS,
    `let ${varArg}0=()=>${varArg}1(),${varArg}1=()=>${varArg}0(),${varArg}2=${varArg}1();return ()=>${varArg}2;`,
  );
});

Deno.test("toJS generates correct nested prameter use", async () => {
  const f = js.fn((a: JS<unknown>): JSable<void> =>
    js<(a: never) => void>`g`((b) => f(js<unknown>`${a}[${b}]`))
  );
  const [rawJS] = await toJS(() => f);
  assertEquals(
    rawJS,
    `let ${varArg}0=${argn(0)}=>g(${argn(1)}=>${varArg}0(${argn(0)}[${
      argn(1)
    }]));return ${varArg}0;`,
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

Deno.test("js.string works without interpolation", async () => {
  const [rawJS] = await toJS(() => js.string`/foo`);
  assertEquals(rawJS, `return \`/foo\`;`);
});

Deno.test("js.string escapes backticks and dollars", async () => {
  const [rawJS, a, b] = await toJS((a, b) =>
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
  assertEquals((await toJS(() => [res]))[0], "(await a);");
});
