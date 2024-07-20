import {
  globalServedJSContext,
  type JSable,
  type ServedJSContext,
} from "@classic/js";
import { accepts } from "@std/http";
import { init as initJs } from "./dist/@classic/router.js.ts";
import { Fragment, jsx } from "./jsx-runtime.ts";
import {
  $effects,
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

export const route = <T extends string = never>(): Segment<T, T, undefined> =>
  new Segment();

export type { Segment };

class Segment<
  ParentParams extends Params,
  Params extends string,
  PComponent extends PartComponent<Params> | undefined,
> {
  #Layout?: LayoutComponent<ParentParams>;
  #Part?: PComponent;
  #Action?: PComponent extends PartComponent<Params> ? Action<PComponent>
    : never;
  #apiHandlers: Map<Method, Handler<Params>> = new Map();

  #segments: Record<
    string,
    (
      // deno-lint-ignore no-explicit-any
      | Segment<any, any, any>
      | ((
        // deno-lint-ignore no-explicit-any
        segment: Segment<any, any, any>,
        // deno-lint-ignore no-explicit-any
      ) => Segment<any, any, any> | PromiseLike<Segment<any, any, any>>)
    )[]
  > = {};
  #param?: string;

  route<
    P extends string,
    SubSegment extends Segment<
      Params,
      Params | (P extends `:${infer Param}` ? Param : never),
      any
    >,
  >(
    segment: P,
    sub:
      | SubSegment
      | ((segment: SubSegment) => SubSegment | PromiseLike<SubSegment>),
  ): Segment<ParentParams, Params, PComponent> {
    if (!segment) throw Error(`Route segment name can't be empty`);

    const subs = this.#segments[segment] ??= [];
    // @ts-ignore dynamism is protected by `segment` signature
    if (!subs.includes(sub)) subs.push(sub);

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

  async #matchRoutes(
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

          const match = await subRouter.#matchRoutes(
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

          const match = await subRouter.#matchRoutes(
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

  async fetch(
    req: Request,
    { context, js = globalServedJSContext }: {
      context?: JSXContextInit<unknown>[] | undefined;
      js?: ServedJSContext | boolean;
    } = {},
  ): Promise<Response | void> {
    const jsContext = typeof js === "boolean"
      ? js ? globalServedJSContext : null
      : js;
    if (jsContext) {
      const moduleRes = await jsContext.fetch(req);
      if (moduleRes) return moduleRes;
    }

    const use = initContext(context);
    use.provide($initResponse, {});

    const acceptsHtml = req.method === "GET" &&
      accepts(req).includes("text/html");

    const { pathname, searchParams } = new URL(req.url);
    const segments = pathname === "/" ? [] : pathname.slice(1).split("/");

    const layouts = await this.#matchRoutes(segments);
    if (!layouts) return;
    const [lastSegment, , , partParams] = layouts[layouts.length - 1];

    const reqFrom = req.method === "GET" &&
      searchParams.get("cc-from")?.split("/");

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
          children: jsx(Html, {
            contents: render(part, { context: initContext(use) }),
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
          context.provide($effects, [initJs() as JSable<void>]);
        }

        stream = render(
          path
            ? reqFrom && i === 0
              ? jsx("html", {
                children: jsx("body", {
                  children: layout(
                    path,
                    layoutParams,
                    segment.layout(),
                    stream,
                  ),
                }),
              })
              : layout(path, layoutParams, segment.layout(), stream)
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
  path: string | undefined,
  params: Record<Params, string>,
  Layout: LayoutComponent<Params> = Fragment,
  stream: ReadableStream<Uint8Array>,
) =>
  jsx("cc-route", {
    path,
    children: [
      jsx(Layout, { ...params, children: jsx("slot") }),
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
