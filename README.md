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

**Classic is not a UI library and depends on none**, but you can use some. It integrates with existing technologies rather than reinventing them.

Typical Classic stack:
- [Deno](https://deno.com/) - Runtime, LSP, lint, test, DB...
- [Hono](https://hono.dev/) - Backend router
- Classic - Reactive HTML/JS/CSS generation

NodeJS support is planned, however we strongly recommend Deno in general.

## Get started

```sh
# Prompts a folder name and creates the template
deno run --allow-write=. --allow-net https://raw.githubusercontent.com/ngasull/classic/master/init.ts
```

## Principles

### Web application middle-end

Using the same language in both server and client sides is an exceptional opportunity for simplicity.
This should not imply exceptional technical complexity.

- Render HTML from your backend, allowing **async JSX**
- Attach **reactive client-side JavaScript** to it
- **No build step** to bundle optimized client-side JS
- Manipulate client-side JS bits **explicitly yet transparently** from the backend

### Not a UI library

Although it's using JSX, this library runs mostly server-side.
There is no comparison to be done with React, Solid or Vue.
Such libraries can however be still be used.

### Not promoting _components everywhere_

Components are great to scope complex UI behaviors. In other cases, components bring unnecessary lifecycle complexity. So what to do ?

- Render HTML by default
- Attach JS when needed
- If necessary, use a UI library to manage individual components

## Show me code!

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

export const YourName = ({ userId }: { userId: string }) => {
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

// Typed client-side JS! Check the development workflow for more info
const { hackYourName } = bundle.add("./your-name.web.ts");

export const YourName = ({ userId }: { userId: string }) => {
  return (
    <div ref={hackYourName}>
      Your name will be ...
    </div>
  );
};
```

```ts
// your-name.web.ts
import { effect } from "classic-web/dom.ts"

export const hackYourName = (el: HTMLElement) => {
  el.innerText = "Your name will be H4CK3D!";
};
```

### As a sharable module, for library developers

```tsx
import type { Bundle } from "classic-web/bundle.ts";

export const yourName = (bundle: Bundle) => {
  const { hackYourName } = bundle.add<typeof import("./your-name.web.ts")>(
    "./your-name.web.ts",
  );
  return async ({ userId }: { userId: string }) => {
    const user = await db.user.find(userId);
    return (
      <div ref={hackYourName}>
        Your name will be {user.name}
      </div>
    );
  };
};
```

### Hello world

You may check [hello-world example](./examples/hello-world)
