import {
  $type,
  Child,
  Fragment,
  GetConfig,
  JSX,
  jsx,
  JSXElementType,
} from "../element/jsx-runtime.ts";
import { hyphenize } from "../element/util.ts";

declare global {
  namespace Classic {
    interface Config {
      [$type]: Promise<JSXElementType | null>;
    }
  }
}

export type FC<Props extends Record<string, unknown> = Record<never, never>> = (
  props: Props,
  context: GetConfig<"context">,
) => JSXElementType | null | Promise<JSXElementType | null>;

export type { JSX };

type JSXTemplateElement = {
  [$type]: [readonly string[], readonly Child[]];
};

export const jsxTemplate = (
  tpl: readonly string[],
  ...dynamic: readonly Child[]
): JSX.Element =>
  ({
    [$type]: [tpl as string[], dynamic],
  } satisfies JSXTemplateElement) as unknown as JSX.Element;

const propRemap: Record<string, string | undefined> = { className: "class" };

const propToAttrCache = new Map<string, string>();

const cachedAttr = (prop: string) => {
  const existing = propToAttrCache.get(prop);
  if (existing) return existing;

  const newAttr = hyphenize(prop);
  propToAttrCache.set(prop, newAttr);
  return newAttr;
};

export const jsxAttr = (
  prop: string,
  value: string | number | bigint | null | undefined,
): string =>
  value == null
    ? ""
    : `${propRemap[prop] ?? cachedAttr(prop)}='${
      typeof value === "string" ? escapeToHTML(value) : String(value)
    }'`;

export const jsxEscape = (value: string): string => value;

const serverJsx = jsx as <T extends keyof JSX.IntrinsicElements>(
  type: T,
  props?: T extends "" ? Record<never, never>
    : T extends keyof JSX.IntrinsicElements ? JSX.IntrinsicElements[T]
    : T extends FC<infer Props> ? Props
    : never,
) => JSX.Element;

export { Fragment, serverJsx as jsx };

const escapeMap = {
  // '"': "&quot;",
  "'": "&#39;",
  "&": "&amp;",
  // "<": "&lt",
  // ">": "&gt",
};

const escapeRegExp = new RegExp(`[${Object.keys(escapeMap).join("")}]`, "g");

const escapeToHTML = (text: string) =>
  text.replaceAll(escapeRegExp, (c) => escapeMap[c as keyof typeof escapeMap]);
