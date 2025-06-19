# @classic/js - Page specific JS from any backend

[![JSR](https://jsr.io/badges/@classic/js)](https://jsr.io/@classic/js)

Custom elements/web components scope reusable logic and style. On the other
hand, @classic/js offers a way to send dynamic arbitrary code in web pages to
fully control native and custom elements.

```ts ignore
const foo = "42";
const jsParsedFoo = js<number>`parseInt(${foo})`; // Smart interpolation will result in `parseInt("42")`
await js.eval(jsParsedFoo) === 42;
```

References are tracked and transcribed into generated JS, so it is minified by
design:

```ts ignore
const lorem =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
const loremReference = js<string>`${lorem}`;
await js.eval(js`${lorem} === ${loremReference}`) === true;
// ^ `lorem` is referenced twice: generated JS will declare it as a variable
```
