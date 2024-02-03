import { Hono } from "hono/mod.ts";
import { bundleWebImports } from "jsx-machine/js/web.ts";
import { serveBundle, serveRoutes } from "jsx-machine/hono.ts";

const app = new Hono();

serveBundle(
  app,
  await bundleWebImports(),
);

// Your bundle is built by scanning calls to this import
const { web } = await import(`${"./web-modules.gen.ts"}`);

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
          <body
            // Optional: client-side dynamic routing _à la_ Remix
            ref={(body) =>
              web.module("jsx-machine/dom/router.ts").register(body)}
          >
            {children}
          </body>
        </html>
      ),
      index: () => (
        <>
          <h1>Welcome</h1>
          <p>
            You should visit <a href="/world">the world</a>
          </p>
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
