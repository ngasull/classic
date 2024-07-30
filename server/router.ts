import type { AppBuild } from "@classic/build";
import { js, type JSable } from "@classic/js";
import { accepts } from "@std/http";
import { Fragment, jsx } from "./jsx-runtime.ts";
import {
  $effects,
  $served,
  createContext,
  Html,
  initContext,
  render,
} from "./render.ts";
import type {
  JSX,
  JSXComponent,
  JSXContextAPI,
  JSXContextInit,
} from "./types.ts";

export const $build = createContext<AppBuild>();

type SubSegment<Params extends string, P extends string> = Segment<
  Params,
  Params | (P extends `:${infer Param}` ? Param : never),
  never
>;

type CSSTemplate = (tpl: TemplateStringsArray) => string;

let encoder: TextEncoder | null = null;

const css: CSSTemplate = (tpl, ...args) => {
  if (args.length) {
    throw Error(
      `Don't do replacements in CSS template as it prevents minification`,
    );
  }
  encoder ??= new TextEncoder();
  return tpl[0];
};

type LayoutComponent<Params extends string> = JSXComponent<
  { [P in Params]: string } & { readonly children?: JSX.Element }
>;

type PartComponent<Params extends string> = JSXComponent<
  { [P in Params]: string }
>;

type Action<PC extends PartComponent<string>> = unknown;

type RoutedRequest<Params extends string> = {
  readonly req: Request;
  readonly params: { [P in Params]: string };
  readonly use: JSXContextAPI;
};

type Handler<Params extends string> = (
  req: RoutedRequest<Params>,
) => JSX.Element | Response | void | PromiseLike<JSX.Element | Response | void>;

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const router = (): Router => new Router();

export const route = <T extends string = never>(): Segment<T, T, undefined> =>
  new Segment();

export type { Router, Segment };

class Segment<
  ParentParams extends Params,
  Params extends string,
  PComponent extends PartComponent<Params> | undefined,
> {
  #style?: string | Promise<Uint8Array>;
  #userStyle?: string | ((css: CSSTemplate) => string | Promise<Uint8Array>);
  #Layout?: LayoutComponent<ParentParams>;
  #Part?: PComponent;
  #Action?: PComponent extends PartComponent<Params> ? Action<PComponent>
    : never;
  #apiHandlers: Map<Method, Handler<Params>> = new Map();

  #segments: {
    [P in string]: (
      | SubSegment<Params, P>
      | ((segment: SubSegment<Params, P>) => PromiseLike<SubSegment<Params, P>>)
    )[];
  } = {};
  #param?: string;

  route<P extends string>(
    segment: P,
    sub:
      | SubSegment<Params, P>
      | (
        (segment: SubSegment<Params, P>) =>
          | SubSegment<Params, P>
          | PromiseLike<
            SubSegment<Params, P> | { readonly default: SubSegment<Params, P> }
          >
      ),
  ): Segment<ParentParams, Params, PComponent> {
    if (!segment) throw Error(`Route segment name can't be empty`);

    const subs = this.#segments[segment] ??= [];
    subs.push(
      // @ts-ignore dynamism is protected by `segment` signature
      sub instanceof Segment ? sub : async (segment: SubSegment<Params, P>) => {
        const res = await sub(segment);
        return res instanceof Segment ? res : res.default;
      },
    );

    const wildMatch = segment.match(wildcardRegExp);
    if (wildMatch) {
      if (this.#param) {
        throw Error(
          `The same segment doesn't allow multiple wildcard sub-routes`,
        );
      }
      this.#param = wildMatch[1] ?? "*";
    }

    return this;
  }

  style(
    path: string | ((css: CSSTemplate) => string | Promise<Uint8Array>),
  ): this;
  style(): string | Promise<Uint8Array> | undefined;
  style(
    path?: string | ((css: CSSTemplate) => string | Promise<Uint8Array>),
  ): unknown {
    if (!path) {
      return this.#style ??= typeof this.#userStyle === "string"
        ? Deno.readFile(this.#userStyle)
        : this.#userStyle?.(css);
    }
    if (this.#userStyle) throw Error(`style is already set`);
    this.#userStyle = path;
    return this;
  }

  layout(Layout: LayoutComponent<ParentParams>): this;
  layout(): LayoutComponent<ParentParams> | undefined;
  layout(Layout?: LayoutComponent<ParentParams>) {
    if (!Layout) return this.#Layout;
    if (this.#Layout) throw Error(`Layout is already set`);
    this.#Layout = Layout;
    return this;
  }

  part<PC extends PartComponent<Params>>(
    Part: PC,
  ): Segment<ParentParams, Params, PC>;
  part(): PComponent;
  part(Part?: PartComponent<Params>) {
    if (!Part) return this.#Part;
    if (this.#Part) throw Error(`Part is already set`);
    this.#Part = Part as PComponent;
    return this as Segment<ParentParams, Params, PartComponent<Params>>;
  }

  action(
    Action: PComponent extends PartComponent<Params> ? Action<PComponent>
      : never,
  ): PComponent extends PartComponent<Params> ? this : never;
  action(): PComponent extends PartComponent<Params>
    ? Action<PComponent> | undefined
    : never;
  action(
    Action?: PComponent extends PartComponent<Params> ? Action<PComponent>
      : never,
  ) {
    if (!Action) return this.#Action;
    if (this.#Action) throw Error(`Action is already set`);
    this.#Action = Action;
    return this;
  }

  api<H extends Handler<Params> | undefined>(
    method: Method,
    handler?: H,
  ): undefined extends H ? Handler<Params> | undefined : this {
    if (!handler) return this.#apiHandlers.get(method) as any;
    if (this.#apiHandlers.has(method)) throw Error(`${method} is already set`);
    this.#apiHandlers.set(method, handler);
    return this as any;
  }

  protected async matchRoutes(
    [candidate, ...nextSegments]: string[],
    parentSegment: string = "",
    parentParams: Record<ParentParams, string> = {} as Record<
      ParentParams,
      string
    >,
    params: Record<Params, string> = parentParams as Record<Params, string>,
  ): Promise<
    | void
    | (readonly [
      Segment<ParentParams, Params, PComponent>,
      string,
      Record<ParentParams, string>,
      Record<Params, string>,
    ])[]
  > {
    if (candidate) {
      if (this.#segments[candidate]) {
        let i = -1;
        for (let subRouter of this.#segments[candidate]) {
          i++;
          if (!(subRouter instanceof Segment)) {
            subRouter = await subRouter(new Segment());
            this.#segments[candidate][i] = subRouter;
          }

          const match = await subRouter.matchRoutes(
            nextSegments,
            candidate,
            params,
            params,
          );
          if (match) {
            match.unshift([this, parentSegment, parentParams, params]);
            return match;
          }
        }
      }

      if (this.#param) {
        const wildcard = this.#param === "*" ? this.#param : `:${this.#param}`;
        const nextParams = { ...params, [this.#param]: candidate };
        let i = -1;
        for (let subRouter of this.#segments[wildcard]) {
          i++;
          if (!(subRouter instanceof Segment)) {
            subRouter = await subRouter(new Segment());
            this.#segments[wildcard][i] = subRouter;
          }

          const match = await subRouter.matchRoutes(
            nextSegments,
            wildcard,
            params,
            nextParams,
          );
          if (match) {
            match.unshift([this, parentSegment, parentParams, params]);
            return match;
          }
        }
      }
    } else {
      return [[this, parentSegment, parentParams, params]];
    }
  }
}

class Router extends Segment<never, never, undefined> {
  async fetch(
    req: Request,
    { context, build }: {
      context?: JSXContextInit<unknown>[] | JSXContextAPI | undefined;
      build: AppBuild;
    },
  ): Promise<Response | void> {
    const moduleRes = build.deferred.fetch(req);
    if (moduleRes) return moduleRes;

    const isGET = req.method === "GET";
    const reqAccepts = accepts(req);
    const { pathname, searchParams } = new URL(req.url);

    if (build.dev && pathname === "/.hmr") {
      let cancel: () => void;
      return new Response(
        new ReadableStream<string>({
          start(controller) {
            cancel = build.deferred.watch(() => {
              controller.enqueue(`event: change\r\n\r\n`);
            });
          },
          cancel() {
            cancel();
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }

    const use = initContext(context);
    use.provide($initResponse, {});
    use.provide($build, build);
    use.provide($served, build.deferred);

    const segments = pathname === "/" ? [] : pathname.slice(1).split("/");

    const layouts = await this.matchRoutes(segments);
    if (!layouts) return;
    const [lastSegment, , , partParams] = layouts[layouts.length - 1];

    const reqFrom = isGET && searchParams.get("cc-from")?.split("/");
    const acceptsHtml = isGET && reqAccepts.includes("text/html");

    if (reqFrom || acceptsHtml) {
      const part = jsx(lastSegment.part() ?? NotFound, partParams);

      let resFromIndex = 0;
      if (reqFrom) {
        for (
          ;
          resFromIndex < reqFrom.length &&
          resFromIndex + 1 < layouts.length &&
          reqFrom[resFromIndex] === layouts[resFromIndex + 1][1];
          resFromIndex++
        );
      }

      const segments = reqFrom ? layouts.slice(resFromIndex + 1) : layouts;
      let stream = render(
        jsx("cc-route", {
          children: jsx("template", {
            shadowrootmode: "open",
            children: [
              build.globalCss
                ? jsx("link", { rel: "stylesheet", href: build.globalCss })
                : null,
              jsx(Html, {
                contents: render(part, { context: initContext(use) }),
              }),
            ],
          }),
        }),
      );

      for (let i = segments.length - 1; i >= 0; i--) {
        const [segment, path, layoutParams] = segments[i];
        const laidout = jsx(segment.layout() ?? Fragment, {
          ...layoutParams,
          children: jsx(Html, { contents: stream }),
        });

        const context = initContext(use);
        if (i === 0 && !reqFrom) {
          context.provide($effects, [
            js.module<typeof import("./client-router.ts")>(
              "@classic/server/client/router",
            ).init() as JSable<void>,
          ]);
        }

        stream = render(
          path
            ? reqFrom && i === 0
              ? jsx("html", {
                children: jsx("body", {
                  children: layout(
                    build,
                    path,
                    layoutParams,
                    segment.layout(),
                    stream,
                  ),
                }),
              })
              : layout(build, path, layoutParams, segment.layout(), stream)
            : laidout,
          { context },
        );
      }

      const { status, headers = {} } = use($initResponse);
      headers["Content-Type"] = "text/html; charset=UTF-8";
      if (reqFrom) {
        headers["CC-From"] = reqFrom.slice(0, resFromIndex).join("/");
      }

      return new Response(stream, { status, headers });
    } else {
      const lastSegmentHandler = lastSegment.api(req.method as Method);
      const handlerRes = lastSegmentHandler && await lastSegmentHandler({
        req,
        params: partParams,
        use,
      });

      if (handlerRes) {
        if (handlerRes instanceof Response) {
          return handlerRes;
        }
      }
    }
  }
}

const layout = <Params extends string>(
  build: AppBuild,
  path: string | undefined,
  params: Record<Params, string>,
  Layout: LayoutComponent<Params> = Fragment,
  stream: ReadableStream<Uint8Array>,
) =>
  jsx("cc-route", {
    path,
    children: [
      jsx("template", {
        shadowrootmode: "open",
        children: [
          build.globalCss
            ? jsx("link", { rel: "stylesheet", href: build.globalCss })
            : null,
          jsx(Layout, { ...params, children: jsx("slot") }),
        ],
      }),
      jsx(Html, { contents: stream }),
    ],
  });

const $initResponse = createContext<{
  status?: number;
  headers?: Record<string, string>;
}>("initResponse");

export const $send = (
  use: JSXContextAPI,
  opts: { status?: number; headers?: Record<string, string> },
): void => {
  Object.assign(use($initResponse), opts);
};

const wildcardRegExp = /^(?:\*|:(.*))$/;

const NotFound: JSXComponent = (_, use) => {
  use($send, { status: 404 });
  return Fragment({ children: ["Not found"] });
};
