import { assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { $js, argn, type JSWrite, varPrefix } from "./entity.ts";
import { evalJs, js, toJs } from "./js.ts";
import { asJs } from "./proxy.ts";
import type { JS } from "./types.ts";

Deno.test("toJs variable ref mapping", () => {
  const a = js<{ a: 1 }>`{a:1}`.a;
  const rawJS = toJs(() => js`${a} + ${a}`);
  assertEquals(
    rawJS,
    `let ${varPrefix}0={a:1}.a;return ${varPrefix}0 + ${varPrefix}0;`,
  );
});

Deno.test("toJs declares variables in the same scope as current runtime", () => {
  const a = js`a`;
  const var0 = asJs(() => js<number>`${a} + 1`)();
  const rawJS = toJs(() => {
    asJs(() => js`${var0} + ${var0}`)();
  });
  assertEquals(
    rawJS,
    `let ${varPrefix}0=a,${varPrefix}1=(()=>${varPrefix}0 + 1)();(()=>${varPrefix}1 + ${varPrefix}1)();`,
  );
});

Deno.test("toJs declares variables across multiple statements", () => {
  {
    const var0 = asJs(() => js<number>`a`)();
    const rawJS = toJs(() => {
      asJs(() => js`${var0}+${var0}`)();
    });
    assertEquals(
      rawJS,
      `let ${varPrefix}0=(()=>a)();(()=>${varPrefix}0+${varPrefix}0)();`,
    );
  }
  {
    const id = asJs(() => js`1`);
    const rawJS = toJs(() => {
      id();
      id();
    });
    assertEquals(
      rawJS,
      `let ${varPrefix}0=()=>1;${varPrefix}0();${varPrefix}0();`,
    );
  }
  {
    const a = js`1`;
    const r = js`${a} + ${a}`;
    assertEquals(
      toJs(() => {
        asJs(() => r);
      }),
      `let ${varPrefix}0=1,${varPrefix}1=${varPrefix}0 + ${varPrefix}0;()=>${varPrefix}1;`,
    );
  }
});

Deno.test("toJs declares variables across cleanup-type instance", () => {
  {
    const a = js`setTimeout()`;
    const rawJS = toJs(() => {
      asJs(() => js`clearTimeout(${a})`);
    });
    assertEquals(
      rawJS,
      `let ${varPrefix}0=setTimeout();()=>clearTimeout(${varPrefix}0);`,
    );
  }
  {
    const timeoutEffect = asJs(() => {
      const t = js`setTimeout(()=>{},20)`;
      return asJs(() => js`clearTimeout(${t})`);
    });

    const rawJS = toJs(() => timeoutEffect());
    assertEquals(
      rawJS,
      `return (()=>{let ${varPrefix}0=setTimeout(()=>{},20);return ()=>clearTimeout(${varPrefix}0)})();`,
    );
  }
});

Deno.test("toJs returns expressions as a return statement", () => {
  const rawJS = toJs(() => js`1 + 1`);
  assertEquals(rawJS, `return 1 + 1;`);
});

Deno.test("toJs reuses functions across global uses", () => {
  const addd = asJs((a: JS<number>) => js<number>`${a}+${a}`);
  const addd1 = addd(1);
  const addd2 = addd(2);
  const rawJS = toJs(() => asJs(() => js`${addd1} < ${addd2}`));
  assertEquals(
    rawJS,
    `let ${varPrefix}0=${argn(0)}=>${argn(0)}+${
      argn(0)
    },${varPrefix}1=${varPrefix}0(1),${varPrefix}2=${varPrefix}0(2);return ()=>${varPrefix}1 < ${varPrefix}2;`,
  );
});

Deno.test("toJs scope arguments independently than passed value", () => {
  const value = js<number>`a`;
  const addd = asJs((a: JS<number>) => js<number>`${a}+${a}`);
  const addd1 = addd(value);
  const addd2 = addd(value);
  assertEquals(
    toJs(() => asJs(() => js`${addd1} < ${addd2}`)),
    `let ${varPrefix}0=${argn(0)}=>${argn(0)}+${
      argn(0)
    },${varPrefix}1=a,${varPrefix}2=${varPrefix}0(${varPrefix}1),${varPrefix}3=${varPrefix}0(${varPrefix}1);return ()=>${varPrefix}2 < ${varPrefix}3;`,
  );
  assertEquals(
    toJs(() => asJs(() => js`${addd(value)} > ${addd(value)}`)),
    `let ${varPrefix}0=${argn(0)}=>${argn(0)}+${
      argn(0)
    },${varPrefix}1=a;return ()=>${varPrefix}0(${varPrefix}1) > ${varPrefix}0(${varPrefix}1);`,
  );
});

Deno.test("toJs won't broken-assign inner js.string interpolation", () => {
  const a = js`a`;
  const r = js.string`/foo/${a}`;
  const rawJS = toJs(() => asJs(() => r));
  assertEquals(
    rawJS,
    `let ${varPrefix}0=\`/foo/\${a}\`;return ()=>${varPrefix}0;`,
  );
});

// Deno.test("toJs resists to max call stack exceeded", async () => {
//   assertEquals(
//     await evalJs(
//       Array(5000).fill(0).reduce((a) => js`${a} + 1`, js<number>`0`),
//     ),
//     5000,
//   );
// });

Deno.test("toJs can generate functions that return an object", () => {
  const rawJS = toJs(() => asJs(() => asJs({ foo: "bar" })));
  assertEquals(rawJS, `return ()=>({foo:"bar"});`);
});

Deno.test("toJs correctly assigns out-of-scope method calls", () => {
  const c = js<number>`1`;
  const res = c.toPrecision();
  const rawJS = toJs(() => asJs(() => res));
  assertEquals(
    rawJS,
    `let ${varPrefix}0=1.toPrecision();return ()=>${varPrefix}0;`,
  );
});

Deno.test("toJs properly writes chained function calls (sub-call owners are assigned to avoid ambiguity)", () => {
  const rawJS = toJs(() => (c: JS<number>) => c.toPrecision().charAt(0));
  assertEquals(
    rawJS,
    `return ${argn(0)}=>{let ${varPrefix}0=${
      argn(0)
    }.toPrecision();return ${varPrefix}0.charAt(0)};`,
  );

  const mod = js.module<{ fn(el: Element): void }>("foo");
  // const mod = js<{ fn: any }>`mod`;
  assertEquals(
    toJs(() => (ref: JS<HTMLElement>) =>
      ref.querySelectorAll("p").forEach(mod.fn)
    ),
    `let ${varPrefix}1=await Promise.all([import("foo")]);return ${
      argn(0)
    }=>{let ${varPrefix}0=${
      argn(0)
    }.querySelectorAll("p");return ${varPrefix}0.forEach(${varPrefix}1[0].fn)};`,
  );
});

Deno.test("toJs uses `.call` on assigned methods", () => {
  const toPrecision = js<number>`1`.toPrecision;
  const rawJS = toJs(() => () => toPrecision());
  assertEquals(
    rawJS,
    `let ${varPrefix}0=1,${varPrefix}1=${varPrefix}0.toPrecision;return ()=>${varPrefix}1.call(${varPrefix}0);`,
  );
});

Deno.test("toJs doesn't assign sub-references of out-of-scope variables", () => {
  const arr = asJs([1, [2, [3]]]);
  const rawJS = toJs(() => asJs(() => arr));
  assertEquals(
    rawJS,
    `let ${varPrefix}0=[1,[2,[3]]];return ()=>${varPrefix}0;`,
  );
});

Deno.test("toJs assigns circular dependency correctly when possible", () => {
  const f = asJs((): JS<void> => g());
  const g = asJs((): JS<void> => f());
  const r = f();
  const rawJS = toJs(() => asJs(() => r));
  assertEquals(
    rawJS,
    `let ${varPrefix}0=()=>${varPrefix}1(),${varPrefix}1=()=>${varPrefix}0(),${varPrefix}2=${varPrefix}1();return ()=>${varPrefix}2;`,
  );
});

Deno.test("toJs properly scopes callbacks", () => {
  const f = asJs((): JS<void> => js<(a: never) => void>`g`(() => {}));
  assertEquals(toJs(() => f), `return ()=>g(()=>{});`);
});

Deno.test("toJs generates correct nested parameter use", () => {
  const f = asJs((a: JS<unknown>): JS<void> =>
    js<(a: never) => void>`g`((b) => f(js<unknown>`${a}[${b}]`))
  );
  const rawJS = toJs(() => f);
  assertEquals(
    rawJS,
    `let ${varPrefix}0=${argn(0)}=>g(${argn(1)}=>${varPrefix}0(${argn(0)}[${
      argn(1)
    }]));return ${varPrefix}0;`,
  );
});

Deno.test("toJs preserves operation order even in between assignments", () => {
  assertEquals(
    toJs(() => {
      const a = js`a`;
      js`arbitrary(${a})`;
      const b = js`b`;
      return js`${a} * ${b} + ${b}`;
    }),
    `let ${varPrefix}0=a;arbitrary(${varPrefix}0);let ${varPrefix}1=b;return ${varPrefix}0 * ${varPrefix}1 + ${varPrefix}1;`,
  );
});

Deno.test("toJs preserves runtime object references", () => {
  assertEquals(
    toJs(() => {
      const obj = {};
      return js`${obj} ?? ${obj}`;
    }),
    `let ${varPrefix}0={};return ${varPrefix}0 ?? ${varPrefix}0;`,
  );
});

Deno.test("toJs assigns correctly even when returning directly out of scope content", () => {
  const a = js<(a: unknown, b: unknown) => unknown>`a`;
  assertEquals(
    toJs(() =>
      asJs(() => {
        js`b`;
        return a;
      })
    ),
    `let ${varPrefix}0=a;return ()=>{b;return ${varPrefix}0};`,
  );
});

Deno.test("toJs allows setting properties", () => {
  const obj = asJs({ foo: "bar" });
  assertEquals(
    toJs(() => () => {
      obj.foo = asJs("baz");
    }),
    `let ${varPrefix}0={foo:"bar"};return ()=>{${varPrefix}0.foo="baz"};`,
  );
});

Deno.test("toJs writes custom user JS in 2 passes", () => {
  assertEquals(
    toJs(() =>
      asJs({
        [$js](write: JSWrite) {
          write("a[");
          write(() => write("42"));
          write("]");
        },
      })
    ),
    `return a[42];`,
  );
});

Deno.test("js array interpolation", async () => {
  assertEquals(await evalJs(js`${["a", "b", "c"]}.join("")`), "abc");
});

Deno.test("js object interpolation", async () => {
  assertEquals(
    await evalJs(
      js`Object.entries(${{
        a: 1,
        b: 2,
        c: 3,
      }}).map(([k,v]) => k + v).join(" ")`,
    ),
    "a1 b2 c3",
  );
});

Deno.test("js.string works without interpolation", () => {
  const rawJS = toJs(() => js.string`/foo`);
  assertEquals(rawJS, `return \`/foo\`;`);
});

Deno.test("js.string escapes backticks and dollars", () => {
  const a = js`a`;
  const b = js`b`;
  const rawJS = toJs(() => js.string`/\`\$/${a}/\`\$/${b}/\$\`/`);
  assertEquals(
    rawJS,
    `return \`/\\\`\\\$/\${a}/\\\`\\\$/\${b}/\\\$\\\`/\`;`,
  );
});

Deno.test("js.new instantiates correctly with given arguments", async () => {
  const d = new Date();
  assertEquals(
    await evalJs(js.new(Date, d.toISOString()).toISOString()),
    d.toISOString(),
  );
});

export { varPrefix };

Deno.test("js modules are used and reused correctly", () => {
  const jsModule = js.module<typeof import("./entity.ts")>(
    import.meta.resolve("./entity.ts"),
  );
  const jsTestModule = js.module<typeof import("./js.test.ts")>(
    import.meta.url,
  );

  assertEquals(evalJs(jsModule.varPrefix), evalJs(jsTestModule.varPrefix));
  assertEquals(evalJs(jsTestModule.varPrefix), evalJs(jsModule.varPrefix));
});

Deno.test("eval properly converts implicit JS to check for inner JS conversions", async () => {
  assertEquals(await evalJs({ a: asJs(42) }), { a: 42 });
});

Deno.test("eval keeps custom JS-writable object references without writing", async () => {
  const obj = {
    [$js]() {
      throw "Fail";
    },
  };
  assertStrictEquals((await evalJs({ foo: obj })).foo, obj);
});

Deno.test("eval forwards runtime references for exactly same objects", async () => {
  const obj = { foo: { bar: "baz" } };
  assertStrictEquals(await evalJs(obj), obj);
});
