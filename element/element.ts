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
  listen,
} from "@classic/util";
import { type Signal, signal } from "./signal.ts";
import type { PropType } from "./props.ts";

const { CSSStyleSheet: CSSStyleSheet_, document: document_, Symbol: Symbol_ } =
  globalThis;

const $adoptCallbacks: unique symbol = Symbol_() as never;
const $disconnectCallbacks: unique symbol = Symbol_() as never;
export const $extends: unique symbol = Symbol_() as never;
const $signals: unique symbol = Symbol_() as never;
const $setUp: unique symbol = Symbol_() as never;

export type CustomElement<
  Props extends Record<string, unknown> = Record<never, never>,
  Ref extends HTMLElement = HTMLElement,
> = {
  tag: string;
  readonly [$extends]?: string;
  new (): Ref & {
    readonly [$signals]: Signals<Props>;
  };
};

type TypedHost<Public> =
  & Public
  & HTMLElement
  & {
    readonly [$adoptCallbacks]: Array<() => void>;
    readonly [$disconnectCallbacks]: Array<() => void>;
    readonly [$setUp]: boolean;
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

type Signals<Props> = { [K in keyof Props]: Signal<Props[K]> };

/** Options for {@linkcode element} */
export interface ElementOptions<
  PropTypes extends Record<string, PropType<unknown>>,
  Def extends (host: TypedHost<Props>) => unknown,
  Props extends { [P in keyof PropTypes]: ReturnType<PropTypes[P]> },
> {
  /**
   * Props definition, layering on top of attributes to manage them.
   * Attributes can natively be managed by custom elements but can only be optional strings.
   */
  props?: PropTypes;

  /** Native element tag to extend */
  extends?: string;

  /** Generated class decorator for advanced uses */
  class?: (clazz: { new (): HTMLElement }) => void;

  /** Style(s) baked in the element */
  css?: string | CSSStyleSheet | (string | CSSStyleSheet)[];

  /** JavaScript logic to run on element connection */
  js?: Def;

  /** Whether to connect after the document is ready */
  defer?: boolean;

  /** Whether the element is a field (enables `formAssociated`, for use along [`attachInternals()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/attachInternals)) */
  field?: boolean;
}

/**
 * Define a custom element class using a declarative and code size efficient API
 *
 * @params opts Options as in {@linkcode ElementOptions}
 * @returns Custom element-defining class
 */
export const element = <
  PropTypes extends Record<string, PropType<unknown>>,
  Def extends (host: TypedHost<Props>) => unknown,
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
    field,
  }: Readonly<ElementOptions<PropTypes, Def, Props>>,
): CustomElement<Props, Ref> => {
  let definedStyleSheets: CSSStyleSheet[] | undefined;
  let attrToProp: Record<string, keyof Props> = {};
  let propToAttr = {} as Record<keyof Props, string>;
  let Parent =
    (extendsTag
      ? document.createElement(extendsTag).constructor
      : HTMLElement) as typeof HTMLElement;

  class ElementClass extends Parent {
    [$signals]: Signals<Props> = fromEntries(
      entries(propTypes).map(([prop, type]) => [
        prop,
        signal(() => type(this.getAttribute(hyphenize(prop)))),
      ]),
    ) as never;
    static [$extends] = extendsTag;
    [$adoptCallbacks]: Array<() => void> = [];
    [$disconnectCallbacks]: Array<() => void> = [];
    [$setUp]?: boolean;
    static observedAttributes: string[];
    static formAssociated = field;

    connectedCallback() {
      if (defer && document_.readyState == "loading") {
        listen(document_, "DOMContentLoaded", () => this.connectedCallback());
      } else {
        let THIS = this as this & TypedHost<Props>;
        let api = js?.(THIS);
        THIS[$setUp] = true;

        if (api) {
          defineProperties(THIS, getOwnPropertyDescriptors(api));
        }

        if (css) {
          shadow(THIS).adoptedStyleSheets.push(
            ...definedStyleSheets ??= deepMap(
              css,
              (v) => v instanceof CSSStyleSheet_ ? v : constructCSS(v),
            ),
          );
        }
      }
    }

    adoptedCallback() {
      this[$adoptCallbacks].map(call);
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
      if (prop) {
        (this as any)[prop] = propTypes[prop as keyof PropTypes](
          next,
        ) as Props[typeof prop];
      }
    }
  }

  let proto = ElementClass.prototype;

  for (let prop of keys(propTypes) as (keyof Props & string)[]) {
    if (!(prop in proto)) {
      let attr = hyphenize(prop);
      attrToProp[attr] = prop;
      propToAttr[prop] = attr;
      defineProperty(proto, prop, {
        get() {
          return this[$signals][prop][0]();
        },
        set(value) {
          this[$signals][prop][1](value);
        },
      });
    }
  }

  ElementClass.observedAttributes = keys(attrToProp);

  decorateClass?.(ElementClass);

  return ElementClass as unknown as CustomElement<Props, Ref>;
};

/**
 * Register a custom element in current window
 *
 * @param name Element name ([must be valid](https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name))
 * @param ElementClass Element-defining class (see {@linkcode element})
 */
export const define = <
  Props extends Record<string, unknown>,
  Ref extends HTMLElement,
>(
  name: `${string}-${string}`,
  ElementClass: CustomElement<Props, Ref>,
): void => {
  ElementClass.tag = name;
  ElementClass.prototype && customElements.define(name, ElementClass, {
    extends: ElementClass[$extends],
  });
};

/**
 * Add an adoption callback to configured element
 *
 * @param host Configured element
 * @param cb Adoption callback
 */
export const onAdopt = (
  host: TypedHost<unknown>,
  cb: () => void,
): void => {
  !host[$setUp] && host[$adoptCallbacks].push(cb);
};

/**
 * Add a disconnection callback to configured element
 *
 * @param host Configured element
 * @param cb Disconnected callback
 */
export const onDisconnect = (
  host: TypedHost<unknown>,
  cb: () => void,
): void => {
  !host[$setUp] && host[$disconnectCallbacks].push(cb);
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

/** Template strings that returns as-is - used to write and spot CSS in-js */
export const css = (tpl: TemplateStringsArray): string => tpl[0];

const constructCSS = (
  css: string,
  styleSheet = new CSSStyleSheet_(),
) => (styleSheet.replace(css), styleSheet);

/**
 * Attach a shadow root to configured element (open by default)
 *
 * @param host Configured element
 * @param opts Options, see {@linkcode ShadowRootInit}
 */
export const shadow = (
  host: Element,
  opts: ShadowRootInit = { mode: "open" },
): ShadowRoot => host.shadowRoot ?? host.attachShadow(opts);
