import { assertEquals, assertThrows } from "@std/assert";
import { stringify } from "./stringify.ts";

Deno.test({
  name: "converts values correctly",
  fn() {
    assertEquals(stringify(null), "null");
    assertEquals(stringify(undefined), "undefined");
    assertEquals(stringify(true), "true");
    assertEquals(stringify(false), "false");
    assertEquals(stringify(123), "123");
    assertEquals(stringify(123n), "123n");
    assertEquals(stringify("foo"), `"foo"`);
    assertEquals(
      stringify(new Date("2055-05-05T00:00:00.000Z")),
      `new Date("2055-05-05T00:00:00.000Z")`,
    );
    assertEquals(stringify(NaN), "NaN");
    assertEquals(stringify(Infinity), "Infinity");
    assertEquals(stringify(/^RegExp$/gi), "/^RegExp$/gi");
    assertEquals(
      stringify(new URL("http://deno.land")),
      `new URL("http://deno.land/")`,
    );

    const everyByte = Array(256).fill(0).map((_, i) => i);
    assertEquals(
      eval(stringify(new Uint8Array(everyByte))).toString(),
      new Uint8Array(everyByte).toString(),
    );
    assertEquals(stringify(new Uint8Array([])), "new Uint8Array()");
  },
});

Deno.test({
  name: "converts arrays to JS expressions",
  fn() {
    assertEquals(
      stringify([null, undefined, true, false, 123, 123n, "foo"]),
      `[null,undefined,true,false,123,123n,"foo"]`,
    );
  },
});

Deno.test({
  name: "converts sets to JS expressions",
  fn() {
    assertEquals(
      stringify(new Set([null, undefined, true, false, 123, 123n, "foo"])),
      `new Set([null,undefined,true,false,123,123n,"foo"])`,
    );
  },
});

Deno.test({
  name: "converts objects to JS expressions",
  fn() {
    assertEquals(
      stringify({
        a: null,
        b: undefined,
        c: true,
        d: false,
        e: 123,
        f: 123n,
        g: "foo",
        h: {
          h1: 1,
          h2: ["a", 2n],
          h3: new Date("2055-05-05T00:00:00.000Z"),
        },
      }),
      `{a:null,b:undefined,c:true,d:false,e:123,f:123n,g:"foo",h:{h1:1,h2:["a",2n],h3:new Date("2055-05-05T00:00:00.000Z")}}`,
    );
  },
});

Deno.test({
  name: "converts maps to JS expressions",
  fn() {
    assertEquals(
      stringify(
        new Map(Object.entries({
          a: null,
          b: new Set([1, 2, "a"]),
          c: true,
        })),
      ),
      `new Map([["a",null],["b",new Set([1,2,"a"])],["c",true]])`,
    );
  },
});

Deno.test({
  name: "escapes unsafe objects keys in double quotes",
  fn() {
    assertEquals(
      stringify({
        123: "escaped",
        a: "unescaped",
        b: "unescaped",
        "super-power": "escaped",
        c: "unescaped",
      }),
      `{123:"escaped",a:"unescaped",b:"unescaped","super-power":"escaped",c:"unescaped"}`,
    );
  },
});

Deno.test({
  name: "strigifies keyed symbols",
  fn() {
    assertEquals(stringify(Symbol.for("poulet")), `Symbol.for("poulet")`);
  },
});

Deno.test({
  name: "errors on unkeyed symbols",
  fn() {
    assertThrows(() => stringify(Symbol("poulet")));
  },
});

Deno.test({
  name:
    "preserve properties indexes with keyed symbols, discard those with unkeyed symbols",
  fn() {
    assertEquals(
      stringify({
        [Symbol.for("poulet")]: "ninja",
        [Symbol("burger")]: "Hi",
        foo: "bar",
      }),
      `{foo:"bar",[Symbol.for("poulet")]:"ninja"}`,
    );
  },
});

Deno.test({
  name: "errors when meets functions",
  fn() {
    assertThrows(() => stringify({ foo: (() => "Hello") as never }));
  },
});

Deno.test({
  name: "replace objects having specific keys",
  fn() {
    const obj = {
      [Symbol.for("poulet")]: "ninja",
      [Symbol("burger")]: "Hi",
      foo: "bar",
      stringify: (o: unknown) => {
        assertEquals(o, obj);
        return "custom code";
      },
    };
    assertEquals(stringify(obj), `custom code`);
  },
});
