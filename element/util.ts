export const { isArray } = Array;

export const { entries, getOwnPropertyDescriptors, keys, defineProperties } =
  Object;

export const isString = (v: unknown): v is string => typeof v === "string";

export const mapOrDo = <T, R>(
  v: T | readonly T[],
  cb: (v: T, i: number) => R,
): R[] => isArray(v) ? v.map(cb) : [cb(v as T, 0)];

const camelRegExp = /[A-Z]/g;

export const hyphenize = (camel: string) =>
  camel.replace(
    camelRegExp,
    (l: string) => "-" + l.toLowerCase(),
  );

// const hyphensRegExp = /-(.)/g;

// const camelize = (hyphened: string) =>
//   hyphened.toLowerCase().replace(
//     hyphensRegExp,
//     (_, l: string) => l.toUpperCase(),
//   );
