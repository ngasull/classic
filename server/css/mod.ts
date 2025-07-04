/**
 * Compile and serve style sheets on the fly
 *
 * @example Declare a style sheet that sets dark grey text color for every page of a layout
 * ```tsx
 * import { declareLayout } from "@classic/server";
 * import { styled } from "@classic/server/css";
 *
 * export const styles = styled.css`
 *   body {
 *     color: #666;
 *   }
 * `;
 *
 * export const layout = declareLayout((children) => (
 *    <html>
 *      <head>
 *        <title>Hello world</title>
 *        <meta charset="utf-8" />
 *        <link rel="stylesheet" href={styles.path} />
 *      </head>
 *      <body>
 *        {children}
 *      </body>
 *    </html>
 * ));
 * ```
 *
 * @module
 */

export { styled } from "./css.ts";
