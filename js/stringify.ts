/**
 * Convert serializable value to JavaScript
 *
 * @module
 */

const safeRecordKeyRegExp = /^(?:[A-z_$][\w_$]*|\d+)$/;

type JSPrimitive =
  | null
  | undefined
  | boolean
  | number
  | bigint
  | string
  | RegExp;

type JSValue = JSPrimitive | Date | URL;

/** A value that can be converted to a JavaScript expression */
export type Stringifiable =
  | JSValue
  | readonly Stringifiable[]
  | { readonly [k: string]: Stringifiable }
  | ReadonlySet<Stringifiable>
  | ReadonlyMap<Stringifiable, Stringifiable>;

/**
 * Converts a JavaScript value to a JavaScript expression string
 *
 * @param value Stringifiable JS object
 *
 * WARNING: if produced code is intended to be written in an HTML
 * `<script>` tag, make sure to escape it properly in order to
 * protect your users from XSS.
 */
export const stringify = (value: Stringifiable): string => {
  const strs: string[] = [];
  walk(value, (str) => {
    strs.push(str);
  });
  return strs.join("");
};

const walk = (
  value: Stringifiable,
  write: (str: string) => void,
): void => {
  if (value === undefined) return write("undefined");
  if (value === null) return write("null");

  switch (typeof value) {
    case "object": {
      if (Array.isArray(value)) {
        write("[");
        value.forEach((v, i) => {
          if (i > 0) write(",");
          walk(v, write);
        });
        write("]");
      } else if (value instanceof Date) {
        write("new Date(");
        write(JSON.stringify(value.toISOString()));
        write(")");
      } else if (value instanceof URL) {
        write("new URL(");
        write(JSON.stringify(value.href));
        write(")");
      } else if (value instanceof Set) {
        write("new Set(");
        walk([...value.values()], write);
        write(")");
      } else if (value instanceof Map) {
        write("new Map(");
        walk([...value.entries()], write);
        write(")");
      } else if (value instanceof RegExp) {
        write(value.toString());
      } else {
        write("{");
        Object.entries(value).forEach(([k, v], i) => {
          if (i > 0) write(",");
          write(safeRecordKeyRegExp.test(k) ? k : JSON.stringify(k));
          write(":");
          walk(v, write);
        });
        write("}");
      }
      return;
    }
    case "number":
      return write(
        isNaN(value) ? "NaN" : isFinite(value) ? value.toString() : "Infinity",
      );
    case "bigint":
      return write(`${value}n`);
    default:
      return write(JSON.stringify(value));
  }
};
