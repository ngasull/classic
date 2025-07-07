/**
 * # Classic server
 *
 * Modern web development is more complicated than it looks, so let's keep the process as clear as possible thanks to standards, guidelines and dedicated tools.
 *
 * ## Overview
 *
 * Classic aims to provide a cohesive stack of tools for specific needs (no need to check them right now):
 *
 * - [The Web](https://developer.mozilla.org/docs/Web/API)
 * - [@classic/server](https://jsr.io/@classic/server) - Buildable app server without wrapping tool
 * - [@classic/html](https://jsr.io/@classic/html) - Write HTML and JavaScript as JSX
 * - [@classic/js](https://jsr.io/@classic/js) - Manipulate client-side JavaScript from server code
 * - [@classic/router](https://jsr.io/@classic/router) - Client script providing dynamic routing from standard pages
 * - [@classic/morph](https://jsr.io/@classic/morph) - Simple element replacement, navigate without page reloads
 *
 * ## Highlights
 *
 * - Zero config, TS-only, deno-first, no external tool
 * - Designed for simplicity, composability and performance
 * - Plugin system helps you drive your app from build to browser in a single instruction
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
 * deno run -r --allow-write=. --allow-net https://raw.githubusercontent.com/ngasull/classic/main/examples/hello-world/init.ts
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
 * import { BuildServer } from "@classic/server/build"
 *
 * // Enable file-based routing on ./src
 * export default new BuildServer("src");
 * ```
 *
 * ### Root route
 *
 * ```tsx
 * // src/route.tsx
 *
 * import { declareLayout, declarePage } from "@classic/server";
 *
 * // Apply a layout to this route and every nested route
 * export const layout = declareLayout((children) => (
 *    <html>
 *      <head>
 *        <title>Hello world</title>
 *        <meta charset="utf-8" />
 *      </head>
 *      <body>
 *        {children}
 *      </body>
 *    </html>
 * ));
 *
 * // Current page (_root "/"_)
 * export default declarePage(() => (
 *   <>
 *     <h1>Root page</h1>
 *     <p>It works!</p>
 *   </>
 * ));
 * ```
 *
 * ### Nested route
 *
 * ```tsx
 * // src/hello.route.tsx or src/hello/route.tsx
 *
 * import { declarePage } from "@classic/server";
 *
 * // Current page (_"/hello"_)
 * export default declarePage(() => {
 *   return (
 *     <>
 *       <h1>Hello world!</h1>
 *       <p>Pages are wrapped in all parent layouts.</p>
 *       <p>This route is only wrapped in root layout.</p>
 *     </>
 *   );
 * });
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
 * ### Constructing stylesheets
 *
 * Stylesheets are declared at static level so they can be referenced during any build.
 * Some layout may retrieve its public path for HTML linking.
 * Warning: awaiting should be done at the last moment so the build isn't blocked.
 *
 * ```tsx
 * // src/route.tsx
 * import { declareLayout, declarePage } from "@classic/server";
 * import { styled } from "@classic/server/css";
 *
 * export const styles = styled.css`
 *   ${() => Deno.readFile("asset/pico.css")}
 *   ${() => Deno.readFile("asset/tailwind.css")}
 *
 *   :root {
 *     --pico-border-radius: 2rem;
 *   }
 *   h1 {
 *     font-family: Pacifico, cursive;
 *     font-weight: 400;
 *   }
 * `;
 *
 * export const layout = declareLayout(async (children) => {
 *   return (
 *     <html>
 *       <head>
 *         <title>Hello world</title>
 *         <meta charset="utf-8" />
 *         <link rel="stylesheet" href={styles.path} />
 *       </head>
 *       <body>
 *         {children}
 *       </body>
 *     </html>
 *   );
 * });
 *
 * // ... //
 * ```
 *
 * ## Ad-Hoc client-side JS
 *
 * ## Create and share your own builders
 *
 * @module
 */

export { Asset } from "./asset.ts";
export { specifierToUrl, urlToSpecifier } from "./module.ts";
export type { BuildableOptions, Exported, HandlerResult } from "./module.ts";
export { declareMutation } from "./mutation.ts";
export { declareLayout, declarePage } from "./page.ts";
export {
  RequestContext,
  useFetch,
  useMatchedPattern,
  useNext,
  useParams,
  useRedirect,
  useRequest,
} from "./request.ts";
export type { Method, Next, TypedRequest } from "./request.ts";
export { httpGET, httpMethod, httpPOST } from "./serve.ts";
export type { DeclareMethod, RouteParams } from "./serve.ts";
