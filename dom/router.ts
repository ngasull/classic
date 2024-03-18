import { cleanup, trackChildren } from "./lifecycle.ts";
import {
  adoptNode,
  call,
  customEvent,
  dataset,
  dispatchPrevented,
  doc,
  doMatch,
  forEach,
  forOf,
  head,
  newURL,
  parseHtml,
  preventDefault,
  Promise,
  querySelector,
  querySelectorAll,
  replaceWith,
  routeFormEvent,
  routeLoadEvent,
  startsWith,
  subEvent,
  submit,
  win,
} from "./util.ts";

const suspenseDelay = 500;
const routeAttr = "route";
const routeElSelector = `[data-${routeAttr}]`;
const routeIndexParam = "_index";
const routeLayoutParam = "_layout";

let routeRequests: Record<string, Promise<Document> | 0 | undefined> = {};

const findObsolete = (
  url: string,
  parent?: HTMLElement,
  path = "",
): [string[], HTMLElement] | null => {
  let routeEl = querySelector<HTMLElement>(routeElSelector, parent),
    subPath = routeEl ? path + dataset(routeEl)[routeAttr] : path;
  return routeEl
    ? startsWith(url, subPath) ? findObsolete(url, routeEl, subPath) : [
      startsWith(subPath, url)
        // Only index needed
        ? [url]
        // Subpaths starting from `path`
        : url
          .slice(path.length)
          .split("/")
          .map((_, i, arr) => path + arr.slice(0, i + 1).join("/")),
      routeEl,
    ]
    : parent
    ? [[url], parent] // No layout to replace; parent is the page to replace
    : routeEl;
};

const handleLocationChange = async () => {
  let { pathname, search } = location,
    obsolete = findObsolete(pathname);

  // Fallback to regular navigation if page defines no route
  if (!obsolete) return location.replace(pathname + search);

  let [missingPartials, slot] = obsolete,
    curSlot = slot as HTMLElement | null | undefined,
    searchParams = new URLSearchParams(search),
    resEls: Promise<Document>[],
    el: Document;

  searchParams.append(routeIndexParam, "");

  await Promise.race([
    new Promise<undefined>((resolve) => setTimeout(resolve, suspenseDelay)),
    Promise.all(
      resEls = missingPartials.map(
        (url, i, q: any) => (routeRequests[url] ||= q = fetch(
          `${url}?${
            i == missingPartials.length - 1 ? searchParams : routeLayoutParam
          }`,
        )
          .then((res) =>
            res.redirected ? Promise.reject(navigate(res.url)) : res.text()
          )
          .then((html) =>
            q == routeRequests[url] ? parseHtml(html) : Promise.reject()
          )
          .finally(() => (routeRequests[url] = 0))),
      ),
    ),
  ]);

  for await (el of resEls) {
    if (!(curSlot = processHtmlRoute(el, curSlot!))) break;
  }

  dispatchPrevented(slot, customEvent(routeLoadEvent));
};

const processHtmlRoute = (receivedDoc: Document, slot: HTMLElement) => {
  let handleResource =
      <A extends string>(el: HTMLElement & Record<A, string>, srcAttr: A) =>
      (tagName: string, src?: string) => {
        if (
          (src = el[srcAttr]) &&
          !querySelector(`${tagName}[${srcAttr}="${src}"]`, head)
        ) {
          head.append(adoptNode(el));
        }
      },
    receivedChildren = receivedDoc.body.children,
    children,
    content,
    script = 0 as Element | 0;

  children = [content = adoptNode(receivedChildren[0])];
  if (receivedChildren.length) {
    children.push(script = adoptNode(receivedChildren[0]));
  }

  forEach(
    querySelectorAll<HTMLTemplateElement>(`template[data-head]`, receivedDoc),
    (headEl) => {
      forOf(headEl.content.children, (el) =>
        doMatch(el.tagName, {
          TITLE() {
            doc.title = (el as HTMLTitleElement).text;
          },
          LINK: handleResource(el as HTMLLinkElement, "href"),
          SCRIPT: handleResource(el as HTMLScriptElement, "src"),
        }));
      headEl.remove();
    },
  );

  cleanup(slot);
  trackChildren(content);
  replaceWith(slot, ...children);

  // Scripts parsed with DOMParser are not marked to be run
  if (script) {
    reviveScript(script as HTMLScriptElement);
  }

  forEach(
    querySelectorAll<HTMLScriptElement>("script", content),
    reviveScript,
  );

  return querySelector<HTMLElement>(routeElSelector, content);
};

const reviveScript = (script: HTMLScriptElement) => {
  let copy = doc.createElement("script");
  copy.text = script.text;
  replaceWith(script, copy);
};

export const navigate = (path: string): boolean => {
  let origin = location.origin,
    url = newURL(path, origin),
    navigated = url.origin == origin;
  if (navigated) {
    history.pushState(0, "", url);
    handleLocationChange();
  }
  return navigated;
};

export const register = (root = doc.body): () => void => {
  let t: EventTarget | null,
    subs = [
      subEvent(
        root,
        "click",
        (e) =>
          !e.ctrlKey &&
          !e.shiftKey &&
          (t = e.target) instanceof HTMLAnchorElement &&
          navigate(t.href) &&
          preventDefault(e),
      ),

      subEvent(
        root,
        submit,
        (e) =>
          (t = e.target) instanceof HTMLFormElement &&
          t.method == "get" &&
          !dispatchPrevented(t, customEvent(routeFormEvent)) &&
          navigate(t.action) &&
          preventDefault(e),
      ),

      subEvent(win, "popstate", handleLocationChange),

      ...[...querySelectorAll(routeElSelector)]
        .map(trackChildren)
        .reverse(),
    ];

  return () => {
    routeRequests = {};
    subs.map(call);
  };
};
