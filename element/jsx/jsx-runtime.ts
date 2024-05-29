import { JSXInternal } from "./jsx-dom.d.ts";

export const $type = Symbol();

export type JSXElementType = {
  [$type]: "" | keyof JSX.IntrinsicElements;
  readonly children?: Children;
};

export type Children = Child | readonly Child[];

export type Child = JSX.Element | string | null;

export type IntrinsicElementProps<T> = T extends "" ? Record<never, never>
  : T extends keyof JSX.IntrinsicElements ? JSX.IntrinsicElements[T]
  : never;

declare global {
  namespace Classic {
    // deno-lint-ignore no-empty-interface
    interface Config {}
    // deno-lint-ignore no-empty-interface
    interface Elements {}
  }
}

declare namespace JSX {
  type IntrinsicElements = JSXInternal.IntrinsicElements & Classic.Elements;
  type Element = JSXElementType | GetConfig<typeof $type>;
}

export type { JSX };

export type GetConfig<K extends string | symbol> = Classic.Config extends
  Record<K, infer X> ? X
  : never;

export const jsx = <T extends keyof JSX.IntrinsicElements>(
  type: T,
  props: IntrinsicElementProps<T> = {} as IntrinsicElementProps<T>,
): JSX.Element => {
  (props as JSXElementType)[$type] = type;
  return props as JSX.Element;
};

export const Fragment = (
  { children }: { key?: string; children?: Children },
): JSX.Element => ({ [$type]: "", children });
