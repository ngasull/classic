# Classic web apps on modern standards

Server-side middle-end prioritizing page load times and simplicity.

## Features

- **Reactive resources**
- **Server-side async JSX**
  - Generate dynamic HTML thanks to resources and JS
- **Explicit client-side JavaScript boundaries**
  - Manipulate and attach JS to sent HTML through JSX refs
- **TypeScript-first**
  - Even for JS manipulation
- **Industrial-grade navigation** *(à la Remix)*
  - Dynamic nested routes
  - Actions through `form`s to update reactive resources
  - Minimum amount of bytes sent over the wire
- **Modular design**
  - Share modules exposing HTML|JS|CSS thanks to the programmatic bundling API
  - Extend functionalities and integrate in larger frameworks
- **Programmatic workflow**
  - Optimized bundling *([esbuild](https://esbuild.github.io/) under the hood)*
  - Buildless development
  - Simple explicit production build

**Classic is not a UI library and depends on none**, but you can optionally use some.
Classic integrates with existing technologies rather than reinventing them.

Typical Classic stack:
- [Deno](https://deno.com/) - Runtime, LSP, lint, test, DB...
- [Hono](https://hono.dev/) - Backend router
- Classic - Reactive HTML/JS/CSS generation

NodeJS support is planned, however we strongly recommend Deno in general.

## Get started

```sh
# Prompts a folder name and creates the template
deno run -r --allow-write=. --allow-net https://raw.githubusercontent.com/ngasull/classic/master/init.ts
```

## Code examples

_Remember: everything runs server-side except what is explicitly wrapped in JS types!_

### JSX Components

```tsx
import { db } from "./my-db.ts";

export const YourName = async ({ userId }: { userId: string }) => {
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
import { js } from "classic-web/js.ts"

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

### Bundle a JS/TS file

```tsx
import { bundle } from "./bundle.ts";

/*
 * Proxied to keep client code explictly typed and explicitly client-side.
 * Check the development workflow for more info.
 */
const yourName = bundle.add("./your-name.web.ts");

export const YourName = () => {
  return (
    <div ref={(div) => yourName.hack(div, "H4CK3D")}>
      Your name will be ...
    </div>
  );
};
```

```ts
// your-name.web.ts

export const hack = (el: HTMLElement, name: string) => {
  el.innerText = `Your name will be ${name}`;
};
```

### As a sharable module, for library developers

```tsx
import type { Bundle } from "classic-web/bundle.ts";

export const yourName = (bundle: Bundle): JSX.Component => {
  const yourName = bundle.add<typeof import("./your-name.web.ts")>(
    "./your-name.web.ts",
  );
  return () => {
    return (
      <div ref={yourName.hack}>
        Your name will be ...
      </div>
    );
  };
};
```

### Hello world

You may check [hello-world example](./examples/hello-world)
