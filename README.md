> Backend-first async JSX serving client-side with sexy hooks 🦜

## Get started with Hono

```sh
# Will prompt you a folder name to create
deno run --allow-write=. --allow-net=raw.githubusercontent.com,api.github.com https://raw.githubusercontent.com/ngasull/jsx-machine/master/init.ts
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
- If necessary, use a UI library to manage a single component

## Show me code!

_Remember: everything runs server-side except what is explicitly wrapped in JS types!_

### Hook JS to generated HTML

```tsx
import { js } from "jsx-machine/js.ts"
import { renderToString } from "jsx-machine/jsx/render.ts"

renderToString(
  <div ref={(div) => js`${div}.innerText += "ly hooked!"`}>
    Superb
  </div>
)
```

### Manipulate and auto-bundle client-side JS without string interpolation

```tsx
<body
  // Enable client-side dynamic routing _à la_ Remix
  ref={(body) => web.module("jsx-machine/dom/router.ts").register(body)}
>
  {children}
</body>
```

### Hello world

You may check [hello-world example](./examples/hello-world)
