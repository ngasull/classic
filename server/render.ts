import {
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
  type Resolver,
  toJS,
  unsafe,
} from "@classic/js";
import { type Context, createContext } from "./context.ts";
import { Key } from "./key.ts";
import {
  type DOMLiteral,
  type DOMNode,
  DOMNodeKind,
  ElementKind,
  type JSX,
  type JSXElement,
  type JSXRef,
} from "./types.ts";
import { voidElements } from "./void.ts";
import { expectedRefsArg, setIndicativeOrder } from "../js/js.ts";
import { type Activation, jsSymbol } from "../js/types.ts";

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
  escapeEscapes(text)
    .replaceAll("<", "&lt;")
    // Consecutive and first/last white spaces are ignored anyways and can mess with HTML streaming
    // ... But they mess with inline element spacing!
    // .replaceAll(/^\s+|\s+$/g, "")
    .replaceAll(/\s+/g, " ") ||
  zeroWidthSpaceHTML; // Empty would not be parsed as a text node

const commentEscapeRegExp = /--(#|>)/g;

const escapeComment = (comment: string) =>
  comment.replaceAll(commentEscapeRegExp, "--#$1");

export const escapeScriptContent = (node: DOMLiteral) =>
  String(node).replaceAll("</script", "</scr\\ipt");

const encoder = new TextEncoder();

export const render = (
  root: JSX.Element,
  opts: {
    context?: Context;
    resolve?: Resolver;
    doctype?: boolean;
  } = {},
): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const context = createContext(opts.context);
      if (!context.get($effects)) context.provide($effects, []);
      const effects = context.use($effects);
      const resolve = opts.resolve ?? context.get($resolve);

      const write = (chunk: Uint8Array) => controller.enqueue(chunk);
      const tree = domNodes(root, context);

      writeDOMTree(tree, { resolve, effects, write, ...opts }, true)
        .finally(() => {
          controller.close();
        });
    },
  });

export const $effects = new Key<JSable<void>[]>("effect");

export const $resolve = new Key<Resolver>("resolver");

const activate = async (
  refs: RefTree,
  opts: {
    resolve?: Resolver;
    effects: JSable<void>[];
    write: (chunk: Uint8Array) => void;
  },
): Promise<DOMNode | void> => {
  const { effects, resolve } = opts;
  if (effects.length) {
    if (!resolve) {
      effects.splice(0, effects.length);
      return console.error(
        `Can't attach JS to refs: no module resolver is provided`,
      );
    }

    let order = 0;
    const indicateRefs = (refs: RefTree) =>
      refs.forEach(([ref, subTree]) => {
        setIndicativeOrder(ref, order);
        if (subTree) indicateRefs(subTree);
      });
    indicateRefs(refs);

    const effectsFn = js`_=>{${
      effects.length > 1 ? effects.reduce((a, b) => js`${a};${b}`) : effects[0]
    }}`;
    const { js: activationScript, expectedRefs } = await toJS(
      () => [
        js`$.ownerDocument==d?setTimeout(${effectsFn}):d.addEventListener("patch",${effectsFn})`,
      ],
      { resolve },
    );

    const expectedRefsSet = new Set(expectedRefs);
    const filterRefs = (refs: RefTree): Activation =>
      refs.flatMap(([r, subRefs], i) => {
        const activation: Activation = [];
        if (expectedRefsSet.has(r[jsSymbol])) activation.push([i]);
        if (subRefs) {
          const subActivation = filterRefs(subRefs);
          if (subActivation.length) activation.push([i, subActivation]);
        }
        return activation;
      });

    // refsJS[jsSymbol],
    // "(",
    // this.currentScript,
    // ",",
    // this.refs.length.toString(),
    // ",",
    // JSON.stringify(this.#activateReferenced(this.refs)),
    // ")",

    effects.splice(0, effects.length);

    const s = new TextEncoderStream();
    const writer = s.writable.getWriter();
    writer.write(
      `{let d=document,$=d.currentScript,n=$,i=0,w=(n,a)=>a.flatMap(([c,s])=>{for(;i<c;i++)n=n.nextSibling;return s?w(n.firstChild,s):n}),${expectedRefsArg};for(;i<${refs.length};i++)n=n.previousSibling;i=0;${expectedRefsArg}=w(n,${
        JSON.stringify(filterRefs(refs))
      });(async()=>{${activationScript}})()}`,
    );
    writer.close();

    await writeDOMTree([{
      kind: DOMNodeKind.Tag,
      tag: "script",
      attributes: new Map(),
      children: [{
        kind: DOMNodeKind.HTMLNode,
        html: s.readable,
        ref: mkRef(),
      }],
      ref: mkRef(),
    }], opts);
  }
};

/*
Inline compact JS version of the following TS code:

const refs = (
  node: ChildNode,
  activatedLength: number,
  activation: Activation,
): readonly EventTarget[] => {
  for (i = 0; i < activatedLength; i++) node = node.previousSibling!;
  i = 0;
  return walkRefs(node, activation);
};

const walkRefs = (
  node: ChildNode,
  activation: Activation,
): readonly EventTarget[] =>
  activation.flatMap(([childIndex, sub]) => {
    for (; i! < childIndex; i!++) node = node.nextSibling!;
    return sub ? walkRefs(node.firstChild!, sub) : node;
  });
*/
// const refsJS: JS<
//   (
//     node: ChildNode,
//     activatedLength: number,
//     activation: Activation,
//   ) => readonly EventTarget[]
// > =
//   js`(n,l,a)=>{let i=0;for(;i<l;i++)n=n.previousSibling;i=0;let w=(n,a)=>a.flatMap(([c,s])=>{for(;i<c;i++)n=n.nextSibling;return s?w(n.firstChild,s):n});return w(n,a)}`;

const writeDOMTree = async (
  tree: Iterable<DOMNode> | AsyncIterable<DOMNode>,
  opts: {
    doctype?: boolean;
    resolve?: Resolver;
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
            // if (node.tag === "body") await activate([], opts);

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
  ctx: Context,
): AsyncIterable<DOMNode> {
  const node = nodeLike && "then" in nodeLike ? await nodeLike : nodeLike;
  if (!node) return;

  const effects = ctx.use($effects);

  switch (node.kind) {
    case ElementKind.Fragment: {
      for (const e of node.children) {
        yield* domNodes(e, ctx);
      }
      return;
    }

    case ElementKind.Component: {
      const { Component, props } = node;
      const subCtx = createContext(ctx);
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
  ctx: Context,
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

export const Effect: JSX.FC<{
  js: Fn<[], void | (() => void)>;
  uris?:
    | readonly string[]
    | JSable<readonly string[]>
    | readonly JSable<string>[];
}> = ({ js: cb, uris }, context) => {
  const ref = mkRef<Comment>();
  context.use($effects).push(cb());
  // context.use($effects).push(
  //   js.fn(() => {
  //     const effectJs = js.fn(cb);
  //     return client.sub(
  //       ref,
  //       effectJs,
  //       uris ? indexedUris(uris) : [],
  //     );
  //   })(),
  // );
  return {
    kind: ElementKind.Comment,
    text: "",
    ref,
  };
};
