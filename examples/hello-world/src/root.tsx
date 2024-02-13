import { Hono } from "hono/mod.ts";
import { layout, route } from "jsx-machine/hono/renderer.ts";
import type {
  JSXComponent,
  JSXParentComponent,
} from "jsx-machine/jsx/types.ts";

import { dbContext } from "./db.ts";
// Your bundle is built by scanning calls to this import
import { web } from "./web-modules.gen.ts";

const RootLayout: JSXParentComponent = ({ children }) => (
  <html>
    <head>
      <title>Hello world</title>
      <meta charset="utf-8" />
    </head>
    <body
      // Optional: client-side dynamic routing _à la_ Remix
      ref={(body) => web.module("jsx-machine/dom/router.ts").register(body)}
    >
      {children}
    </body>
  </html>
);

const Index: JSXComponent = (_, ctx) => {
  const db = ctx.get(dbContext);
  return (
    <>
      <h1>Welcome</h1>
      <p>
        You should visit <a href="/world">the world</a>
      </p>
      <p>Its rank is #{db.multiverseNo} in the multiverse</p>
    </>
  );
};

export const root = new Hono()
  // Map layouts however you like
  .get("*", layout(RootLayout))
  // Structure with components...
  .get("/", route(Index))
  // ...or directly send JSX bits!
  .get("/world", (c) =>
    c.render(
      <>
        <h1>World</h1>
        <p>Hello from there!</p>
      </>,
    ));
