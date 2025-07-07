/**
 * Convert serializable value to JavaScript
 *
 * @example Basic conversions
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { stringify } from "@classic/js/stringify";
 *
 * const reeval = <T>(expr: string): T => eval(`(${expr})`);
 *
 * assertEquals(stringify(123), "123");
 * assertEquals(reeval(stringify(123)), 123);
 *
 * const now = new Date();
 * assertEquals(reeval<Date>(stringify(now)).toISOString(), now.toISOString());
 *
 * assertEquals(reeval(stringify({ foo: 123, bar: "baz" })), { foo: 123, bar: "baz" });
 * ```
 *
 * @module
 */

export { isDirectlyStringifiable, stringify } from "./stringify.ts";
export type { DirectlyStringifiable, Stringifiable } from "./stringify.ts";
