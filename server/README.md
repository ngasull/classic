# Classic server

Modern retro web development.

Develop a buildable web server without external tool.
Integrates with the Classic stack in a cohesive way.

Classic comes with general web development guidelines to keep the process as simple as possible.

## Highlights

- Zero config, TS-only, deno-first, no external tool
- Designed for simplicity, composability and performance
- Plugin system helps you drive your app from build to browser in a single line of code
- File-based routing, dynamic nested routing à la Remix
- Server code only ; not bound to any client-side JS library
- Ad-hoc typed client JS API in server's JSX
- Sane defaults

## Get started

We all love quick fiddling and here's a template to do so, however we strongly recommend having a look at Classic principles at the same time.
**Classic isn't like any other framework**.

With [deno](https://deno.com/) installed:
```sh
# Bootstrap your application
deno run -W=. init.ts

# Run dev server
deno task dev
```

## File based routing

Why use file based routing:
- Defines a file tree structure convention
- Splits each route's code by design
- Enables lazy loading 
- Avoids maintaining a huge entrypoint
- Scalable code base
- Predictible routes keep performance up
- Facilitates nested routes dynamic loading

Why not use file based routing:
- Writing a very dynamic API
- Writing a non-standard API
- Serving a single page

### Entry point

```ts ignore
import { build, fileRouter } from "@classic/server"

const runtime = await build((build) => {

  // Enable file-based routing on ./src
  build.use(fileRouter, "src");
});

Deno.serve(runtime.handle);
```

### Root route

```tsx
// src/route.tsx

import { layout, page, route } from "@classic/server";

export default route(async (root) => {

  // Apply a layout to this route and every nested route
  root.use(layout, (req) => {
    return (
      <html>
        <head>
          <title>Hello world</title>
          <meta charset="utf-8" />
        </head>
        <body>
          {req.children}
        </body>
      </html>
    );
  });

  // Page at / (root)
  root.use(page, (req) => {
    return (
      <>
        <h1>Root page</h1>
        <p>It works!</p>
      </>
    );
  });
});
```

### Nested route

```tsx
// src/hello.route.tsx or src/hello/route.tsx

import { page, route } from "@classic/server";

export default route(async (hello) => {

  // Page at /hello
  hello.use(page, (req) => {
    return (
      <>
        <h1>Hello world!</h1>
        <p>Pages are wrapped in all parent layouts.</p>
        <p>This route is only wrapped in root layout.</p>
      </>
    );
  });
});
```

## Linking CSS

There are too many ways to style an app. Without the adequate knowledge, searching for the right decision can be a nightmare.

The Classic stack recommends having 2 styling layers :
- Stylesheet
- Ad-hoc styling

The stylesheet provides reused styles across your app and adheres to the CSS mindset.
We recommend using a semantic HTML CSS framework like picocss or writing your own rules.

Ad-hoc styling allows adding uncommon styles per-page.
It can be done with inline styles or by using utility classes like TailwindCSS does.
This approach has proven useful for teams that have a quickly evolving product with creative designers.

As long as they share the same design system, stacking both approches allows you write HTML that is well-styled by default while keeping per-page flexibitly.


### Stylesheet

```tsx
// src/route.tsx

import { layout, page, route } from "@classic/server";

export default route(async (root) => {

  // Embed and/or write layout-level CSS
  // Compiled into an optimized stylesheet
  root.use(layout.css`
    ${await Deno.readFile("asset/pico.css")}
    ${await Deno.readFile("asset/tailwind.css")}

    :root {
      --pico-border-radius: 2rem;
    }
    h1 {
      font-family: Pacifico, cursive;
      font-weight: 400;
    }
  `);

  // Don't forget to tell your layout to get those styles!
  root.use(layout, (req) => {
    return (
      <html>
        <head>
          <title>Hello world</title>
          <meta charset="utf-8" />
          <PageStyle />
        </head>
        <body>
          {req.children}
        </body>
      </html>
    );
  });

  // ... //
});
```

### Ad-hoc styling without a utility-based framework

In some cases, page-specific CSS may be needed. Not recommended for the general use case.

```tsx
import { page, route } from "@classic/server";

export default route(async (hello) => {

  // Page-specific CSS rules
  // Compiled into an optimized stylesheet
  // Embedded in layout's PageStyle automatically
  hello.use(page.css`
    ${await Deno.readFile("asset/supergraphlib.css")}

    h1.hellover:hover {
      background: red;
    }
  `);

  // Page at /hello
  hello.use(page, (req) => {
    return (
      <>
        <h1 class="hellover">Hello world!</h1>;
        <svg class="supergraph">...</svg>
      </>
    );
  });
});
```


## Ad-Hoc client-side JS



## Create and share your own builders
