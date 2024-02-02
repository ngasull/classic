> Web development should be simple.

## Web application middle-end

Using the same language in both server and client sides is an exceptional opportunity for simplicity.
This should not imply exceptional technical complexity.

- Render HTML from your backend, allowing **async JSX**
- Attach **reactive client-side JavaScript** to it
- **No build step** to bundle optimized client-side JS
- Manipulate client-side JS bits **explicitly yet transparently** from the backend

## Not a UI library

Although it's using JSX, this library runs mostly server-side.
There is no comparison to be done with React, Solid or Vue.
Such libraries can however be still be used.

## Not promoting _components everywhere_

Components are great to scope complex UI behaviors. In other cases, components bring unnecessary lifecycle complexity. So what to do ?

- Render HTML by default
- Attach JS when needed
- If necessary, use a UI library to manage a single component

## Get started with Hono

```jsonc
// deno.jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "jsx-machine",
    "lib": [
      "deno.ns",
      "DOM",
      "DOM.Iterable",
      "ES2021"
    ]
  },
  "imports": {
    "jsx-machine/": "../jsx-machine/",
    "jsx-machine/jsx-runtime": "../jsx-machine/jsx-runtime.ts"
    "hono/": "https://deno.land/x/hono@v3.8.0-rc.2/"
  }
}
```

```tsx
// main.tsx
import { Hono } from "hono/mod.ts";
import { bundleWebImports } from "jsx-machine/js/web.ts";
import { serveBundle, serveRoutes } from "jsx-machine/hono.ts";

const app = new Hono();

serveBundle(
  app,
  await bundleWebImports(),
);

// Your bundle is built by scanning calls to this import
import { web } from "./web-modules.gen.ts";

serveRoutes({
  hono: app,
  domPath: web.path("jsx-machine/dom.ts"),
  routes: {
    "": {
      layout: ({ children }) => (
        <html>
          <head>
            <title>Hello world</title>
            <meta charset="utf-8" />
          </head>
          <body>{children}</body>
        </html>
      ),
      index: () => (
        <>
          <h1>Welcome</h1>
          <p>You should visit <a href="/world">the world</a></p>
        </>
      ),
    },

    "/world": () => (
      <>
        <h1>World</h1>
        <p>Hello from there!</p>
      </>
    ),
  },
});

Deno.serve({ port: 3000 }, app.fetch);
```

## Add client-side dynamic routing _à la_ Remix

```tsx
<body
  ref={(body) => web.module("jsx-machine/dom/router.ts").register(body)}
>
  {children}
</body>
```
