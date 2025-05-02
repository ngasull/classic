/**
 * # Classic page
 *
 * Modern web development is more complicated than it looks, so let's keep the process as clear as possible thanks to standards, guidelines and dedicated tools.
 *
 * ## Overview
 *
 * Cohesive stack of tools dedicated to specific needs (no need to check them right now):
 *
 * - [The Web](https://developer.mozilla.org/docs/Web/API)
 * - [@classic/server](https://jsr.io/@classic/server) - Buildable app server without wrapping tool
 * - [@classic/html](https://jsr.io/@classic/html) - Write HTML and JavaScript as JSX
 * - [@classic/js](https://jsr.io/@classic/js) - Manipulate client-side JavaScript from server code
 * - [@classic/morph](https://jsr.io/@classic/morph) - Simple element replacement, navigate without page reloads
 *
 * ## Highlights
 *
 * - Zero config, TS-only, deno-first, no external tool
 * - Designed for simplicity, composability and performance
 * - Plugin system helps you drive your app from build to browser in a single line of code
 * - File-based routing, dynamic nested routing à la Remix
 * - Server code only ; not bound to any client-side JS library
 * - Ad-hoc typed client JS API in server's JSX
 * - Sane defaults
 *
 * ## Get started
 *
 * We all love quick fiddling and here's a template to do so, however we strongly recommend having a look at Classic principles at the same time.
 * **Classic isn't like any other framework**.
 *
 * With [deno](https://deno.com/) installed:
 * ```bash
 * # Bootstrap your application
 * deno run -W=. init.ts
 *
 * # Run dev server
 * deno task dev
 * ```
 *
 * ### Why use file based routing
 *
 * - Defines a file tree structure convention
 * - Splits each route's code by design
 * - Enables lazy loading
 * - Avoids maintaining a huge entrypoint
 * - Scalable code base
 * - Predictible routes keep performance up
 * - Facilitates nested routes dynamic loading
 *
 * ### When not to use it
 *
 * - Writing a very dynamic API
 * - Writing a non-standard API
 * - Serving a single page
 *
 * ### Entry point
 *
 * ```ts ignore
 * import { useFileRouter } from "@classic/router"
 * import { defineServer } from "@classic/server/build"
 *
 * export default defineServer((build) => {
 *
 *   // Enable file-based routing on ./src
 *   useFileRouter("src");
 * });
 * ```
 *
 * ### Root route
 *
 * ```tsx
 * // src/route.tsx
 *
 * import { declareLayout, declarePage } from "@classic/router";
 *
 * export default () => {
 *
 *   // Apply a layout to this route and every nested route
 *   declareLayout((req, children) => {
 *     return (
 *       <html>
 *         <head>
 *           <title>Hello world</title>
 *           <meta charset="utf-8" />
 *         </head>
 *         <body>
 *           {children}
 *         </body>
 *       </html>
 *     );
 *   });
 *
 *   // Current page (_root "/"_)
 *   declarePage((req) => (
 *     <>
 *       <h1>Root page</h1>
 *       <p>It works!</p>
 *     </>
 *   ));
 * };
 * ```
 *
 * ### Nested route
 *
 * ```tsx
 * // src/hello.route.tsx or src/hello/route.tsx
 *
 * import { declarePage } from "@classic/router";
 *
 * export default () => {
 *
 *   // Current page (_"/hello"_)
 *   declarePage((req) => {
 *     return (
 *       <>
 *         <h1>Hello world!</h1>
 *         <p>Pages are wrapped in all parent layouts.</p>
 *         <p>This route is only wrapped in root layout.</p>
 *       </>
 *     );
 *   });
 * };
 * ```
 *
 * ## Linking CSS
 *
 * There are too many ways to style an app. Without the adequate knowledge, searching for the right decision can be a nightmare.
 *
 * The Classic stack recommends having 2 styling layers :
 * - Stylesheet
 * - Ad-hoc styling
 *
 * The stylesheet provides reused styles across your app and adheres to the CSS mindset.
 * We recommend using a semantic HTML CSS framework like picocss or writing your own rules.
 *
 * Ad-hoc styling allows adding uncommon styles per-page.
 * It can be done with inline styles or by using utility classes like TailwindCSS does.
 * This approach has proven useful for teams that have a quickly evolving product with creative designers.
 *
 * As long as they share the same design system, stacking both approches allows you write HTML that is well-styled by default while keeping per-page flexibitly.
 *
 * ### Stylesheet
 *
 * ```tsx
 * // src/route.tsx
 *
 * import { declareLayout, declarePage } from "@classic/router";
 *
 * export default () => {
 *
 *   // Embed and/or write layout-level CSS
 *   // Compiled into an optimized stylesheet
 *   const styleSheet = declareLayout.css`
 *     ${() => Deno.readFile("asset/pico.css")}
 *     ${() => Deno.readFile("asset/tailwind.css")}
 *
 *     :root {
 *       --pico-border-radius: 2rem;
 *     }
 *     h1 {
 *       font-family: Pacifico, cursive;
 *       font-weight: 400;
 *     }
 *   `;
 *
 *   declareLayout((req, children) => {
 *     return (
 *       <html>
 *         <head>
 *           <title>Hello world</title>
 *           <meta charset="utf-8" />
 *           <styleSheet.Html />
 *         </head>
 *         <body>
 *           {children}
 *         </body>
 *       </html>
 *     );
 *   });
 *
 *   // ... //
 * };
 * ```
 *
 * ### Ad-hoc styling without a utility-based framework
 *
 * In some cases, page-specific CSS may be needed. Not recommended for the general use case.
 *
 * ```tsx
 * import { declarePage } from "@classic/router";
 *
 * export default () => {
 *
 *   // Page-specific CSS rules
 *   // Compiled into an optimized stylesheet
 *   // Embedded in layout's PageStyle automatically
 *   declarePage.css`
 *     ${() => Deno.readFile("asset/supergraphlib.css")}
 *
 *     h1.hellover:hover {
 *       background: red;
 *     }
 *   `;
 *
 *   // Declare current page (_/hello_)
 *   declarePage((req) => (
 *     <>
 *       <h1 class="hellover">Hello world!</h1>;
 *       <svg class="supergraph">...</svg>
 *     </>
 *   ));
 * };
 * ```
 *
 * ## Ad-Hoc client-side JS
 *
 * ## Create and share your own builders
 *
 * @module
 */

export { useFileRouter } from "./build.ts";
export { declareMutation } from "./mutation.ts";
export { declareLayout, declarePage } from "./page.ts";
