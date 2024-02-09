import { webModules } from "jsx-machine/hono.ts";
import { jsxContext, jsxRenderer } from "jsx-machine/hono/renderer.ts";
import { bundleWebImports } from "jsx-machine/js/web.ts";
import { Hono } from "hono/mod.ts";
// Don't import hono/middleware.ts as it overrides JSX types
import { compress } from "hono/middleware/compress/index.ts";
import { serveStatic } from "hono/adapter/deno/serve-static.ts";

import { dbContext } from "./db.ts";
import { root } from "./root.tsx";

const app = new Hono()
  .use("*", compress())
  .get("/public/*", serveStatic({ root: "./" }))
  .get("*", webModules(await bundleWebImports()))
  .get("*", jsxRenderer())
  .get("*", jsxContext(dbContext.init({ hello: "hi", multiverseNo: 42 })))
  .route("/", root);

Deno.serve({ port: 3000 }, app.fetch);
