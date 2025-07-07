/**
 * Build and serve JavaScript modules
 *
 * @example Render a react app
 * ```tsx
 * import type React from "npm:react";
 * import type { Root } from "npm:react-dom/client";
 * import { declarePage } from "@classic/server";
 * import { Bundle } from "@classic/server/bundle";
 *
 * // Export bundle to build it
 * export const bundle = new Bundle("client");
 *
 * const react = bundle.add<typeof import("npm:react-dom/client")>("npm:react-dom/client");
 * const app = bundle.add<{ render: (root: Root) => void }>(import.meta.resolve("./app.tsx"));
 *
 * export default declarePage(() => (
 *   <html>
 *     <body ref={body => app.render(react.createRoot(body))} />
 *   </html>
 * ));
 * ```
 *
 * @module
 */

export { Bundle, bypassResolution } from "./server-bundle.ts";
