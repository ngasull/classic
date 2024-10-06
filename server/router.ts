import type { AppBuild } from "@classic/build";
import { js, type JSable } from "@classic/js";
import { accepts } from "@std/http";
import { transform as transformCss } from "lightningcss";
import { Fragment, jsx } from "./jsx-runtime.ts";
import {
  $build,
  $buildContext,
  $effects,
  createContext,
  initContext,
  render,
} from "./render.ts";
import type { JSX, JSXContextInit, JSXElement } from "./types.ts";

type SubSegment<Params extends string, P extends string> = Segment<
  Params,
  Params | (P extends `:${infer Param}` ? Param : never),
  any
>;

let encoder: TextEncoder | null = null;

const minifyCss = (filename: string, css: string) => {
  encoder ??= new TextEncoder();
  const { code } = transformCss({
    filename,
    code: encoder.encode(css),
    minify: true,
    sourceMap: false,
  });
  return code;
};

type LayoutComponent<Params extends string> = JSX.FC<
  { [P in Params]: string } & { readonly children?: JSX.Children }
>;

type PartComponent<Params extends string> = JSX.FC<
  { [P in Params]: string }
>;

type Action<PC extends PartComponent<string>> = unknown;

type RoutedRequest<Params extends string> = {
  readonly req: Request;
  readonly params: { [P in Params]: string };
  readonly use: JSX.Use;
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
  #style?: JSXElement;
  #userStyle?: string | TemplateStringsArray;
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

  css(tpl: TemplateStringsArray): this;
  css(path: string): this;
  css(): Promise<JSXElement> | undefined;
  css(
    path?: string | TemplateStringsArray,
    ...args: readonly unknown[]
  ): unknown {
    if (!path) {
      if (this.#style == null && this.#userStyle) {
        let style: string | Uint8Array | Promise<Uint8Array> | null = null;
        this.#style = jsx(async (_, use) => {
          if (use($build).dev) {
            style = typeof this.#userStyle === "string"
              ? Deno.readFile(this.#userStyle)
              : this.#userStyle![0];
          } else {
            style ??= typeof this.#userStyle === "string"
              ? Deno.readFile(this.#userStyle)
              : minifyCss(Deno.cwd(), this.#userStyle![0]);
          }
          return jsx("style", {
            children: [
              typeof style === "string" ? style : await style,
            ],
          });
        });
      }
      return this.#style;
    }
    if (this.#userStyle) throw Error(`style is already set`);
    if (args.length) {
      throw Error(
        `Don't do replacements in CSS template as it prevents minification`,
      );
    }
    this.#userStyle = path;
    return this;
  }

  layout(Layout: LayoutComponent<ParentParams>): this;
  layout(): LayoutComponent<ParentParams>;
  layout(Layout?: LayoutComponent<ParentParams>) {
    if (!Layout) {
      return (async (params, use) =>
        jsx(Fragment, {
          children: [
            use($build).globalCssPublic
              ? jsx("link", {
                rel: "stylesheet",
                href: use($build).globalCssPublic,
              })
              : null,
            await this.css(),
            this.#Layout ? jsx(this.#Layout, params) : params.children,
          ],
        })) as LayoutComponent<ParentParams>;
    }
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

  /* @internal */
  async matchRoutes(
    [candidate, ...nextSegments]: string[],
    parentSegment: string = "",
    parentParams: Record<ParentParams, string> = {} as Record<
      ParentParams,
      string
    >,
    params: Record<Params, string> = parentParams as Record<Params, string>,
  ): Promise<void | RouteMatch<ParentParams, Params, PComponent>> {
    if (candidate) {
      if (this.#segments[candidate]) {
        let i = -1;
        for (let subRouter of this.#segments[candidate]) {
          i++;
          if (!(subRouter instanceof Segment)) {
            subRouter = await subRouter(new Segment());
            this.#segments[candidate][i] = subRouter;
          }

          const match = (await subRouter.matchRoutes(
            nextSegments,
            candidate,
            params,
            params,
          )) as RouteMatch<ParentParams, Params, PComponent> | void;
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

          const match = (await subRouter.matchRoutes(
            nextSegments,
            wildcard,
            params,
            nextParams,
          )) as RouteMatch<ParentParams, Params, PComponent> | void;
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

type RouteMatch<
  ParentParams extends Params,
  Params extends string,
  PComponent extends PartComponent<Params> | undefined,
> = (readonly [
  Segment<ParentParams, Params, PComponent>,
  string,
  Record<ParentParams, string>,
  Record<Params, string>,
])[];

class Router {
  #RootLayout?: LayoutComponent<never>;
  #root?: Promise<Segment<never, never, undefined>>;

  rootLayout(Layout: LayoutComponent<never>): this {
    if (this.#RootLayout) throw Error(`Layout is already set`);
    this.#RootLayout = Layout;
    return this;
  }

  rootRoute<P extends string>(
    sub:
      | SubSegment<never, never>
      | (
        (segment: SubSegment<never, never>) =>
          | SubSegment<never, never>
          | PromiseLike<
            SubSegment<never, never> | {
              readonly default: SubSegment<never, never>;
            }
          >
      ),
  ): this {
    this.#root = Promise
      .resolve(typeof sub === "function" ? sub(new Segment()) : sub)
      .then((x) => x instanceof Segment ? x : x.default);
    return this;
  }

  async fetch(
    req: Request,
    { context, build }: {
      context?: JSXContextInit<unknown>[] | JSX.Use | undefined;
      build: AppBuild;
    },
  ): Promise<Response | void> {
    const moduleRes = build.fetch(req);
    if (moduleRes) return moduleRes;

    const isGET = req.method === "GET";
    const reqAccepts = accepts(req);
    const { pathname, searchParams } = new URL(req.url);

    const use = initContext(context);
    use.provide($initResponse, {});
    use.provide($build, build);
    use.provide($buildContext, build.context);

    const segments = pathname === "/" ? [] : pathname.slice(1).split("/");

    const layouts = await this.#root?.then((s) => s.matchRoutes(segments));
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
        jsx(CCRoute, {
          body: jsx(Fragment, {
            children: render(part, { context: initContext(use) }),
          }),
        }),
        { context: initContext(use) },
      );

      for (let i = segments.length - 1; i >= 0; i--) {
        const [segment, path, layoutParams] = segments[i];
        stream = render(
          jsx(CCRoute, {
            path,
            body: jsx(segment.layout(), {
              ...layoutParams,
              children: jsx("slot"),
            }),
            children: stream,
          }),
          { context: initContext(use) },
        );
      }

      const context = initContext(use);
      if (!reqFrom) {
        context.provide($effects, [
          js.module<typeof import("./client-router.ts")>(
            "@classic/server/client/router",
          ).init() as JSable<void>,
        ]);
      }

      stream = render(
        reqFrom
          ? jsx("html", {
            children: jsx("body", { children: stream }),
          })
          : jsx(this.#RootLayout!, { children: stream }),
        { context },
      );

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

const $initResponse = createContext<{
  status?: number;
  headers?: Record<string, string>;
}>("initResponse");

export const $send = (
  use: JSX.Use,
  opts: { status?: number; headers?: Record<string, string> },
): void => {
  Object.assign(use($initResponse), opts);
};

const wildcardRegExp = /^(?:\*|:(.*))$/;

const CCRoute: JSX.PFC<{
  path?: string;
  body: JSX.Element;
}> = ({ path, body, children }, use) => {
  const globalCss = use($build).globalCssPublic;

  return jsx("cc-route", {
    path,
    children: [
      jsx("template", {
        shadowrootmode: "open",
        children: [
          globalCss
            ? jsx("link", { rel: "stylesheet", href: globalCss })
            : null,
          body,
        ],
      }),
      children,
    ],
  });
};

const NotFound: JSX.FC = (_, use) => {
  use($send, { status: 404 });
  return Fragment({ children: ["Not found"] });
};
