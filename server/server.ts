import { voidElements } from "../dom/void.ts";
import {
  $type,
  Child,
  Children,
  GetConfig,
  JSXElementType,
} from "../element/jsx/jsx-runtime.ts";
import { FC, JSX, jsxAttr } from "./jsx-runtime.ts";

const $context = Symbol();

type Context = {
  [$context]: {
    readonly user: GetConfig<"context">;
  };
};

type JSXTemplateElement = {
  [$type]: [readonly string[], readonly Child[]];
};

const createRenderContext = (userContext: GetConfig<"context">): Context => ({
  [$context]: {
    user: userContext,
  },
});

type WriteOpts =
  & Omit<WriteState, "context">
  & (GetConfig<"context"> extends never ? { readonly context?: Context }
    : { readonly context: Context });

type WriteState = {
  // resolve?: (el: unknown) => `${string}-${string}` | null | undefined;
  context: Context;
};

export const renderToString = async (
  element: JSX.Element,
  { context = createRenderContext(null as never), ...opts }: WriteOpts =
    {} as WriteOpts,
): Promise<string> => {
  const buf: string[] = [];
  await jsxWrite(element, { context, ...opts }, (chunk) => buf.push(chunk));
  return buf.join("");
};

export const renderToStream = (
  element: JSX.Element,
  { context = createRenderContext(null as never), ...opts }: WriteOpts =
    {} as WriteOpts,
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoderStream();
  const writer = encoder.writable.getWriter();
  jsxWrite(element, { context, ...opts }, (chunk) => writer.write(chunk))
    .finally(() => writer.close());
  return encoder.readable;
};

const jsxWrite = async (
  jsxEl: JSX.Element,
  opts: WriteState,
  write: (chunk: string) => void,
): Promise<void> => {
  if (!jsxEl) return;

  const element = jsxEl as unknown as Record<string, unknown> & {
    [$type]:
      | JSXElementType[typeof $type]
      | JSXTemplateElement[typeof $type]
      | FC<Record<string, unknown>>;
    children?: Children;
  };
  const type = element[$type];

  if (Array.isArray(type)) {
    const [tpl, dynamic] = type;
    write(tpl[0]);
    for (let i = 0; i < dynamic.length; i++) {
      const a = dynamic[i];
      if (typeof a === "string") {
        write(a);
      } else {
        jsxWrite(a as unknown as JSX.Element, opts, write);
      }
      write(tpl[i + 1]);
    }
  } else if (typeof type === "string") {
    const { children, ...props } = element;

    if (type === "html") write("<!DOCTYPE html>");

    write(`<${type}`);

    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v != null) {
          write(" ");
          write(jsxAttr(k, v as string | number));
        }
      }
    }

    write(`>`);

    if (!voidElements.has(type)) {
      if (children) {
        const childrenArray = Array.isArray(children) ? children : [children];
        for (const c of childrenArray) {
          if (c != null) {
            if (typeof c === "string") {
              write(c);
            } else {
              jsxWrite(c, opts, write);
            }
          }
        }
      }

      write(`</${type}>`);
    }
  } else {
    let el = type(element, opts.context[$context] as never);
    el = el && "then" in (el as Promise<JSXElementType>)
      ? await el
      : el as JSXElementType;
    if (el) jsxWrite(el, opts, write);
    // } else {
    //   const { extends: extendsTag, style, propTypes, html } = type;

    //   const tag = opts.resolve?.(type);
    //   if (!tag) throw Error(`Custom element tag couldn't be resolved`);

    //   const { children, ...props } = element as unknown as GenericProps;

    //   (children as Child[]).unshift(
    //     jsxTemplate`<template shadowrootmode="open">${
    //       html(props, ssrHtmlOpts)
    //     }</template>`,
    //   );

    //   if (style && true) {
    //     (children as Child[]).unshift(
    //       jsxTemplate`<style>${jsxEscape(style)}</style>`,
    //     );
    //   }

    //   jsxWrite(
    //     jsx(extendsTag || tag as keyof JSX.IntrinsicElements, {
    //       ...Object.fromEntries(
    //         Object.entries(props).map(([k, v]) => [
    //           hyphenize(k),
    //           propTypes[k]?.[0](v),
    //         ]),
    //       ),
    //       is: extendsTag || undefined,
    //       children: children as readonly Child[],
    //     }),
    //     opts,
    //     write,
    //   );
  }
};

// export const folderElementResolution = async (
//   folder: string,
// ): Promise<Map<unknown, `${string}-${string}`>> => {
//   const entries: Promise<[unknown, `${string}-${string}`]>[] = [];

//   for await (const f of Deno.readDir(folder)) {
//     const path = join(folder, f.name);
//     const match = f.name.match(jsTsRegExp);

//     if (match && (await Deno.stat(path)).isFile) {
//       entries.push(
//         import(path).then((m) => {
//           if (!m.default) {
//             throw Error(
//               `File ${path} must have a default export as part custom elements folder`,
//             );
//           }
//           return [m.default, match[1] as `${string}-${string}`];
//         }),
//       );
//     }
//   }

//   return new Map(await Promise.all(entries));
// };

// const jsTsRegExp = /^(.+)\.[jt]sx?$/;
