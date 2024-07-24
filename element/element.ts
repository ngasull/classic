import {
  $,
  CSSStyleSheet,
  deepMap,
  defineProperties,
  defineProperty,
  document,
  entries,
  fromEntries,
  getOwnPropertyDescriptors,
  hyphenize,
  keys,
  length,
  NULL,
  querySelectorAll,
  UNDEFINED,
} from "@classic/util";
import { callOrReturn, onChange, signal } from "./signal.ts";

const $disconnectCallbacks: unique symbol = $() as never;
const $extends: unique symbol = $() as never;
const $internals: unique symbol = $() as never;
export const $props: unique symbol = $() as never;
const $propsSet: unique symbol = $() as never;
declare const $ref: unique symbol;

export type CustomElement<
  Props,
  Ref extends HTMLElement = HTMLElement,
> = {
  tag: string;
  readonly [$extends]?: string;
  readonly [$ref]: Ref;
  readonly [$props]: Props;
  new (): Ref & {
    readonly [$props]: Props;
  };
};

export type TypedHost<Public, Form extends boolean | undefined> =
  & Public
  & HTMLElement
  & {
    readonly [$internals]: Form extends true ? ElementInternals : never;
    readonly [$disconnectCallbacks]: Array<() => void>;
  };

export type ElementProps<T> = T extends CustomElement<infer Props, infer Ref>
  ? Partial<Props> & { readonly ref?: (el: Ref) => void }
  : never;

export type Children = Child | readonly Children[];

export type Child =
  | Node
  | string
  | number
  | null
  | undefined
  | (() => Node | string | number | null | undefined);

type SignalsSet<Props> = { [K in keyof Props]: (v: Props[K]) => void };

type Reactive<Props> = { [K in keyof Props]: () => Props[K] };

export const element = <
  PropTypes extends Record<string, PropType>,
  Form extends boolean | undefined,
  Def extends (
    dom: {
      (): TypedHost<Props, Form>;
      (children: Children | ShadowRoot):
        & TypedHost<Props, Form>
        & { readonly shadowRoot: ShadowRoot };
    },
    props: Reactive<Props>,
  ) => unknown,
  Props extends PropTypesProps<PropTypes>,
  Ref extends
    & HTMLElement
    & Props
    & (ReturnType<Def> extends {} ? ReturnType<Def> : unknown),
>(
  { props: propTypes = {} as PropTypes, extends: extendsTag, form, js, css }: {
    readonly props?: PropTypes;
    readonly extends?: string;
    readonly form?: Form;
    readonly css?: string | CSSStyleSheet | (string | CSSStyleSheet)[];
    readonly js?: Def;
  },
): CustomElement<Props, Ref> => {
  let ParentClass =
    (extendsTag
      ? document.createElement(extendsTag).constructor
      : HTMLElement) as typeof HTMLElement;
  let definedStyleSheets: CSSStyleSheet[] | null = NULL;
  let attrToProp: Record<string, keyof Props> = {};
  let propToAttr = {} as Record<keyof Props, string>;

  class ElementClass extends ParentClass {
    [$propsSet]: SignalsSet<Props> = {} as never;
    [$props]: Reactive<Props> = fromEntries(
      entries(propTypes).map(([prop, type]) => {
        let [get, set] = signal(() =>
          nativePropTypes.get(type)!(this.getAttribute(hyphenize(prop)))
        );
        this[$propsSet][prop as keyof Props] = set;
        return [prop, get];
      }),
    ) as never;
    [$extends] = extendsTag;
    [$internals] = (form && this.attachInternals()) as Form extends true
      ? ElementInternals
      : never;
    [$disconnectCallbacks]: Array<() => void> = [];

    static observedAttributes: string[];
    static readonly formAssociated = !!form;

    connectedCallback(): void {
      // deno-lint-ignore no-this-alias
      let self = this;
      let root = self.shadowRoot;

      let api = js?.(
        ((...args: [] | [Children | ShadowRoot]) => (
          length(args) &&
          renderChildren(root ??= attachShadow(self), args[0] as Children),
            self as unknown as TypedHost<Props, Form>
        )) as Parameters<NonNullable<typeof js>>[0],
        self[$props],
      );

      if (api) {
        defineProperties(self, getOwnPropertyDescriptors(api));
      }

      if (css) {
        if (!js) root ??= attachShadow(self);
        adoptedStyleSheets(root!).push(
          ...definedStyleSheets ??= deepMap(
            css,
            (v) => v instanceof CSSStyleSheet ? v : constructCSS(v),
          ),
        );
      }
    }

    disconnectedCallback() {
      this[$disconnectCallbacks].forEach((cb) => cb());
    }

    attributeChangedCallback(
      name: string,
      _prev: string | null,
      next: string | null,
    ) {
      let prop = attrToProp[name];
      this[$propsSet][prop](nativePropTypes.get(propTypes[prop])!(next));
    }
  }

  let proto = ElementClass.prototype;

  for (let prop of keys(propTypes) as (keyof Props & string)[]) {
    let attr = hyphenize(prop);
    attrToProp[attr] = prop;
    propToAttr[prop] = attr;
    if (!(prop in proto)) {
      defineProperty(proto, prop, {
        get() {
          return this[$props][prop]();
        },
        set(value) {
          this[$propsSet][prop](value);
        },
      });
    }
  }

  ElementClass.observedAttributes = keys(attrToProp);

  return ElementClass as unknown as CustomElement<Props, Ref>;
};

export const define = <Props, Ref extends HTMLElement>(
  name: `${string}-${string}`,
  ElementClass: CustomElement<Props, Ref>,
): void => {
  ElementClass.tag = name;
  ElementClass.prototype && customElements.define(name, ElementClass, {
    extends: ElementClass[$extends],
  });
};

export const declareTag = (): CustomElement<
  Record<never, never>,
  HTMLElement
> => (() => {}) as never;

export const onDisconnect = (
  host: TypedHost<any, boolean>,
  cb: () => void,
): void => {
  host[$disconnectCallbacks].push(cb);
};

export const useInternals = (host: TypedHost<any, true>): ElementInternals =>
  host[$internals];

type MakeUndefinedOptional<T> =
  & { [K in keyof T as undefined extends T[K] ? K : never]?: T[K] }
  & { [K in keyof T as undefined extends T[K] ? never : K]: T[K] };

export type PropTypesProps<PropTypes extends Record<string, PropType>> =
  MakeUndefinedOptional<
    { [K in keyof PropTypes]: PropTypePrimitive<PropTypes[K]> }
  >;

export type PropPrimitive =
  | boolean
  | number
  | bigint
  | string
  | Date
  | undefined;

type PropTypePrimitive<T extends PropType> = T extends typeof Boolean ? boolean
  : T extends typeof Number ? number | undefined
  : T extends typeof BigInt ? bigint | undefined
  : T extends typeof String ? string | undefined
  : T extends typeof Date ? Date | undefined
  : never;

export type PropType =
  | typeof Boolean
  | typeof Number
  | typeof BigInt
  | typeof String
  | typeof Date;

const nativePropTypes = new Map<PropType, (attr: string | null) => any>([
  [Boolean, (attr: string | null) => attr != null],
  ...[Number, BigInt, String, Date].map((decode: PropType) =>
    [decode, (v: string | null) => v == NULL ? UNDEFINED : decode(v)] as const
  ),
]);

export const adoptedStyleSheets = (shadow: ShadowRoot): CSSStyleSheet[] =>
  shadow.adoptedStyleSheets;

export const declarativeFirstStyle = (): void => {
  let tagStyles: Record<string, CSSStyleSheet[] | undefined> = {},
    el,
    shadowRoot;
  for (el of querySelectorAll(":not(:defined)")) {
    shadowRoot = el.shadowRoot;
    if (shadowRoot) {
      adoptedStyleSheets(shadowRoot).push(
        ...tagStyles[el.tagName] ??= [
          ...(shadowRoot.styleSheets ?? []),
        ].map(cloneStyleSheet),
      );
    }
  }
};

export const cloneStyleSheet = (styleSheet: CSSStyleSheet): CSSStyleSheet => {
  let cssRules: string[] = [], r;
  for (r of styleSheet.cssRules) cssRules.push(r.cssText);
  return constructCSS(cssRules.join(""));
};

export const renderChildren = (el: ParentNode, children: Children) =>
  el.replaceChildren(
    ...deepMap(children, (c) => {
      let node: Node;
      onChange(
        () => {
          node = (callOrReturn(c) ?? "") as Node;
          return node = node instanceof Node
            ? node
            : document.createTextNode(node as string);
        },
        (current, prev) => el.replaceChild(current, prev),
      );
      return node!;
    }),
  );

export const css = (tpl: TemplateStringsArray): string => tpl[0];

const constructCSS = (
  css: string,
  styleSheet = new CSSStyleSheet(),
) => (styleSheet.replace(css), styleSheet);

const attachShadow = (host: HTMLElement) => host.attachShadow({ mode: "open" });
