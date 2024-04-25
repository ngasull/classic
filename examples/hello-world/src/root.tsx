import { Hono } from "hono/mod.ts";
import { layout, route } from "classic-web/hono/renderer.ts";
import type {
  JSXComponent,
  JSXParentComponent,
} from "classic-web/jsx/types.ts";

import { dbContext } from "./db.ts";

const RootLayout: JSXParentComponent = ({ children }, { effect }) => (
  <html>
    <head>
      <title>Hello world</title>
      <meta charset="utf-8" />
    </head>
    <body>
      {children}
    </body>
  </html>
);

const Index: JSXComponent = (_, { context }) => {
  const db = context(dbContext);
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
