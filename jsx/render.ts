import type { Activation, EffectAPI } from "../dom.ts";
import {
  clientArg,
  modulesArg,
  refsArg,
  resourcesArg,
} from "../dom/arg-alias.ts";
import { voidElements } from "../dom/void.ts";
import { fn, js, mkRef, statements, sync, toRawJS, unsafe } from "../js.ts";
import type { BundleResult } from "../js/bundle.ts";
import {
  isJSable,
  JS,
  JSable,
  JSFn,
  JSONable,
  JSReplacementKind,
  jsSymbol,
  JSWithBody,
  Resource,
} from "../js/types.ts";
import {
  contextSymbol,
  DOMLiteral,
  DOMNode,
  DOMNodeKind,
  ElementKind,
  JSXComponentAPI,
  JSXContext,
  JSXContextAPI,
  JSXContextOf,
  JSXElement,
  JSXInitContext,
  JSXRef,
} from "./types.ts";

const id = <T>(v: T) => v;

const eventPropRegExp = /^on([A-Z]\w+)$/;

// Only escape when necessary ; avoids inline JS like "a && b" to become "a &amp;&amp; b"
const escapesRegex = /&(#\d{2,4}|[A-z][A-z\d]+);/g;
const escapeEscapes = (value: string) =>
  value.replaceAll(escapesRegex, (_, code) => `&amp;${code};`);

const escapeTag = (tag: string) => tag.replaceAll(/[<>"'&]/g, "");

const zeroWidthSpaceHTML = "&#8203;";

const escapeTextNode = (text: string) =>
  escapeEscapes(text).replaceAll("<", "&lt;") || zeroWidthSpaceHTML; // Empty would not be parsed as a text node

const commentEscapeRegExp = /--(#|>)/g;

const escapeComment = (comment: string) =>
  comment.replaceAll(commentEscapeRegExp, "--#$1");

export const escapeScriptContent = (node: DOMLiteral) =>
  String(node).replaceAll("</script", "</scr\\ipt");

export const renderToString = async (
  root: JSXElement,
  { context }: { context?: JSXInitContext<unknown>[] } = {},
) => {
  const acc: string[] = [];
  const ctxData = subContext(undefined, context);
  ctxData.set(effectContext[contextSymbol], []);

  const bundle = mkContext(ctxData).get(bundleContext);
  const tree = await nodeToDOMTree(root, ctxData);
  const effects = await Promise.all(
    (ctxData.get(effectContext[contextSymbol]) as InferContext<
      typeof effectContext
    >)
      .map((effect) => sync(fn(effect))),
  );

  writeDOMTree(
    tree,
    (chunk) => acc.push(chunk),
    bundle
      ? ((partial) =>
        writeActivationScript((chunk) => acc.push(chunk), tree, effects, {
          bundle,
          partial,
        }))
      : null,
  );
  return acc.join("");
};

export const renderToStream = (
  root: JSXElement,
  { context }: { context?: JSXInitContext<unknown>[] },
) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const write = (chunk: string) =>
        controller.enqueue(encoder.encode(chunk));

      const ctxData = subContext(undefined, context);
      ctxData.set(effectContext[contextSymbol], []);

      const bundle = mkContext(ctxData).get(bundleContext);

      nodeToDOMTree(root, ctxData).then(async (tree) => {
        const effects = await Promise.all(
          (ctxData.get(effectContext[contextSymbol]) as InferContext<
            typeof effectContext
          >).map((effect) => sync(fn(effect))),
        );

        writeDOMTree(
          tree,
          write,
          bundle
            ? ((partial) =>
              writeActivationScript(write, tree, effects, { bundle, partial }))
            : null,
        );

        controller.close();
      });
    },
  });

type ContextData = Map<symbol, unknown>;

export type InferContext<C extends JSXContext<any>> = C extends
  JSXContext<infer T> ? T : never;

export const createContext = <T>(name?: string): JSXContext<T> => {
  const context = (value: T) => [context[contextSymbol], value] as const;
  context[contextSymbol] = Symbol(name);
  return context;
};

const subContext = (
  parent?: ContextData,
  added: JSXInitContext<unknown>[] = [],
): ContextData => {
  const sub = new Map(parent);
  for (const [k, v] of added) {
    sub.set(k, v);
  }
  return sub;
};

const mkContext = (data: ContextData): JSXContextAPI => {
  const ctx = <T>(context: JSXContext<T>) => {
    if (!data.has(context[contextSymbol])) {
      throw new Error(`Looking up unset context`);
    }
    return data.get(context[contextSymbol]) as T;
  };

  ctx.get = <T>(context: JSXContext<T>) =>
    data.get(context[contextSymbol]) as T;

  ctx.set = <T>(context: JSXContext<T>, value: T) => {
    data.set(context[contextSymbol], value);
    return ctx;
  };

  ctx.delete = (context: JSXContext<never>) => {
    data.delete(context[contextSymbol]);
    return ctx;
  };

  return ctx;
};

const effectContext = createContext<JSFn<[EffectAPI], void | (() => void)>[]>(
  "effect",
);

export const bundleContext = createContext<{
  readonly result: BundleResult;
  readonly watched?: boolean;
}>("bundle");

const writeActivationScript = (
  write: (chunk: string) => void,
  children: DOMNode[],
  effects: ReadonlyArray<JSWithBody<[EffectAPI], void | (() => void)>>,
  { bundle, partial = false }: {
    bundle: JSXContextOf<typeof bundleContext>;
    partial?: boolean;
  },
): void => {
  const domPath = bundle.result.publicPath(import.meta.resolve("../dom.ts"));
  if (!domPath) throw Error(`DOM lib is supposed to be bundled`);

  if (effects.length) {
    for (const effect of effects) {
      const { args } = effect[jsSymbol];

      // Rename first arg to `clientArg`
      if (args.length) {
        (args[0][jsSymbol].replacements[0].value as { name?: string }).name =
          clientArg;
      }
    }

    const effectsExpr = fn(
      (
        modules: JS<readonly string[]>,
        resources: JS<readonly [string, JSONable | undefined][]>,
        refs: JS<readonly EventTarget[]>,
        client: JS<EffectAPI>,
      ) => {
        (modules[jsSymbol].replacements[0].value as {
          name?: string;
        })
          .name = modulesArg;
        (resources[jsSymbol].replacements[0].value as { name?: string })
          .name = resourcesArg;
        (refs[jsSymbol].replacements[0].value as { name?: string })
          .name = refsArg;
        (client[jsSymbol].replacements[0].value as { name?: string })
          .name = clientArg;
        return js`${effects.map((effect) => fn(() => effect[jsSymbol].body))}`;
      },
    );

    let lastModuleIndex = -1;
    const modules = new Map<string, number>();
    const storeModule = (m: string) =>
      modules.get(m) ?? (modules.set(m, ++lastModuleIndex), lastModuleIndex);

    const usedRefs = new Set<JSable<EventTarget>>();
    for (const r of effectsExpr[jsSymbol].replacements) {
      if (r.kind === JSReplacementKind.Ref) usedRefs.add(r.value.expr);
    }

    const refs = new Map<JSable<EventTarget>, number>();
    let lastRefIndex = -1;
    const walkRef = (expr: JSable<EventTarget>) => {
      if (usedRefs.has(expr)) {
        refs.set(expr, ++lastRefIndex);
        return true;
      } else {
        return false;
      }
    };

    const ress = new Map<string, [number, [string, JSONable]]>();
    let lastResIndex = -1;
    const storeResource = ({ uri, value }: Resource<JSONable>) => {
      if (!ress.has(uri)) {
        if (typeof (value as PromiseLike<JSONable>)?.then === "function") {
          throw Error(
            `Resource values should have been awaited with \`sync\` at this point`,
          );
        }
        ress.set(uri, [++lastResIndex, [uri, value as JSONable]]);
        return lastResIndex;
      }
      return ress.get(uri)![0];
    };

    write("<script>");
    write(escapeScriptContent(toRawJS(
      js
        .promise(js<Promise<typeof import("../dom.ts")>>`import(${domPath})`)
        .then((dom) =>
          dom.a(
            domActivation(children, walkRef),
            unsafe(
              toRawJS(effectsExpr, {
                storeModule,
                storeResource,
                getRef: (expr) => refs.get(expr)!,
              }),
            ),
            [...modules.keys()].map((m) => {
              const publicPath = bundle.result.publicPath(m);
              if (!publicPath) {
                throw Error(`Module expected to be bundled: ${m}`);
              }
              return publicPath;
            }),
            [...ress.values()].map(([, entry]) => entry),
            partial
              ? js<[Node]>`[document.currentScript.previousSibling]`
              : js<NodeList>`document.childNodes`,
          )
        ),
    )));

    if (bundle.watched && !partial) {
      write(
        `;new EventSource("/hmr").addEventListener("change",()=>location.reload())`,
      );
    }

    if (partial) {
      write(`;document.currentScript.remove()`);
    }

    write("</script>");
  }
};

const domActivation = (
  dom: readonly DOMNode[],
  walkRef: (expr: JSable<EventTarget>) => boolean,
  parent: readonly number[] = [],
) => {
  const activation: Activation = [];

  for (let i = 0; i < dom.length; i++) {
    const { kind, node, ref } = dom[i];

    if (walkRef(ref)) activation.push([i]);

    if (kind === DOMNodeKind.Tag) {
      const childrenActivation = domActivation(
        node.children,
        walkRef,
        [...parent, i],
      );
      if (childrenActivation.length > 0) {
        activation.push([i, childrenActivation]);
      }
    }
  }

  return activation;
};

const writeDOMTree = (
  tree: readonly DOMNode[],
  write: (chunk: string) => void,
  writeRootActivation: ((partial?: boolean) => void) | null,
  root = true,
) => {
  const partialRoot = root && (tree.length !== 1 ||
    tree[0].kind !== DOMNodeKind.Tag || tree[0].node.tag !== "html");

  for (const { kind, node } of tree) {
    switch (kind) {
      case DOMNodeKind.Comment: {
        write(`<!--`);
        write(escapeComment(node));
        write(`-->`);
        break;
      }

      case DOMNodeKind.Tag: {
        if (partialRoot && node.tag !== "script") {
          write("<html><body>");
        }

        write("<");
        write(escapeTag(node.tag));

        for (const [name, value] of node.attributes) {
          if (value === false) continue;
          const valueStr = value === true ? "" : String(value);

          write(" ");
          write(escapeTag(name));
          write("=");
          const escapedValue = escapeEscapes(valueStr).replaceAll("'", "&#39;");
          if (!escapedValue || /[\s>"]/.test(escapedValue)) {
            write("'");
            write(escapedValue);
            write("'");
          } else {
            write(escapedValue);
          }
        }

        write(">");

        if (!(node.tag in voidElements)) {
          if (node.tag === "script") {
            for (const c of node.children) {
              if (c.kind === DOMNodeKind.Text) {
                write(escapeScriptContent(c.node.text));
              } else {
                console.warn(`<script> received non-text child: ${c}`);
              }
            }
          } else {
            writeDOMTree(node.children, write, writeRootActivation, false);

            if (!partialRoot && node.tag === "head") {
              writeRootActivation?.();
            }
          }

          write("</");
          write(node.tag);
          write(">");
        }

        if (partialRoot && node.tag !== "script") {
          writeRootActivation?.(true);
          write("</body></html>");
        }
        break;
      }

      case DOMNodeKind.Text: {
        write(escapeTextNode(node.text));
        break;
      }

      case DOMNodeKind.HTMLNode: {
        write(node.html);
        break;
      }
    }
  }
};

const nodeToDOMTree = async (
  node: JSXElement,
  ctxData: ContextData,
): Promise<DOMNode[]> => {
  const effects = ctxData.get(
    effectContext[contextSymbol],
  ) as InferContext<typeof effectContext>;

  switch (node.kind) {
    case ElementKind.Fragment: {
      return [
        { kind: DOMNodeKind.Comment, node: "", ref: node.ref },
        ...(await Promise
          .all(node.element.map((e) => nodeToDOMTree(e, ctxData)))
          .then((children) => children.flatMap(id))),
      ];
    }

    case ElementKind.Component: {
      const { Component, props } = node.element;
      const subCtxData = subContext(ctxData);
      const ctx = mkContext(subCtxData);
      const apiTarget: Partial<JSXComponentAPI> = { context: ctx };
      const api = new Proxy<JSXComponentAPI>(
        apiTarget as JSXComponentAPI,
        componentApiHandler,
      );
      const child = await Component(props, api);
      if (child) {
        apiTarget.target = child.ref;
        return nodeToDOMTree(child, subCtxData);
      } else {
        return [];
      }
    }

    case ElementKind.Comment: {
      return [{
        kind: DOMNodeKind.Comment,
        node: node.element,
        ref: node.ref,
      }];
    }

    case ElementKind.Intrinsic: {
      const { tag, props: { ref, ...props } } = node.element;

      const attributes = new Map<string, string | number | boolean>();
      const reactiveAttributes: [
        string,
        JSable<string | number | boolean | null>,
      ][] = [];

      if (ref) (ref as unknown as JSXRef<Element>)(node.ref);

      const propEntries = Object.entries(props);
      let entry;
      while ((entry = propEntries.shift())) {
        const [name, value] = entry;
        await (async function recordAttr(
          name: string,
          value:
            | string
            | number
            | boolean
            | null
            | undefined
            | JSable<string | number | boolean | null>,
        ) {
          if (value != null) {
            const eventMatch = name.match(eventPropRegExp);
            if (eventMatch) {
              const eventType = eventMatch[1].toLowerCase();
              effects.push(() => [
                js`let c=${value}`,
                node.ref.addEventListener(eventType, unsafe("c")),
                js`return ${
                  node.ref.removeEventListener(eventType, unsafe("c"))
                }`,
              ]);
            } else if (isJSable<string | number | boolean | null>(value)) {
              await recordAttr(name, await js.eval(value));
              reactiveAttributes.push([name, value]);
            } else {
              attributes.set(name, value);
            }
          }
        })(name, value);
      }

      effects.push(
        ...reactiveAttributes.flatMap(([name, expr]) => {
          const uris = uniqueURIs(expr);
          return uris.length
            ? [(client: JS<EffectAPI>) =>
              client.sub(
                node.ref,
                js`let k=${name},v=${expr};!v&&v!==""?${node.ref}.removeAttribute(k):${node.ref}.setAttribute(k,v===true?"":String(v))`,
                uris,
              )]
            : [];
        }),
      );

      const children = await Promise
        .all(
          node.element.children.map((child) => nodeToDOMTree(child, ctxData)),
        )
        .then((children) => children.flatMap(id));

      // Make sure we have no adjacent text nodes (would be parsed as only one)
      for (let i = children.length - 1; i > 0; i--) {
        if (
          children[i].kind === DOMNodeKind.Text &&
          children[i - 1].kind === DOMNodeKind.Text
        ) {
          children.splice(i, 0, {
            kind: DOMNodeKind.Comment,
            node: "",
            ref: mkRef(),
          });
        }
      }

      return [{
        kind: DOMNodeKind.Tag,
        node: { tag, attributes, children },
        ref: node.ref,
      }];
    }

    case ElementKind.JS: {
      const uris = uniqueURIs(node.element);
      if (uris.length) {
        effects.push(() =>
          js`${
            unsafe(clientArg)
          }.sub(${node.ref},_=>${node.ref}.textContent=${node.element},${uris})`
        );
      }
      return [{
        kind: DOMNodeKind.Text,
        node: { text: String(await js.eval(node.element) ?? "") },
        ref: node.ref,
      }];
    }

    case ElementKind.Text: {
      return [{
        kind: DOMNodeKind.Text,
        node: { text: String(node.element.text) },
        ref: node.ref,
      }];
    }

    case ElementKind.HTMLNode: {
      return [{
        kind: DOMNodeKind.HTMLNode,
        node: { html: node.element.html },
        ref: node.ref,
      }];
    }
  }

  throw Error(`Can't handle JSX node ${JSON.stringify(node)}`);
};

const uniqueURIs = (expr: JSable<unknown>): string[] => {
  const uris = new Set<string>();
  for (const r of expr[jsSymbol].replacements) {
    if (r.kind === JSReplacementKind.Resource) uris.add(r.value.uri);
  }
  return [...uris];
};

const componentApiHandler = {
  get: (target: any, k) =>
    target[k] ??= lazyComponentApi[k as keyof typeof lazyComponentApi]?.(
      target,
    ),
} satisfies ProxyHandler<JSXComponentAPI>;

const lazyComponentApi = {
  effect: (target: JSXComponentAPI) =>
  (
    cb: JSFn<[EffectAPI], void | (() => void)>,
    uris?:
      | readonly string[]
      | JSable<readonly string[]>
      | readonly JSable<string>[],
  ) => {
    componentApiHandler.get(target, "context");
    target.context(effectContext).push(
      (client) => {
        const effectJs = fn(cb);

        // Make `cb` transparently use `client` from parent scope
        if (effectJs[jsSymbol].args.length) {
          (effectJs[jsSymbol].args[0][jsSymbol].replacements[0].value as {
            name?: string;
          }).name = clientArg;
        }

        const subCb = Array.isArray(effectJs[jsSymbol].body)
          ? js<() => void | (() => void)>`_=>{${
            statements(effectJs[jsSymbol].body)
          }}`
          : js<() => void | (() => void)>`=>(${effectJs[jsSymbol].body})`;

        const subUris = uris ?? [
          ...new Set(
            effectJs[jsSymbol].replacements.flatMap((r) =>
              r.kind === JSReplacementKind.Resource ? r.value.uri : []
            ),
          ),
        ];

        return client.sub(target.target, subCb, subUris);
      },
    );
  },
};
