import type { BuildContext } from "@classic/build";
import {
  client,
  type Fn,
  indexedUris,
  inline,
  isJSable,
  type JS,
  js,
  type JSable,
  jsResources,
  mkRef,
  type RefTree,
  toJS,
  unsafe,
} from "@classic/js";
import {
  contextSymbol,
  type DOMLiteral,
  type DOMNode,
  DOMNodeKind,
  ElementKind,
  type JSX,
  type JSXComponent,
  type JSXContext,
  type JSXContextAPI,
  type JSXContextInit,
  type JSXElement,
  type JSXRef,
} from "./types.ts";
import { voidElements } from "./void.ts";

const camelRegExp = /[A-Z]/g;

const hyphenize = (camel: string) =>
  camel.replace(
    camelRegExp,
    (l: string) => "-" + l.toLowerCase(),
  );

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

const encoder = new TextEncoder();

export const render = (
  root: JSXElement | PromiseLike<JSXElement>,
  opts: {
    context?: JSXContextInit<unknown>[] | JSXContextAPI;
    doctype?: boolean;
  } = {},
): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const { context } = opts;
      const ctx = initContext(context);

      if (!ctx.get($effects)) ctx.provide($effects, []);
      const effects = ctx($effects);
      const build = ctx.get($buildContext);

      const write = (chunk: Uint8Array) => controller.enqueue(chunk);
      const tree = domNodes(root, ctx);

      writeDOMTree(tree, { build, effects, write, ...opts }, true)
        .finally(() => {
          controller.close();
        });
    },
  });

export const createContext = <T>(name?: string): JSXContext<T> => {
  const $ = Symbol(name);
  const init = (value: T) => [$, value] as const;
  return { init, [contextSymbol]: $ };
};

type JSXContextInternal = JSXContextAPI & {
  [$contextData]: Map<symbol, unknown>;
};

export const initContext = (
  init?: JSXContextInit<unknown>[] | JSXContextAPI,
): JSXContextAPI => {
  if (init && !Array.isArray(init)) {
    const entries: JSXContextInit<unknown>[] = [
      ...(init as JSXContextInternal)[$contextData].entries(),
    ];
    return initContext(entries);
  }

  const use = <T, Args extends any[]>(
    context: JSXContext<T> | ((use: JSXContextAPI, ...args: Args) => T),
    ...args: Args
  ) => {
    if (typeof context === "function") {
      return context(ctx, ...args);
    } else {
      if (!use[$contextData].has(context[contextSymbol])) {
        throw new Error(
          `Looking up unset context ${
            context[contextSymbol].description ?? ""
          }`,
        );
      }
      return use[$contextData].get(context[contextSymbol]) as T;
    }
  };

  use[$contextData] = new Map<symbol, unknown>(init);
  const ctx = Object.assign(use, contextProto);

  return ctx;
};

const $contextData = Symbol("data");

const contextProto = {
  get<T>(context: JSXContext<T>) {
    return this[$contextData].get(context[contextSymbol]) as T;
  },

  provide<T>(context: JSXContext<T>, value: T) {
    this[$contextData].set(context[contextSymbol], value);
    return this;
  },
} satisfies ThisType<JSXContextInternal>;

export const $effects = createContext<JSable<void>[]>("effect");

export const $buildContext = createContext<BuildContext>("build context");

const activate = async (
  refs: RefTree,
  opts: {
    build?: BuildContext;
    effects: JSable<void>[];
    write: (chunk: Uint8Array) => void;
  },
): Promise<DOMNode | void> => {
  const { effects, build } = opts;
  if (effects.length) {
    if (!build) {
      effects.splice(0, effects.length);
      return console.error(
        `Can't attach JS to refs: no build context is provided`,
      );
    }

    const [activationScript] = await toJS(
      () => effects,
      { build, refs: refs.length ? ["$", refs] : true },
    );

    effects.splice(0, effects.length);

    await writeDOMTree([{
      kind: DOMNodeKind.Tag,
      tag: "script",
      attributes: new Map(),
      children: [{
        kind: DOMNodeKind.Text,
        text: refs.length
          ? `{const $=document.currentScript;setTimeout(async()=>{${activationScript}})}`
          : `(async()=>{${activationScript}})()`,
        ref: mkRef(),
      }],
      ref: mkRef(),
    }], opts);
  }
};

const writeDOMTree = async (
  tree: Iterable<DOMNode> | AsyncIterable<DOMNode>,
  opts: {
    doctype?: boolean;
    build?: BuildContext;
    effects: JSable<void>[];
    write: (chunk: Uint8Array) => void;
  },
  root?: boolean,
): Promise<RefTree> => {
  const { doctype, write } = opts;
  const writeStr = (chunk: string) => write(encoder.encode(chunk));
  const refs: RefTree = [];

  for await (const node of tree) {
    let childRefs: RefTree | null = null;

    switch (node.kind) {
      case DOMNodeKind.Comment: {
        if (node.text) {
          writeStr(`<!--`);
          writeStr(escapeComment(node.text));
          writeStr(`-->`);
        } else {
          writeStr(`<!>`);
        }
        break;
      }

      case DOMNodeKind.Tag: {
        if (
          root && (
            doctype === true ||
            (doctype == null && node.tag === "html")
          )
        ) {
          writeStr("<!DOCTYPE html>");
        }

        writeStr("<");
        writeStr(escapeTag(node.tag));

        for (const [name, value] of node.attributes) {
          if (value === false) continue;
          const valueStr = value === true ? "" : String(value);
          const escapedValue = escapeEscapes(valueStr).replaceAll("'", "&#39;");

          writeStr(" ");
          writeStr(escapeTag(name));
          if (escapedValue) {
            writeStr("=");
            if (/[\s>"]/.test(escapedValue)) {
              writeStr("'");
              writeStr(escapedValue);
              writeStr("'");
            } else {
              writeStr(escapedValue);
            }
          }
        }

        writeStr(">");

        if (!voidElements.has(node.tag)) {
          if (node.tag === "script") {
            const scriptChildren: DOMNode[] = [];
            for await (const c of node.children) {
              if (
                c.kind === DOMNodeKind.Text || c.kind === DOMNodeKind.HTMLNode
              ) {
                scriptChildren.push(c);
              } else {
                console.warn(`Ignoring <script>'s non-text child: ${c}`);
              }
            }
            await writeDOMTree(scriptChildren, opts);
          } else {
            // Write any global initializing effect that may use document.body
            if (node.tag === "body") await activate([], opts);

            childRefs = await writeDOMTree(node.children, opts);

            if (node.tag === "body") await activate(childRefs, opts);
          }

          writeStr("</");
          writeStr(node.tag);
          writeStr(">");
        }

        break;
      }

      case DOMNodeKind.Text: {
        writeStr(escapeTextNode(node.text));
        break;
      }

      case DOMNodeKind.HTMLNode: {
        const reader = node.html.getReader();
        while (true) {
          const res = await reader.read();
          if (res.done) break;
          write(res.value);
        }
        break;
      }
    }

    refs.push(childRefs?.length ? [node.ref, childRefs] : [node.ref]);
  }

  if (root) await activate(refs, opts);

  return refs;
};

const domNodes = async function* (
  nodeLike: JSX.Element,
  ctx: JSXContextAPI,
): AsyncIterable<DOMNode> {
  const node = nodeLike && "then" in nodeLike ? await nodeLike : nodeLike;
  if (!node) return;

  const effects = ctx($effects);

  switch (node.kind) {
    case ElementKind.Fragment: {
      for (const e of node.children) {
        yield* domNodes(e, ctx);
      }
      return;
    }

    case ElementKind.Component: {
      const { Component, props } = node;
      const subCtx = initContext(ctx);
      yield* domNodes(Component(props, subCtx), subCtx);
      return;
    }

    case ElementKind.Comment: {
      return yield {
        kind: DOMNodeKind.Comment,
        text: node.text,
        ref: node.ref,
      };
    }

    case ElementKind.Intrinsic: {
      const { tag, props: { ref, ...props } } = node;

      const attributes = new Map<string, string | number | boolean>();
      const reactiveAttributes: [
        string,
        JSable<string | number | boolean | null>,
      ][] = [];

      if (ref) {
        const refHook = (ref as unknown as JSXRef<Element>)(node.ref);
        if (refHook !== node.ref && isJSable<void>(refHook)) {
          effects.unshift(refHook);
        }
      }

      const propEntries = Object.entries(props);
      let entry;
      while ((entry = propEntries.shift())) {
        const [prop, value] = entry;
        const name = hyphenize(prop);
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
            const eventMatch = prop.match(eventPropRegExp);
            if (eventMatch) {
              effects.push(
                onEvent(node.ref, eventMatch[1].toLowerCase(), value),
              );
            } else if (isJSable<string | number | boolean | null>(value)) {
              await recordAttr(name, await js.eval(value));
              reactiveAttributes.push([name, value]);
            } else {
              attributes.set(name, value);
            }
          }
        })(name, value);
      }

      for (const [name, expr] of reactiveAttributes) {
        const uris = jsResources(expr);
        if (uris.length) {
          effects.push(subAttribute(uris, node.ref, name, () => inline(expr)));
        }
      }

      return yield {
        kind: DOMNodeKind.Tag,
        tag,
        attributes,
        children: disambiguateText(node.children, ctx),
        ref: node.ref,
      };
    }

    case ElementKind.JS: {
      const uris = jsResources(node.js);
      if (uris.length) {
        effects.push(
          js.fn(() =>
            subText(
              node.ref,
              () => inline(node.js),
              // js.comma(js.reassign(node.element, node.element), node.element),
              indexedUris(uris),
            )
          )(),
        );
      }
      return yield {
        kind: DOMNodeKind.Text,
        text: String(await js.eval(node.js) ?? ""),
        ref: node.ref,
      };
    }

    case ElementKind.Text: {
      return yield {
        kind: DOMNodeKind.Text,
        text: String(node.text),
        ref: node.ref,
      };
    }

    case ElementKind.HTMLNode: {
      return yield {
        kind: DOMNodeKind.HTMLNode,
        html: node.html,
        ref: node.ref,
      };
    }
  }

  throw Error(`Can't handle JSX node ${JSON.stringify(node)}`);
};

async function* disambiguateText(
  children: readonly JSXElement[],
  ctx: JSXContextAPI,
): AsyncIterable<DOMNode> {
  let prev: DOMNode | null = null;

  for (const child of children) {
    for await (const c of domNodes(child, ctx)) {
      if (
        prev && c.kind === DOMNodeKind.Text &&
        prev.kind === DOMNodeKind.Text
      ) {
        yield {
          kind: DOMNodeKind.Comment,
          text: "",
          ref: mkRef(),
        };
      }
      yield c;
      prev = c;
    }
  }
}

const onEvent = js.fn((
  target: JS<EventTarget>,
  type: JS<string>,
  cb: JS<(e: Event) => void>,
) => [
  js`let c=${cb}`,
  target.addEventListener(type, unsafe("c")),
  js`return ()=>${target.removeEventListener(type, unsafe("c"))}`,
]);

const subAttribute = js.fn((
  uris: JS<string[]>,
  target: JS<Element>,
  k: JS<string>,
  expr: JS<() => unknown>,
): JS<void> =>
  client.sub(
    target,
    () => {
      const v = expr();
      return js`!${v}&&${v}!==""?${target.removeAttribute(k)}:${
        target.setAttribute(k, js`${v}===true?"":String(${v})`)
      }`;
    },
    indexedUris(uris),
  )
);

const subText = js.fn((
  node: JS<Text>,
  value: JS<() => DOMLiteral>,
  uris: JS<readonly string[]>,
) =>
  js<
    () => void
  >`${client.sub}(${node},_=>${node}.textContent=${value}(),${uris})`
);

export const Effect: JSXComponent<{
  js: Fn<[], void | (() => void)>;
  uris?:
    | readonly string[]
    | JSable<readonly string[]>
    | readonly JSable<string>[];
}> = ({ js: cb, uris }, use) => {
  const ref = mkRef<Comment>();
  use($effects).push(
    js.fn(() => {
      const effectJs = js.fn(cb);
      return client.sub(
        ref,
        effectJs,
        uris ? indexedUris(uris) : [],
      );
    })(),
  );
  return {
    kind: ElementKind.Comment,
    text: "",
    ref,
  };
};

export const Html: JSXComponent<{
  contents: string | Uint8Array | ReadableStream<Uint8Array>;
}> = ({ contents }) => ({
  kind: ElementKind.HTMLNode,
  html: contents instanceof ReadableStream
    ? contents
    : new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          typeof contents === "string" ? encoder.encode(contents) : contents,
        );
        controller.close();
      },
    }),
  ref: mkRef(),
});
