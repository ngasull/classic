import type { Activation } from "../dom.ts";
import { voidElements } from "../dom/void.ts";
import { effect, fn, js, statements, sync, unsafe } from "../js.ts";
import {
  isEvaluable,
  JS,
  JSable,
  JSONable,
  JSStatements,
  jsSymbol,
  ModuleMeta,
  Resource,
} from "../js/types.ts";
import { WebBundle } from "../js/web.ts";
import {
  contextSymbol,
  DOMNode,
  DOMNodeKind,
  ElementKind,
  SyncRef,
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

export const escapeScriptContent = (node: JSX.DOMLiteral) =>
  String(node).replaceAll("</script", "</scr\\ipt");

export const renderToString = async (
  root: JSX.Element,
  opts: { context?: JSX.InitContext<unknown>[]; bundle: WebBundle },
) => DOMTreeToString(await toDOMTree(root, opts.context), opts);

export const DOMTreeToString = (
  tree: DOMNode[],
  { bundle }: { bundle: WebBundle },
) => {
  const acc: string[] = [];
  writeDOMTree(
    tree,
    (chunk) => acc.push(chunk),
    (partial) =>
      writeActivationScript((chunk) => acc.push(chunk), tree, {
        domPath: bundle.lib.dom,
        partial,
      }),
  );
  return acc.join("");
};

export const renderToStream = (
  root: JSX.Element,
  { context, bundle }: {
    context?: JSX.InitContext<unknown>[];
    bundle: WebBundle;
  },
) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const write = (chunk: string) =>
        controller.enqueue(encoder.encode(chunk));

      toDOMTree(root, context).then((tree) => {
        writeDOMTree(tree, write, (partial) =>
          writeActivationScript(write, tree, {
            domPath: bundle.lib.dom,
            partial,
          }));
        controller.close();
      });
    },
  });

type ContextData = Map<symbol, unknown>;

export const createContext = <T>(name?: string) => {
  const context = ({
    init: (value: T) => [context[contextSymbol], value],
    [contextSymbol]: Symbol(name),
  }) as JSX.Context<T>;
  return context;
};

const subContext = (
  parent?: ContextData,
  added: JSX.InitContext<unknown>[] = [],
): ContextData => {
  const contexts = new Map(parent);
  for (const [c, v] of added) {
    contexts.set(c as unknown as symbol, v);
  }
  return contexts;
};

const contextAPIFromData = (data: ContextData) => {
  const ctx: JSX.ContextAPI = {
    get: <T>(context: JSX.Context<T>) => {
      if (!data.has(context[contextSymbol])) {
        throw new Error(`Looking up unset context`);
      }
      return data.get(context[contextSymbol]) as T;
    },
    getOrNull: <T>(context: JSX.Context<T>) =>
      data.get(context[contextSymbol]) as T | null,
    has: (context) => data.has(context[contextSymbol]),
    set: <T>(context: JSX.Context<T>, value: T) => (
      data.set(context[contextSymbol], value), ctx
    ),
    delete: <T>(context: JSX.Context<T>) => (
      data.delete(context[contextSymbol]), ctx
    ),
  };
  return ctx;
};

export const contextAPI = (context?: JSX.InitContext<unknown>[]) =>
  contextAPIFromData(subContext(undefined, context));

const writeActivationScript = (
  write: (chunk: string) => void,
  children: DOMNode[],
  { domPath, partial = false }: {
    domPath: string;
    partial?: boolean;
  },
) => {
  const [activation, modules, store] = deepActivation(children);
  if (activation.length) {
    write("<script>(p=>");
    write(
      js.import<typeof import("../dom.ts")>(domPath).then((dom) =>
        dom.a(
          activation,
          modules,
          store,
          js<NodeList | Node[]>`p`,
        )
      )[jsSymbol].rawJS,
    );
    write(")(");
    write(
      partial
        ? `[document.currentScript.previousSibling]`
        : `document.childNodes`,
    );
    write(")</script>");
  }
};

export const deepActivation = (
  root: DOMNode[],
): [Activation, string[], [string, JSONable][]] => {
  const modules: Record<string, 1> = {};
  const storeModule = ({ pub }: ModuleMeta) => {
    modules[pub] = 1;
  };

  const activationStore: Record<string, [number, JSONable]> = {};
  let storeIndex = 0;
  const store = ({ uri }: Resource<JSONable>, value: JSONable) => {
    activationStore[uri] ??= [storeIndex++, value];
    return activationStore[uri][0];
  };
  return [
    domActivation(root, storeModule, store),
    Object.keys(modules),
    Object.entries(activationStore).map(([uri, [, value]]) => [uri, value]),
  ];
};

const domActivation = (
  dom: DOMNode[],
  storeModule: (m: ModuleMeta) => void,
  store: (resource: Resource<JSONable>, value: JSONable) => number,
) => {
  const activation: Activation = [];

  for (let i = 0; i < dom.length; i++) {
    const { kind, node, refs = [] } = dom[i];
    for (const ref of refs) {
      for (const m of ref.fn[jsSymbol].modules) {
        storeModule(m);
      }

      const { body } = ref.fn[jsSymbol];
      activation.push([
        i,
        (Array.isArray(body)
          ? statements(body as JSStatements<unknown>)
          : body)[jsSymbol].rawJS,
        ...(ref.fn[jsSymbol].resources?.map((r, i) =>
          store(r, ref.values[i])
        ) ??
          []),
      ]);
    }
    if (kind === DOMNodeKind.Tag) {
      const childrenActivation = domActivation(
        node.children,
        storeModule,
        store,
      );
      if (childrenActivation.length > 0) {
        activation.push([i, childrenActivation]);
      }
    }
  }

  return activation;
};

export const writeDOMTree = (
  tree: DOMNode[],
  write: (chunk: string) => void,
  writeRootActivation: (partial?: boolean) => void,
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

        for (const [name, value] of Object.entries(node.attributes)) {
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
              writeRootActivation();
            }
          }

          write("</");
          write(node.tag);
          write(">");
        }

        if (partialRoot && node.tag !== "script") {
          writeRootActivation(true);
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

export const toDOMTree = (
  root: JSX.Element,
  context: JSX.InitContext<unknown>[] = [],
): Promise<DOMNode[]> => nodeToDOMTree(root, subContext(undefined, context));

const nodeToDOMTree = async (
  root: JSX.Element,
  ctxData: ContextData,
): Promise<DOMNode[]> => {
  const syncRoot = await root;

  if (Array.isArray(syncRoot)) {
    const children = await Promise
      .all(syncRoot.map((child) => nodeToDOMTree(child, ctxData)))
      .then((children) => children.flatMap(id));

    // Make sure we have no adjacent text nodes (would be parsed as only one)
    for (let i = children.length - 1; i > 0; i--) {
      if (
        children[i].kind === DOMNodeKind.Text &&
        children[i - 1].kind === DOMNodeKind.Text
      ) {
        children.splice(i, 0, { kind: DOMNodeKind.Comment, node: "" });
      }
    }

    return children;
  }

  switch (syncRoot.kind) {
    case ElementKind.Component: {
      const { Component, props } = syncRoot.element;
      const subCtxData = subContext(ctxData);
      return nodeToDOMTree(
        Component(props, contextAPIFromData(subCtxData)),
        subCtxData,
      );
    }

    case ElementKind.Comment: {
      return [{ kind: DOMNodeKind.Comment, node: syncRoot.element }];
    }

    case ElementKind.Intrinsic: {
      const {
        tag,
        props: { ref, ...props },
        children,
      } = syncRoot.element;

      const attributes: Record<string, string | number | boolean> = {};
      const reactiveAttributes: [
        string,
        JSable<string | number | boolean | null>,
      ][] = [];
      const refs: SyncRef<Element>[] = ref
        ? [
          await sync(
            fn((elRef: JS<Element>) =>
              (ref as unknown as JSX.Ref<Element>)(elRef) as JSable<void>
            ),
          ),
        ]
        : [];

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
              refs.push(
                await sync(fn((elRef: JS<Element>) =>
                  effect(() => [
                    js`let c=${value}`,
                    elRef.addEventListener(eventType, unsafe("c")),
                    js.return(() =>
                      elRef.removeEventListener(eventType, unsafe("c"))
                    ),
                  ])
                )),
              );
            } else if (isEvaluable<string | number | boolean | null>(value)) {
              await recordAttr(name, await js.eval(value));
              reactiveAttributes.push([name, value]);
            } else {
              attributes[name] = value;
            }
          }
        })(name, value);
      }

      refs.push(
        ...(await Promise.all(
          reactiveAttributes.map(([name, reactive]) =>
            sync(
              fn((node: JS<Element>) =>
                effect(() =>
                  js`let k=${name},v=${reactive};!v&&v!==""?${node}.removeAttribute(k):${node}.setAttribute(k,v===true?"":String(v))`
                )
              ),
            )
          ),
        )),
      );

      return [
        {
          kind: DOMNodeKind.Tag,
          node: {
            tag: tag,
            attributes,
            children: await nodeToDOMTree(children, ctxData),
          },
          refs,
        },
      ];
    }

    case ElementKind.JS: {
      return [
        {
          kind: DOMNodeKind.Text,
          node: {
            text: String(await js.eval(syncRoot.element)),
          },
          refs: [
            await sync(
              fn((node: JS<Text>) =>
                effect(() => js`${node}.textContent=${(syncRoot.element)}`)
              ),
            ),
          ],
        },
      ];
    }

    case ElementKind.Text: {
      return [
        {
          kind: DOMNodeKind.Text,
          node: { text: String(syncRoot.element.text) },
          refs: syncRoot.element.ref
            ? [
              await sync(
                fn((ref) => syncRoot.element.ref!(ref) as JSable<void>),
              ),
            ]
            : [],
        },
      ];
    }

    case ElementKind.HTMLNode: {
      return [
        {
          kind: DOMNodeKind.HTMLNode,
          node: { html: syncRoot.element.html },
          refs: syncRoot.element.ref
            ? [
              await sync(
                fn((ref) => syncRoot.element.ref!(ref) as JSable<void>),
              ),
            ]
            : [],
        },
      ];
    }
  }

  throw Error(`Can't handle JSX node ${JSON.stringify(syncRoot)}`);
};
