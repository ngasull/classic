/**
 * Render HTML from JSX, attach it ad-hoc JavaScript
 *
 * @example Create a working HTML response
 * ```tsx
 * import { render } from "@classic/html";
 * import { assertMatch } from "@std/assert";
 *
 * const page = (
 *   <html>
 *     <head>
 *       <title>Working web page</title>
 *     </head>
 *     <body>
 *       <h1>It works!</h1>
 *     </body>
 *   </html>
 * );
 *
 * const res = new Response(render(page));
 *
 * assertMatch(await res.text(), /<h1>It works!<\/h1>/);
 * ```
 *
 * @module
 */

export { render } from "./render.ts";
export type { ComponentProps, JSX } from "./types.ts";
export type { VoidElement } from "./void.ts";
