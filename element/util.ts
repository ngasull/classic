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
