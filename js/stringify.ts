/**
 * Convert serializable value to JavaScript
 *
 * @module
 */

const safeRecordKeyRegExp = /^(?:[A-z_$][\w_$]*|\d+)$/;

type JSPrimitive =
  | null
  | undefined
  | void
  | boolean
  | number
  | bigint
  | string
  | symbol
  | RegExp;

type JSValue = JSPrimitive | Date | URL | Uint8Array;

/** A value that can be converted to a JavaScript expression */
export type Stringifiable =
  | JSValue
  | readonly Stringifiable[]
  | Readonly<StringifiableObject>
  | ReadonlySet<Stringifiable>
  | ReadonlyMap<Stringifiable, Stringifiable>
  | StringifiableManually;

/** A plain JavaScript object */
type StringifiableObject = {
  [k: string]: Stringifiable;
  [k: symbol]: unknown;
};

/** Any object implementing a stringify function */
type StringifiableManually = { stringify(obj: unknown): string };

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
  // const replaceSymbols = opts?.replace &&
  //   Object.getOwnPropertySymbols(opts.replace);
  // const replace = replaceSymbols && ((o: never) => {
  //   const key = replaceSymbols.find((k) => k in o);
  //   if (key != null) {
  //     return opts.replace[key](o);
  //   }
  // });

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
      } else if (value instanceof Uint8Array) {
        write('new Uint8Array(Array.from("');
        value.forEach((c) => {
          write(String.fromCharCode(c + 22));
        });
        write('").map(c=>c.charCodeAt(0)-22))');
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
        if ("stringify" in value && typeof value.stringify === "function") {
          return write(value.stringify(value));
        }

        write("{");
        let first = true;
        Object.entries(value).forEach(([k, v]) => {
          if (first) first = false;
          else write(",");
          write(safeRecordKeyRegExp.test(k) ? k : stringify(k));
          write(":");
          walk(v, write);
        });
        Object.getOwnPropertySymbols(value).forEach((s) => {
          const key = Symbol.keyFor(s);
          if (key != null) {
            if (first) first = false;
            else write(",");
            write("[Symbol.for(");
            write(JSON.stringify(key));
            write(")]:");
            walk((value as Record<symbol, Stringifiable>)[s], write);
          }
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
    case "symbol": {
      const key = Symbol.keyFor(value);
      if (key == null) {
        throw Error(`Only symbols created with Symbol.for can be stringified`);
      }
      write("Symbol.for(");
      write(JSON.stringify(key));
      write(")");
      return;
    }
    case "function":
      throw Error(`Functions can't be stringified`);
    default:
      return write(JSON.stringify(value));
  }
};
