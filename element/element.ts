import { callOrReturn, onChange, signal } from "./signal.ts";
import {
  $,
  deepMap,
  defineProperties,
  doc,
  entries,
  fromEntries,
  getOwnPropertyDescriptors,
  hyphenize,
  isString,
  keys,
  length,
  NULL,
  querySelectorAll,
  UNDEFINED,
} from "@classic/util";

const $disconnectCallbacks: unique symbol = $() as never;
const $internals: unique symbol = $() as never;
const $props: unique symbol = $() as never;
const $propsSet: unique symbol = $() as never;
declare const $tag: unique symbol;

declare namespace Classic {
  interface Elements {}
}

export type { Classic };

type ClassOf<T> = { new (): T; readonly prototype: T };

type CustomTag = `${string}-${string}`;

export type CustomElement<
  Tag extends CustomTag | undefined,
  Props,
  T = unknown,
> =
  & ClassOf<HTMLElement & Props & T>
  & {
    [$tag]?: Tag;
    readonly [$props]: Props;
  };

export type TypedHost<Public, Form extends boolean | undefined> =
  & Public
  & HTMLElement
  & {
    readonly [$internals]: Form extends true ? ElementInternals : never;
    readonly [$disconnectCallbacks]: Array<() => void>;
  };

export type ElementProps<T> = T extends
  CustomElement<CustomTag, infer Props, infer Base>
  ? Partial<Props> & { readonly ref?: (el: HTMLElement & Base) => void }
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

export const define = <
  N extends CustomTag,
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
  Api extends ReturnType<Def>,
>(
  name: N,
  { props: propTypes = {} as PropTypes, extends: extendsTag, form, js, css }: {
    readonly props?: PropTypes;
    readonly extends?: string;
    readonly form?: Form;
    readonly css?:
      | string
      | CSSRules
      | CSSStyleSheet
      | (string | CSSRules | CSSStyleSheet)[];
    readonly js?: Def;
    /** Makes `js` run after DOMContentLoaded, ensuring declarative shadow DOM has natively executed */
    // readonly declarative?: Declarative;
  },
): CustomElement<N, Props, Api> => {
  if (!doc) {
    // @ts-ignore stub switch for universal compiling
    return;
  }

  let ParentClass =
    (extendsTag
      ? doc.createElement(extendsTag).constructor
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

      // if (declarative) {
      // Attach declarative for dynamic updates and browsers that dont support it
      // onDOMContentLoaded(() => root ??= attachDeclarative(self));
      // }

      let api = js?.(
        ((...args: [] | [Children | ShadowRoot]) => (
          length(args) &&
          renderChildren(root ??= attachShadow(self), args[0] as Children),
            self as unknown as TypedHost<Props, Form>
        )) as Parameters<NonNullable<typeof js>>[0],
        self[$props],
      );

      if (!js && css) root ??= attachShadow(self);

      if (api) {
        defineProperties(self, getOwnPropertyDescriptors(api));
      }

      if (css) {
        adoptedStyleSheets(root!).push(
          ...definedStyleSheets ??= deepMap(css, buildStyleSheet),
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
  let properties: PropertyDescriptorMap & {
    [p: string]: ThisType<ElementClass>;
  } = {};

  for (let prop of keys(propTypes) as (keyof Props & string)[]) {
    let attr = hyphenize(prop);
    attrToProp[attr] = prop;
    propToAttr[prop] = attr;
    if (!(prop in proto)) {
      properties[prop] = {
        get() {
          return this[$props][prop]();
        },
        set(value) {
          this[$propsSet][prop](value);
        },
      };
    }
  }

  defineProperties(proto, properties);
  ElementClass.observedAttributes = keys(attrToProp);

  customElements.define(name, ElementClass, { extends: extendsTag });

  return ElementClass as unknown as CustomElement<N, Props, Api>;
};

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
  return buildStyleSheet(cssRules.join(""));
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
            : doc.createTextNode(node as string);
        },
        (current, prev) => el.replaceChild(current, prev),
      );
      return node!;
    }),
  );

export const css = (tpl: TemplateStringsArray): string => tpl[0];

export type CSSRules = Record<string, CSSDeclaration | string>;

type CSSDeclaration = { [k: string]: string | number | CSSDeclaration };

export const buildStyleSheet = (
  rules: string | CSSRules | CSSStyleSheet,
): CSSStyleSheet => {
  let Clazz = CSSStyleSheet, styleSheet;

  if (rules instanceof Clazz) return rules;

  styleSheet = new Clazz();
  if (isString(rules)) {
    styleSheet.replace(rules);
  } else {
    entries(rules).forEach(([selector, declaration], i) =>
      styleSheet.insertRule(
        isString(declaration)
          ? selector + declaration
          : toRule(selector, declaration),
        i,
      )
    );
  }
  return styleSheet;
};

const toRule = (selector: string, declaration: CSSDeclaration): string =>
  `${selector || ":host"}{${
    entries(declaration)
      .map(([property, value]) =>
        typeof value === "object"
          ? toRule(property, value)
          : `${hyphenize(property)}:${value};`
      )
      .join("")
  }}`;

const attachShadow = (host: HTMLElement) => host.attachShadow({ mode: "open" });

// const attachDeclarative = (
//   host: HTMLElement,
//   template = querySelector<HTMLTemplateElement>(
//     "template[shadowrootmode=open]",
//     host,
//   ),
//   shadow = host.attachShadow({ mode: "open" }),
// ) => (template && (shadow.append(template.content), remove(template)), shadow);
