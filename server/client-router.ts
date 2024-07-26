import { define, element } from "@classic/element";
import {
  adoptNode,
  call,
  domParse,
  forEach,
  listen,
  preventDefault,
  querySelector,
  querySelectorAll,
  remove,
  replaceWith,
  TRUE,
} from "@classic/util";

const { document, location, Promise } = globalThis;

const suspenseDelay = 500;

let currentNavigateQ: Promise<unknown> | 0;
let fetchCache: Record<string, Document | undefined> = {};

const ccRoute = "cc-route";
const fetchingClass = "cc-fetching";

const navigate = async (href: string) => {
  let url = new URL(href, location.origin),
    rootSlot = querySelector(ccRoute)!,
    slot = rootSlot,
    child: Element | null,
    pathAttr: string | null,
    currentFrom: string[] = [], // Contains dynamic routes too
    navigateQ: Promise<void | Document> | Document,
    resQ: Promise<Document>,
    resFrom: string | null,
    rootClassList = document.documentElement.classList;

  // Fallback to regular navigation if page defines no route
  if (!rootSlot) navigateFallback(href);

  while ((child = querySelector(ccRoute, slot))) {
    pathAttr = slot.getAttribute("path");
    if (!pathAttr) break;
    currentFrom.push(pathAttr);
    slot = child;
  }

  url.searchParams.set("cc-from", currentFrom.join("/"));

  navigateQ = currentNavigateQ = Promise.race([
    new Promise<void>((resolve) => setTimeout(resolve, suspenseDelay)),
    resQ = Promise.resolve(
      fetchCache[url as any]?.cloneNode(TRUE) as Document ??
        fetch(url).then((res): Promise<Document> =>
          res.redirected ? Promise.reject(navigate(res.url)) : (
            resFrom = res.headers.get("CC-From"),
              res.text().then((html) =>
                currentNavigateQ == navigateQ
                  ? domParse(html)
                  : Promise.reject()
              )
          )
        ),
    ).finally(() => currentNavigateQ = 0),
  ]);

  if (location.href != href) history.pushState(0, "", href);

  if (!await navigateQ) rootClassList.add(fetchingClass);

  let receivedDoc = await resQ,
    receivedSlot = querySelector(ccRoute, receivedDoc.body),
    title = receivedDoc.title,
    currentHead: Record<string, Element> = {},
    i = 0,
    seg: string;

  remove(rootClassList, fetchingClass);

  if (!receivedSlot) navigateFallback(href);

  // ! \\ `reqQ` needs to be awaited from here, so `resFrom` is available
  // ! \\ If `resFrom` is null, it means SSG or cache result
  slot = rootSlot;
  for (seg of resFrom! ? resFrom.split("/") : []) {
    // We must already have all the layouts assumed by CC-From
    if (
      seg != currentFrom[i] ||
      !(slot = querySelector(ccRoute, slot)!)
    ) navigateFallback(href);
    i++;
  }

  if (!slot) navigateFallback(href);

  if (title) document.title = title;

  forEachSourceable(document.head, (el, key) => currentHead[key] = el);
  forEachSourceable(
    receivedDoc.head,
    (el, key) => !currentHead[key] && document.head.append(adoptNode(el)),
  );

  replaceWith(slot, adoptNode(receivedSlot!));

  // Scripts parsed with DOMParser are not marked to be run
  forEach(
    querySelectorAll<HTMLScriptElement>("script", receivedSlot!),
    reviveScript,
  );
};

const navigateFallback = (href: string) => {
  throw location.href = href;
};

const forEachSourceable = (
  head: HTMLHeadElement,
  cb: (el: HTMLLinkElement | HTMLScriptElement, key: string) => void,
) =>
  forEach(
    querySelectorAll<HTMLLinkElement | HTMLScriptElement>(
      `link,script`,
      head,
    ),
    (el, tagName?: any) =>
      cb(
        el,
        `${tagName = el.tagName}:${
          tagName == "LINK"
            ? (el as HTMLLinkElement).href
            : (el as HTMLScriptElement).src
        }`,
      ),
  );

const reviveScript = (script: HTMLScriptElement) => {
  let copy = document.createElement("script");
  copy.text = script.text;
  replaceWith(script, copy);
};

const isLocal = (href: string) => {
  let origin = location.origin;
  return new URL(href, origin).origin == origin;
};

const initRoot = (target: EventTarget | null) => {
  if (target) {
    let t: EventTarget | null;
    listen(
      target,
      "click",
      (e) =>
        !e.ctrlKey &&
        !e.shiftKey &&
        (t = e.target) instanceof HTMLAnchorElement &&
        isLocal(t.href) && (preventDefault(e), navigate(t.href)),
    );

    listen(
      target,
      "submit",
      (e) =>
        (t = e.target) instanceof HTMLFormElement &&
        t.method == "get" &&
        !e.defaultPrevented &&
        isLocal(t.action) && (preventDefault(e), navigate(t.action)),
    );
  }
};

export const init = () => {
  initRoot(document.body);
  listen(window, "popstate", () => navigate(location.href));
};

define(
  ccRoute,
  element({
    defer: TRUE,
    js(dom) {
      initRoot(dom().shadowRoot);
    },
  }),
);
