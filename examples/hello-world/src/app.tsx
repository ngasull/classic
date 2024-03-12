import { jsxMachine } from "jsx-machine/hono.ts";
import { jsxContext } from "jsx-machine/hono/renderer.ts";
import { Hono } from "hono/mod.ts";
// Don't import hono/middleware.ts as it messes with JSX global namespace
import { compress } from "hono/middleware/compress/index.ts";
import { serveStatic } from "hono/adapter/deno/serve-static.ts";

import { dbContext } from "./db.ts";
import { root } from "./root.tsx";
import { bundle } from "./bundle.ts";

export const app = new Hono()
  .use(
    "*",
    compress(),
    jsxMachine(bundle),
    jsxContext(dbContext({ hello: "hi", multiverseNo: 42 })),
  )
  .get("/public/*", serveStatic({ root: "./" }))
  .route("/", root);
