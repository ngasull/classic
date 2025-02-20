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
  | symbol
  | RegExp;

type JSValue = JSPrimitive | Date | URL;

export type StringifiableExt<T> =
  | JSValue
  | T
  | readonly StringifiableExt<T>[]
  | Readonly<StringifiableObject<T>>
  | ReadonlySet<StringifiableExt<T>>
  | ReadonlyMap<StringifiableExt<T>, StringifiableExt<T>>;

/** A value that can be converted to a JavaScript expression */
export type Stringifiable = StringifiableExt<never>;

/** A plain JavaScript object */
type StringifiableObject<T = never> = {
  [k: string | symbol]: typeof k extends string ? StringifiableExt<T>
    : unknown;
};

/**
 * {@linkcode stringify} options
 */
export interface StringifyOpts {
  readonly replace: {
    readonly [key: symbol]: (obj: never) => string;
  };
}

/**
 * Converts a JavaScript value to a JavaScript expression string
 *
 * @param value Stringifiable JS object
 * @param opts Stringification options
 *
 * WARNING: if produced code is intended to be written in an HTML
 * `<script>` tag, make sure to escape it properly in order to
 * protect your users from XSS.
 */
export const stringify = (
  value: Stringifiable,
  opts?: StringifyOpts,
): string => {
  const replaceSymbols = opts?.replace &&
    Object.getOwnPropertySymbols(opts.replace);
  const replace = replaceSymbols && ((o: never) => {
    const key = replaceSymbols.find((k) => k in o);
    if (key != null) {
      return opts.replace[key](o);
    }
  });

  const strs: string[] = [];
  walk(value, replace, (str) => {
    strs.push(str);
  });
  return strs.join("");
};

const walk = (
  value: Stringifiable,
  replace: ((o: never) => string | undefined) | undefined,
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
          walk(v, replace, write);
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
        walk([...value.values()], replace, write);
        write(")");
      } else if (value instanceof Map) {
        write("new Map(");
        walk([...value.entries()], replace, write);
        write(")");
      } else if (value instanceof RegExp) {
        write(value.toString());
      } else {
        const replaced = replace?.(value as never);
        if (replaced != null) return write(replaced);

        write("{");
        let first = true;
        Object.entries(value).forEach(([k, v]) => {
          if (first) first = false;
          else write(",");
          write(safeRecordKeyRegExp.test(k) ? k : stringify(k));
          write(":");
          walk(v, replace, write);
        });
        Object.getOwnPropertySymbols(value).forEach((s) => {
          const key = Symbol.keyFor(s);
          if (key != null) {
            if (first) first = false;
            else write(",");
            write("[Symbol.for(");
            write(JSON.stringify(key));
            write(")]:");
            walk((value as Record<symbol, Stringifiable>)[s], replace, write);
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
