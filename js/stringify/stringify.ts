const $stringify = Symbol.for("classic.stringify");

const safeRecordKeyRegExp = /^(?:[A-z_$][\w_$]*|\d+)$/;

export type JSPrimitive =
  | null
  | undefined
  | void
  | boolean
  | number
  | bigint
  | string
  | symbol;

/** A non-primitive native object value that is stringifiable */
export type DirectlyStringifiable = Date | RegExp | URL | Uint8Array;

/** A value that can be converted to a JavaScript expression */
export type Stringifiable =
  | JSPrimitive
  | DirectlyStringifiable
  | readonly Stringifiable[]
  | ReadonlySet<Stringifiable>
  | ReadonlyMap<Stringifiable, Stringifiable>
  | StringifiableManually;

/** Any object implementing a stringify function (`Symbol.for("classic.stringify")`) */
type StringifiableManually = object;

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
    case "function":
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
        if (value.length > 0) {
          write(
            // Encode bytes to the first UTF-16 non-invisible characters
            // First non-invisible character is space ' ' === String.fromCharCode(32)
            // From 127 to 160, the 34 characters are not printable so we skip them
            'new Uint8Array((s=>{let a=Array(s.length);for(let i=0;i<s.length;i++){let c=s.charCodeAt(i)-32;a[i]=c<127?c:c-34}return a})("',
          );
          value.forEach((c) => {
            const encoded = String.fromCharCode(c + 32 + (c < 127 ? 0 : 34));
            if (encoded === '"' || encoded === "\\") write("\\");
            write(encoded);
          });
          write('"))');
        } else {
          write("new Uint8Array()");
        }
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
        if ($stringify in value && typeof value[$stringify] === "function") {
          return write(value[$stringify](value));
        } else if (typeof value === "function") {
          throw Error(`Functions can't be stringified`);
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
    default:
      return write(JSON.stringify(value));
  }
};

const stringifiables = new Set();
stringifiables.add(Date);
stringifiables.add(RegExp);
stringifiables.add(Uint8Array);
stringifiables.add(URL);
// stringifiables.add(Set);
// stringifiables.add(Map);

/** */
export const isDirectlyStringifiable = (v: unknown): v is Stringifiable => {
  switch (typeof v) {
    case "function":
    case "object":
      return v === null || stringifiables.has(v.constructor);
    case "symbol":
      return Symbol.keyFor(v) != null;
    default:
      return true;
  }
};
