import { define, element } from "@classic/element";
import {
  adoptNode,
  domParse,
  forEach,
  listen,
  preventDefault,
  querySelector,
  querySelectorAll,
  remove,
  replaceWith,
} from "@classic/util";

const { document, location, Promise } = globalThis;

const suspenseDelay = 500;

let needsInit = true;
let currentNavigateQ: Promise<unknown> | 0;
let fetchCache: Record<string, Document | undefined> = {};

const ccPart = "c-part";
const fetchingClass = "fetching-parts";

const navigate = async (href: string) => {
  let url = new URL(href, location.origin),
    rootSlot = querySelector(ccPart)!,
    navigateQ: Promise<void | Document> | Document,
    resQ: Promise<Document>,
    rootClassList = document.documentElement.classList;

  // Fallback to regular navigation if page defines no route
  if (!rootSlot) navigateFallback(href);

  if (location.href != href) history.pushState(0, "", href);

  navigateQ = currentNavigateQ = Promise.race([
    new Promise<void>((resolve) => setTimeout(resolve, suspenseDelay)),
    resQ = Promise.resolve(
      fetchCache[url as any]?.cloneNode(true) as Document ??
        fetch(url).then((res): Promise<Document> =>
          res.redirected
            ? Promise.reject(navigate(res.url))
            : res.text().then((html) =>
              currentNavigateQ == navigateQ ? domParse(html) : Promise.reject()
            )
        ),
    ).finally(() => currentNavigateQ = 0),
  ]);

  if (!await navigateQ) rootClassList.add(fetchingClass);

  let receivedDoc = await resQ,
    didNotReplace = true,
    title = receivedDoc.title,
    receivedBody = receivedDoc.body,
    slot: PartElement,
    targetSlot: PartElement | null,
    name: string | null;

  // ! \\ `resQ` needs to be awaited from here
  remove(rootClassList, fetchingClass);

  if (title) document.title = title;

  for (slot of querySelectorAll<PartElement>(ccPart, receivedBody)) {
    if (
      (name = slot.name) &&
      slot.isConnected &&
      (targetSlot = querySelector(`${ccPart}[name=${JSON.stringify(name)}]`))
    ) {
      targetSlot.replaceWith(slot = adoptNode(slot));
      didNotReplace = false;

      // Scripts parsed with DOMParser are not marked to be run
      forEach(
        querySelectorAll<HTMLScriptElement>("script", slot!),
        reviveScript,
      );
    }
  }

  if (didNotReplace) navigateFallback(href);
};

const navigateFallback = (href: string) => {
  throw location.href = href;
};

const reviveScript = (script: HTMLScriptElement) => {
  let copy = document.createElement("script");
  copy.text = script.text;
  replaceWith(script, copy);
  // Prevents reviving multiple times
  remove(copy);
};

const isLocal = (href: string) => {
  let origin = location.origin;
  return new URL(href, origin).origin == origin;
};

type PartElement = HTMLElement & { name: string | null };

const PartClass = element({
  defer: true,
  js(dom) {
    let host = dom();
    let t: EventTarget | null;
    if (needsInit) {
      needsInit = false;
      listen(
        host,
        "click",
        (e) =>
          !e.ctrlKey &&
          !e.shiftKey &&
          (t = e.composedPath()[0]) instanceof HTMLAnchorElement &&
          isLocal(t.href) && (preventDefault(e), navigate(t.href)),
      );

      listen(
        host,
        "submit",
        (e) =>
          (t = e.composedPath()[0]) instanceof HTMLFormElement &&
          t.method == "get" &&
          !e.defaultPrevented &&
          isLocal(t.action) && (preventDefault(e), navigate(t.action)),
      );

      listen(window, "popstate", () => navigate(location.href));
    }
  },
});

define(ccPart, PartClass);
