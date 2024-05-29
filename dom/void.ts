export type VoidElement = typeof voidList[number];

const voidList = [
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
] as const;

export const voidElements = new Set<string>(voidList);
