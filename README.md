<!-- # Classic web apps on modern standards -->

Server-side middle-end prioritizing page load times and simplicity.

## Features

- **Server-side async JSX**
  - Generate dynamic HTML thanks to resources and JS
- **Explicit client-side JavaScript boundaries**
  - Manipulate and attach JS to sent HTML through JSX refs
- **TypeScript-first**
  - Even for JS manipulation
- **Industrial-grade navigation** _(à la Remix)_
  - Dynamic nested routes
  - Actions through `form`s to update reactive resources
  - Minimum amount of bytes sent over the wire
- **Modular design**
  - Share modules exposing HTML|JS|CSS thanks to the programmatic bundling API
  - Extend functionalities, opt-in each package, integrate in larger frameworks
- **Programmatic workflow**
  - Optimized bundling _([esbuild](https://esbuild.github.io/) under the hood)_
  - Buildless development
  - Simple explicit production build

**Classic is not a UI library and depends on none** but you can use some.
Classic integrates with existing technologies rather than reinventing them.

On top of that, it's modular so parts of it can be used on demand:

- [@classic/server](https://jsr.io/@classic/server) - Buildable app server
  without wrapping tool
- [@classic/html](https://jsr.io/@classic/html) - Write HTML and JavaScript as
  JSX
- [@classic/js](https://jsr.io/@classic/js) - Ad hoc (client) JavaScript from
  typed (server) code
- [@classic/router](https://jsr.io/@classic/router) - Client script providing
  dynamic routing from regular pages
- [@classic/morph](https://jsr.io/@classic/morph) - Simple element replacement,
  navigate without page reloads

Typical Classic stack:

- [The Web](https://developer.mozilla.org/docs/Web/API)
- [Deno](https://deno.com/) - Runtime, LSP, lint, test, DB...
- Classic - HTML/JS/CSS bundling and serving
- _Optionally:_ TailwindCSS - Or any other ad hoc CSS solution

## Get started

```sh
# Prompts a folder name and creates the template
deno run -r --allow-write=. --allow-net https://raw.githubusercontent.com/ngasull/classic/main/examples/hello-world/init.ts
```

## Code examples

_Remember: everything runs server-side except what is explicitly wrapped in JS
types!_

### JSX Components

```tsx
import { dbContext } from "./my-db.ts";

export const YourName = async ({ userId }: { userId: string }) => {
  const db = dbContext.use();
  const user = await db.user.find(userId);
  return (
    <div>
      Your name will be {user.name}
    </div>
  );
};
```

### Add client-side JS bits

```tsx
import { js } from "@classic/js";

export const YourName = () => {
  return (
    <div
      ref={(div) => js`${div}.innerText = "Your name will be H4CK3D!"`}
    >
      Your name will be ...
    </div>
  );
};
```

### Bundle JS/TS files

```tsx
import type React from "npm:react";
import type { Root } from "npm:react-dom/client";
import { declarePage } from "@classic/server";
import { Bundle } from "@classic/server/bundle";

export const bundle = new Bundle("app");

/*
 * Proxied to keep client code explicitly client-side and typed.
 * Check the development workflow for more info.
 */
const app = bundle.add<{ render: (root: Root) => void }>(
  import.meta.resolve("./app.tsx"),
);
/*
 * React could only be imported in `app.tsx`
 * We import it as well for demonstration purposes.
 */
const react = bundle.add<typeof import("npm:react-dom/client")>(
  "npm:react-dom/client",
);

export default declarePage(() => (
  <html>
    <body ref={(body) => app.render(react.createRoot(body))} />
  </html>
);
```

### As a sharable module, for library developers

```tsx
import type { Bundle } from "@classic/server/bundle";

export const yourName = (bundle: Bundle): JSX.Component => {
  const { render } = bundle.add<{ render: (root: Element) => void }>(
    "./component-lib.ts",
  );
  return () => <div ref={(div) => render(div)} />;
};
```

### Hello world

You may check [hello-world example](./examples/hello-world)
