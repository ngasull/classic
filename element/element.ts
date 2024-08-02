import {
  call,
  deepMap,
  defineProperties,
  defineProperty,
  entries,
  fromEntries,
  getOwnPropertyDescriptors,
  hyphenize,
  keys,
  length,
  listen,
  NULL,
} from "@classic/util";
import { callOrReturn, onChange, signal } from "./signal.ts";
import { PropType } from "./props.ts";

const { CSSStyleSheet: CSSStyleSheet_, document: document_, Symbol: Symbol_ } =
  globalThis;

const $disconnectCallbacks: unique symbol = Symbol_() as never;
export const $extends: unique symbol = Symbol_() as never;
export const $props: unique symbol = Symbol_() as never;
const $propsSet: unique symbol = Symbol_() as never;
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

type TypedHost<Public> =
  & Public
  & HTMLElement
  & { readonly [$disconnectCallbacks]: Array<() => void> };

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
  PropTypes extends Record<string, PropType<unknown>>,
  Def extends (
    dom: {
      (): TypedHost<Props>;
      (children: Children):
        & TypedHost<Props>
        & { readonly shadowRoot: ShadowRoot };
    },
    props: Reactive<Props>,
  ) => unknown,
  Props extends { [P in keyof PropTypes]: ReturnType<PropTypes[P]> },
  Ref extends
    & HTMLElement
    & Props
    & (ReturnType<Def> extends {} ? ReturnType<Def> : unknown),
>(
  {
    props: propTypes = {} as PropTypes,
    extends: extendsTag,
    class: decorateClass,
    js,
    css,
    defer,
  }: {
    readonly props?: PropTypes;
    readonly extends?: string;
    readonly class?: (clazz: { new (): HTMLElement }) => void;
    readonly css?: string | CSSStyleSheet | (string | CSSStyleSheet)[];
    readonly js?: Def;
    readonly defer?: boolean;
  },
): CustomElement<Props, Ref> => {
  let definedStyleSheets: CSSStyleSheet[] | null = NULL;
  let attrToProp: Record<string, keyof Props> = {};
  let propToAttr = {} as Record<keyof Props, string>;

  class ElementClass extends HTMLElement {
    [$propsSet]: SignalsSet<Props> = {} as never;
    [$props]: Reactive<Props> = fromEntries(
      entries(propTypes).map(([prop, type]) => {
        let [get, set] = signal(() => type(this.getAttribute(hyphenize(prop))));
        this[$propsSet][prop as keyof Props] = set;
        return [prop, get];
      }),
    ) as never;
    static [$extends] = extendsTag;
    [$disconnectCallbacks]: Array<() => void> = [];

    static observedAttributes: string[];

    connectedCallback() {
      if (defer && document_.readyState == "loading") {
        listen(document_, "DOMContentLoaded", () => this.connectedCallback());
      } else {
        // deno-lint-ignore no-this-alias
        let THIS = this;
        let root = THIS.shadowRoot;
        let api = js?.(
          ((...args: [] | [Children | ShadowRoot]) => (
            length(args) &&
            renderChildren(root ??= attachShadow(THIS), args[0] as Children),
              THIS as unknown as TypedHost<Props>
          )) as Parameters<NonNullable<typeof js>>[0],
          THIS[$props],
        );

        if (api) {
          defineProperties(THIS, getOwnPropertyDescriptors(api));
        }

        if (css) {
          (root ?? attachShadow(THIS))!.adoptedStyleSheets.push(
            ...definedStyleSheets ??= deepMap(
              css,
              (v) => v instanceof CSSStyleSheet_ ? v : constructCSS(v),
            ),
          );
        }
      }
    }

    disconnectedCallback() {
      this[$disconnectCallbacks].map(call);
    }

    attributeChangedCallback(
      name: string,
      _prev: string | null,
      next: string | null,
    ) {
      let prop = attrToProp[name];
      this[$propsSet][prop](
        propTypes[prop as keyof PropTypes](next) as Props[typeof prop],
      );
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

  decorateClass?.(ElementClass);

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

export const bare = (): CustomElement<
  Record<never, never>,
  HTMLElement
> => (() => {}) as never;

export const onDisconnect = (
  host: TypedHost<any>,
  cb: () => void,
): void => {
  host[$disconnectCallbacks].push(cb);
};

type MakeUndefinedOptional<T> =
  & { [K in keyof T as undefined extends T[K] ? K : never]?: T[K] }
  & { [K in keyof T as undefined extends T[K] ? never : K]: T[K] };

export type PropPrimitive =
  | boolean
  | number
  | bigint
  | string
  | Date
  | undefined;

export const renderChildren = (el: ParentNode, children: Children) =>
  el.replaceChildren(
    ...deepMap(children, (c) => {
      let node: Node;
      onChange(
        () => {
          node = (callOrReturn(c) ?? "") as Node;
          return node = node instanceof Node
            ? node
            : document_.createTextNode(node as string);
        },
        (current, prev) => el.replaceChild(current, prev),
      );
      return node!;
    }),
  );

export const css = (tpl: TemplateStringsArray): string => tpl[0];

const constructCSS = (
  css: string,
  styleSheet = new CSSStyleSheet_(),
) => (styleSheet.replace(css), styleSheet);

const attachShadow = (host: HTMLElement) => host.attachShadow({ mode: "open" });
