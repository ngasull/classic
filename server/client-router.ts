import { define, element, shadow } from "@classic/element";
import { render } from "@classic/element/jsx";
import {
  domParse,
  listen,
  preventDefault,
  querySelector,
  remove,
  replaceWith,
  timeout,
} from "@classic/util";
import { Idiomorph } from "idiomorph/dist/idiomorph.esm.js";

const { document, history, location, Promise } = globalThis;

const suspenseDelay = 500;

let currentNavigateQ: Promise<unknown> | 0;

const ccFrom = "cc-from";
const ccAction = "cc-action";
const ccRoute = "cc-route";
const fetchingClass = "cc-fetching";

const navigate = async (href: string) => {
  let url = new URL(href, location.origin),
    rootSlot = querySelector(ccRoute)!,
    slot = rootSlot,
    child: Element | null,
    pathAttr: string | null,
    currentFrom: string[] = [], // Contains dynamic routes too
    navigateQ: Promise<void | Document>,
    resQ: Promise<Document>,
    rootClassList = document.documentElement.classList;

  // Fallback to regular navigation if page defines no route
  if (!rootSlot) navigateFallback(href);

  if (location.href != href) {
    history.pushState(0, "", href);
  }

  while ((child = querySelector(ccRoute, slot))) {
    pathAttr = slot.getAttribute("path");
    if (!pathAttr) break;
    currentFrom.push(pathAttr);
    slot = child;
  }

  url.searchParams.set(ccFrom, currentFrom.join("/"));

  navigateQ = currentNavigateQ = Promise.race([
    timeout(suspenseDelay),
    resQ = Promise.resolve(
      fetch(url).then((res): Promise<Document> =>
        res.redirected
          ? Promise.reject(navigate(res.url))
          : res.text().then((html) =>
            currentNavigateQ == navigateQ ? domParse(html) : Promise.reject()
          )
      ),
    ).finally(() => {
      currentNavigateQ = 0;
      remove(rootClassList, fetchingClass);
    }),
  ]);

  if (!await navigateQ) rootClassList.add(fetchingClass);

  morph(document.documentElement, (await resQ).documentElement);
  // receivedSlot = querySelector(ccRoute, receivedDoc.body),
  // title = receivedDoc.title,
  // currentHead: Record<string, Element> = {},
  // i = 0,
  // seg: string;

  // if (!receivedSlot) navigateFallback(href);

  // // ! \\ `reqQ` needs to be awaited from here, so `resFrom` is available
  // // ! \\ If `resFrom` is null, it means SSG or cache result
  // slot = rootSlot;
  // for (seg of resFrom! ? resFrom.split("/") : []) {
  //   // We must already have all the layouts assumed by CC-From
  //   if (
  //     seg != currentFrom[i] ||
  //     !(slot = querySelector(ccRoute, slot)!)
  //   ) navigateFallback(href);
  //   i++;
  // }

  // if (!slot) navigateFallback(href);

  // if (title) document.title = title;

  // forEachSourceable(document.head, (el, key) => currentHead[key] = el);
  // forEachSourceable(
  //   receivedDoc.head,
  //   (el, key) => !currentHead[key] && document.head.append(adoptNode(el)),
  // );

  // replaceWith(slot, adoptNode(receivedSlot!));

  // // Scripts parsed with DOMParser are not marked to be run
  // forEach(
  //   querySelectorAll<HTMLScriptElement>("script", receivedSlot!),
  //   reviveScript,
  // );
};

const navigateFallback = (href: string) => {
  throw location.href = href;
};

// const forEachSourceable = (
//   head: HTMLHeadElement,
//   cb: (el: HTMLLinkElement | HTMLScriptElement, key: string) => void,
// ) =>
//   forEach(
//     querySelectorAll<HTMLLinkElement | HTMLScriptElement>(
//       `link,script`,
//       head,
//     ),
//     (el, tagName?: any) =>
//       cb(
//         el,
//         `${tagName = el.tagName}:${
//           tagName == "LINK"
//             ? (el as HTMLLinkElement).href
//             : (el as HTMLScriptElement).src
//         }`,
//       ),
//   );

const isLocal = (href: string) => {
  let origin = location.origin;
  return new URL(href, origin).origin == origin;
};

const submit = async (
  form: HTMLFormElement,
  action: string,
  body: FormData,
) => {
  let url = new URL(action, location.origin),
    resQ: Promise<Document | void>,
    receivedDoc: Document | void,
    formClassList = form.classList,
    contentLocation: string,
    res = await Promise.race([
      timeout(suspenseDelay).then(() => 0),
      resQ = Promise.resolve(
        fetch((url.searchParams.set("location", location.pathname), url), {
          method: "post",
          body,
        }).then((res): Promise<Document | void> =>
          res.redirected
            ? Promise.reject(submit(form, res.url, body))
            : res.text().then((html) => {
              contentLocation = res.headers.get("Content-Location") ??
                location.pathname;
              if (contentLocation) {
                if (contentLocation != location.pathname) {
                  history.pushState(0, "", contentLocation);
                }
                return domParse(html);
              }
            })
        ),
      ).finally(() => remove(formClassList, fetchingClass)),
    ]);

  if (res === 0) formClassList.add(fetchingClass);
  if ((receivedDoc = await resQ)) {
    morph(document.documentElement, receivedDoc.documentElement);
  }
};

const morph = (
  src: Node,
  target: Node,
): void =>
  Idiomorph.morph(src, target, {
    callbacks: {
      afterNodeAdded(node: Node) {
        let mode: string | null;
        if (
          (node as Element).tagName == "TEMPLATE" &&
          (mode = getShadowRootMode(node as HTMLTemplateElement))
        ) {
          if (!node.parentElement!.shadowRoot) {
            shadow(node.parentElement!, { mode: mode as ShadowRootMode })
              .append((node as HTMLTemplateElement).content);
          }
          (node as Element).remove();
        } else if ((node as Element).tagName == "SCRIPT") {
          reviveScript(node as HTMLScriptElement);
        }
      },
    },
  });

const reviveScript = (script: HTMLScriptElement) => {
  let copy = document.createElement("script");
  copy.text = script.text;
  replaceWith(script, copy);
};

/* `shadowRootMode` attribute isn't well-supported yet */
const getShadowRootMode = (template: HTMLTemplateElement) =>
  template.getAttribute("shadowrootmode")! as ShadowRootMode;

const initRoot = (target: EventTarget | null) => {
  if (target) {
    let t: EventTarget | null;
    listen(
      target,
      "click",
      (e) =>
        !e.ctrlKey &&
        !e.shiftKey &&
        (t = e.composedPath()[0]) instanceof HTMLAnchorElement &&
        isLocal(t.href) && (preventDefault(e), navigate(t.href)),
    );
  }
};

export const init = () => {
  initRoot(document.body);
  listen(window, "popstate", (_) => navigate(location.href));
};

define(
  ccRoute,
  element({
    defer: true,
    js(host) {
      if (!host.shadowRoot) {
        let template = host.querySelector<HTMLTemplateElement>(
          "template[shadowrootmode]",
        )!;
        render(
          shadow(host, { mode: getShadowRootMode(template) }),
          template.content,
        );
      }
      initRoot(shadow(host));
    },
  }),
);

define(
  ccAction,
  element({
    extends: "form",
    js(host) {
      let submitting = 0;
      listen(
        host,
        "submit",
        (e) => {
          let form = host as unknown as HTMLFormElement,
            submitter = e.submitter,
            action = submitter?.getAttribute("formaction") ?? form.action,
            data = new FormData(form, submitter);
          if (isLocal(action)) {
            preventDefault(e);
            if (form.method == "get") {
              navigate(
                // @ts-ignore TS bug: URLSearchParams accepts an Iterable<[string, string]> as per https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/URLSearchParams#options and FormData is one.
                action + "?" + new URLSearchParams(data),
              );
            } else if (!submitting) {
              submitting = 1;
              submit(form, action, data).finally(() => submitting = 0);
            }
          }
        },
      );
    },
  }),
);
