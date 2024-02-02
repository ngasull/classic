type Crossorigin = "anonymous" | "use-credentials";
type RefererPolicy =
  | "no-referrer"
  | "no-referrer-when-downgrade"
  | "origin"
  | "origin-when-cross-origin"
  | "same-origin"
  | "strict-origin-when-cross-origin"
  | "unsafe-url";
type Target = "_blank" | "_self" | "_parent" | "_top";

declare global {
  namespace JSX {
    interface AbbrTagProps {}
    interface AddressTagProps {}
    interface AnchorTagProps {
      download?: string;
      href?: string;
      hreflang?: string;
      ping?: string;
      media?: string;
      referrerpolicy?: RefererPolicy;
      rel?:
        | "alternate"
        | "author"
        | "bookmark"
        | "external"
        | "help"
        | "license"
        | "next"
        | "nofollow"
        | "noreferrer"
        | "noopener"
        | "prev"
        | "search"
        | "tag";
      target?: Target;
      type?: string;
    }
    interface ArticleTagProps {}
    interface AsideTagProps {}
    interface AreaTagProps {
      alt?: string;
      coords?: string;
      download?: string;
      href?: string;
      hreflang?: string;
      media?: string;
      referrerpolicy?: RefererPolicy;
      rel?:
        | "alternate"
        | "author"
        | "bookmark"
        | "help"
        | "license"
        | "next"
        | "nofollow"
        | "noreferrer"
        | "prefetch"
        | "prev"
        | "search"
        | "tag";
      shape?: "default" | "rect" | "circle" | "poly";
      target?: Target;
      type?: string;
    }
    interface AudioTagProps {
      autoplay?: AttributeBool;
      controls?: AttributeBool;
      loop?: AttributeBool;
      muted?: AttributeBool;
      preload?: "auto" | "metadata" | "none";
      src?: string;
    }
    interface BTagProps {}
    interface BdiTagProps {}
    interface BigTagProps {}
    interface BodyTagProps {}
    interface BrTagProps {}
    interface BaseTagProps {
      href?: string;
      target?: Target;
    }
    interface BdoTagProps {
      dir?: "ltr" | "rtl";
    }
    interface BlockquoteTagProps {
      cite?: string;
    }
    interface ButtonTagProps {
      autofocus?: AttributeBool;
      disabled?: string;
      form?: string;
      formaction?: string;
      formenctype?: string;
      formmethod?: string;
      formnovalidate?: string;
      formtarget?: string;
      name?: string;
      type?: "button" | "reset" | "submit";
      value?: string;
    }
    interface CaptionTagProps {}
    interface CiteTagProps {}
    interface CodeTagProps {}
    interface CanvasTagProps {
      height?: string | number;
      width?: string | number;
    }
    interface ColTagProps {
      span?: string | number;
    }
    interface ColgroupTagProps {
      span?: string | number;
    }
    interface DatalistTagProps {}
    interface DataTagProps {
      value?: string;
    }
    interface DdTagProps {}
    interface DelTagProps {
      cite?: string;
      datetime?: string;
    }
    interface DetailsTagProps {
      open?: AttributeBool;
    }
    interface DfnTagProps {}
    interface DialogTagProps {
      open?: AttributeBool;
    }
    interface DivTagProps {}
    interface DlTagProps {}
    interface DtTagProps {}
    interface EmbedTagProps {
      height?: string | number;
      src?: string;
      type?: string;
      width?: string | number;
    }
    interface EmTagProps {}
    interface FigcaptionTagProps {}
    interface FigureTagProps {}
    interface FieldsetTagProps {
      disabled?: AttributeBool;
      form?: string;
      name?: string;
    }
    interface FooterTagProps {}
    interface FormTagProps {
      "accept-charset"?: string;
      action?: string;
      autocomplete?: "on" | "off";
      enctype?:
        | "application/x-www-form-urlencoded"
        | "multipart/form-data"
        | "text/plain";
      method?: "get" | "post";
      name?: string;
      novalidate?: AttributeBool;
      rel?:
        | "external"
        | "help"
        | "license"
        | "next"
        | "nofollow"
        | "noopener"
        | "noreferrer"
        | "opener"
        | "prev"
        | "search";
      target?: Target;
    }
    interface H1TagProps {}
    interface H2TagProps {}
    interface H3TagProps {}
    interface H4TagProps {}
    interface H5TagProps {}
    interface H6TagProps {}
    interface HeadTagProps {}
    interface HeaderTagProps {}
    interface HgroupTagProps {}
    interface HrTagProps {}
    interface HtmlTagProps {
      xmlns?: string;
    }
    interface ITagProps {}
    interface IframeTagProps {
      allow?: string;
      allowfullscreen?: AttributeBool;
      allowpaymentrequest?: AttributeBool;
      height?: string | number;
      loading?: "eager" | "lazy";
      name?: string;
      referrerpolicy?: RefererPolicy;
      sandbox?:
        | "allow-forms"
        | "allow-pointer-lock"
        | "allow-popups"
        | "allow-same-origin"
        | "allow-scripts"
        | "allow-top-navigation";
      src?: string;
      srcdoc?: string;
      width?: string | number;
    }
    interface ImgTagProps {
      alt?: string;
      crossorigin?: "anonymous" | "use-credentials";
      height?: string | number;
      ismap?: AttributeBool;
      loading?: "eager" | "lazy";
      longdesc?: string;
      referrerpolicy?: RefererPolicy;
      sizes?: string;
      src?: string;
      srcset?: string;
      usemap?: string;
      width?: string | number;
    }
    interface InputTagProps {
      accept?: string;
      alt?: string;
      autocomplete?: "on" | "off";
      autofocus?: AttributeBool;
      checked?: AttributeBool;
      dirname?: string;
      disabled?: AttributeBool;
      form?: string;
      formaction?: string;
      formenctype?:
        | "application/x-www-form-urlencoded"
        | "multipart/form-data"
        | "text/plain";
      formmethod?: "get" | "post";
      formnovalidate?: string;
      formtarget?: string;
      height?: string | number;
      list?: string;
      max?: string | number;
      maxlength?: string | number;
      min?: string | number;
      minlength?: string | number;
      multiple?: string;
      name?: string;
      pattern?: string;
      placeholder?: string;
      readonly?: AttributeBool;
      required?: AttributeBool;
      size?: string | number;
      src?: string;
      step?: string | number;
      type?:
        | "button"
        | "checkbox"
        | "color"
        | "date"
        | "datetime-local"
        | "datetime-local"
        | "email"
        | "file"
        | "hidden"
        | "image"
        | "month"
        | "number"
        | "password"
        | "radio"
        | "range"
        | "reset"
        | "search"
        | "submit"
        | "tel"
        | "text"
        | "time"
        | "url"
        | "week";
      value?: string | number;
      width?: string | number;
    }
    interface InsTagProps {
      cite?: string;
      datetime?: string;
    }
    interface KbdTagProps {}
    interface KeygenTagProps {}
    interface LegendTagProps {}
    interface LabelTagProps {
      for?: string;
      form?: string;
    }
    interface LiTagProps {
      value?: string;
    }
    interface LinkTagProps {
      as?:
        | "audio"
        | "document"
        | "embed"
        | "fetch"
        | "font"
        | "image"
        | "object"
        | "script"
        | "style"
        | "track"
        | "video"
        | "worker";
      crossorigin?: Crossorigin;
      href?: string;
      hreflang?: string;
      imagesizes?: string;
      imagesrcset?: string;
      integrity?: string;
      media?: string;
      prefetch?: string;
      referrerpolicy?: RefererPolicy;
      rel?:
        | "alternate"
        | "author"
        | "dns-prefetch"
        | "help"
        | "icon"
        | "license"
        | "next"
        | "pingback"
        | "preconnect"
        | "prefetch"
        | "preload"
        | "prerender"
        | "prev"
        | "search"
        | "stylesheet";
      sizes?: string;
      title?: string;
      type?: string;
      blocking?: string;
    }
    interface MainTagProps {}
    interface MarkTagProps {}
    interface MenuTagProps {}
    interface MenuitemTagProps {}
    interface MapTagProps {
      name?: string;
    }
    interface MeterTagProps {
      form?: string;
      high?: string | number;
      low?: string | number;
      max?: string | number;
      min?: string | number;
      optimum?: string | number;
      value?: string | number;
    }
    interface MetaTagProps {
      "http-equiv"?:
        | "content-security-policy"
        | "content-type"
        | "default-style"
        | "x-ua-compatible"
        | "refresh";
      charset?: string;
      content?: string;
      name?:
        | "application-name"
        | "author"
        | "description"
        | "generator"
        | "keywords"
        | "viewport";
    }
    interface NavTagProps {}
    interface NoindexTagProps {}
    interface NoscriptTagProps {}
    interface ObjectTagProps {
      data?: string;
      form?: string;
      height?: string | number;
      name?: string;
      type?: string;
      typemustmatch?: AttributeBool;
      usemap?: string;
      width?: string | number;
    }
    interface OlTagProps {
      reversed?: AttributeBool;
      start?: string | number;
      type?: "1" | "A" | "a" | "I" | "i";
    }
    interface OptgroupTagProps {
      disabled?: AttributeBool;
      label?: string;
    }
    interface OptionTagProps {
      disabled?: AttributeBool;
      label?: string;
      selected?: AttributeBool;
      value?: string;
    }
    interface OutputTagProps {
      for?: string;
      form?: string;
      name?: string;
    }
    interface ParagraphTagProps {}
    interface PictureTagProps {}
    interface PreTagProps {}
    interface ParamTagProps {
      name?: string;
      value?: string;
    }
    interface ProgressTagProps {
      max?: string | number;
      value?: string | number;
    }
    interface QTagProps {
      cite?: string;
    }
    interface RpTagProps {}
    interface RtTagProps {}
    interface RubyTagProps {}
    interface STagProps {}
    interface SampTagProps {}
    interface ScriptTagProps {
      async?: AttributeBool;
      crossorigin?: Crossorigin;
      defer?: AttributeBool;
      integrity?: string;
      nomodule?: "True" | "False";
      referrerpolicy?: RefererPolicy;
      src?: string;
      type?: string;
    }
    interface SectionTagProps {}
    interface SelectTagProps {
      autofocus?: AttributeBool;
      disabled?: AttributeBool;
      form?: string;
      multiple?: AttributeBool;
      name?: string;
      required?: AttributeBool;
      size?: string | number;
    }
    interface SlotTagProps {}
    interface SmallTagProps {}
    interface SourceTagProps {
      media?: string;
      sizes?: string;
      src?: string;
      srcset?: string;
      type?: string;
    }
    interface SpanTagProps {}
    interface StrongTagProps {}
    interface StyleTagProps {
      media?: string;
      type?: string;
    }
    interface SubTagProps {}
    interface SummaryTagProps {}
    interface SupTagProps {}
    interface SvgTagProps {}
    interface TableTagProps {}
    interface TbodyTagProps {}
    interface TdTagProps {
      colspan?: string | number;
      headers?: string;
      rowspan?: string | number;
    }
    interface TemplateTagProps {}
    interface TextareaTagProps {
      autofocus?: AttributeBool;
      cols?: string | number;
      dirname?: string;
      disabled?: AttributeBool;
      form?: string;
      maxlength?: string | number;
      name?: string;
      placeholder?: string;
      readonly?: AttributeBool;
      required?: AttributeBool;
      rows?: string | number;
      wrap?: "hard" | "soft";
    }
    interface TfootTagProps {}
    interface TheadTagProps {}
    interface ThTagProps {
      abbr?: string;
      colspan?: string | number;
      headers?: string;
      rowspan?: string | number;
      scope?: "col" | "colgroup" | "row" | "rowgroup";
    }
    interface TimeTagProps {
      datetime?: string;
    }
    interface TitleTagProps {}
    interface TrackTagProps {
      default?: AttributeBool;
      kind?:
        | "captions"
        | "chapters"
        | "descriptions"
        | "metadata"
        | "subtitles";
      label?: string;
      src?: string;
      srclang?: string;
    }
    interface TrTagProps {}
    interface UTagProps {}
    interface UlTagProps {}
    interface VarTagProps {}
    interface VideoTagProps {
      autoplay?: AttributeBool;
      controls?: AttributeBool;
      height?: string | number;
      loop?: AttributeBool;
      muted?: AttributeBool;
      poster?: string;
      preload?: "auto" | "metadata" | "none";
      src?: string;
      width?: string | number;
    }
    interface WbrTagProps {}
    interface WebviewTagProps {}

    interface DOMElements {
      a: HTMLProps<AnchorTagProps>;
      abbr: HTMLProps<AbbrTagProps>;
      address: HTMLProps<AddressTagProps>;
      area: HTMLVoidProps<AreaTagProps>;
      article: HTMLProps<ArticleTagProps>;
      aside: HTMLProps<AsideTagProps>;
      audio: HTMLProps<AudioTagProps>;
      b: HTMLProps<BTagProps>;
      base: HTMLVoidProps<BaseTagProps>;
      bdi: HTMLProps<BdiTagProps>;
      bdo: HTMLProps<BdoTagProps>;
      big: HTMLProps<BigTagProps>;
      blockquote: HTMLProps<BlockquoteTagProps>;
      body: HTMLProps<BodyTagProps>;
      br: HTMLVoidProps<BrTagProps>;
      button: HTMLProps<ButtonTagProps>;
      canvas: HTMLProps<CanvasTagProps>;
      caption: HTMLProps<CaptionTagProps>;
      cite: HTMLProps<CiteTagProps>;
      code: HTMLProps<CodeTagProps>;
      col: HTMLVoidProps<ColTagProps>;
      colgroup: HTMLProps<ColgroupTagProps>;
      data: HTMLProps<DataTagProps>;
      datalist: HTMLProps<DatalistTagProps>;
      dd: HTMLProps<DdTagProps>;
      del: HTMLProps<DelTagProps>;
      details: HTMLProps<DetailsTagProps>;
      dfn: HTMLProps<DfnTagProps>;
      dialog: HTMLProps<DialogTagProps>;
      div: HTMLProps<DivTagProps>;
      dl: HTMLProps<DlTagProps>;
      dt: HTMLProps<DtTagProps>;
      em: HTMLProps<EmTagProps>;
      embed: HTMLVoidProps<EmbedTagProps>;
      fieldset: HTMLProps<FieldsetTagProps>;
      figcaption: HTMLProps<FigcaptionTagProps>;
      figure: HTMLProps<FigureTagProps>;
      footer: HTMLProps<FooterTagProps>;
      form: HTMLProps<FormTagProps>;
      h1: HTMLProps<H1TagProps>;
      h2: HTMLProps<H2TagProps>;
      h3: HTMLProps<H3TagProps>;
      h4: HTMLProps<H4TagProps>;
      h5: HTMLProps<H5TagProps>;
      h6: HTMLProps<H6TagProps>;
      head: HTMLProps<HeadTagProps>;
      header: HTMLProps<HeaderTagProps>;
      hgroup: HTMLProps<HgroupTagProps>;
      hr: HTMLVoidProps<HrTagProps>;
      html: HTMLProps<HtmlTagProps>;
      i: HTMLProps<ITagProps>;
      iframe: HTMLProps<IframeTagProps>;
      img: HTMLVoidProps<ImgTagProps>;
      input: HTMLVoidProps<InputTagProps>;
      ins: HTMLProps<InsTagProps>;
      kbd: HTMLProps<KbdTagProps>;
      keygen: HTMLProps<KeygenTagProps>;
      label: HTMLProps<LabelTagProps>;
      legend: HTMLProps<LegendTagProps>;
      li: HTMLProps<LiTagProps>;
      link: HTMLVoidProps<LinkTagProps>;
      main: HTMLProps<MainTagProps>;
      map: HTMLProps<MapTagProps>;
      mark: HTMLProps<MarkTagProps>;
      menu: HTMLProps<MenuTagProps>;
      menuitem: HTMLProps<MenuitemTagProps>;
      meta: HTMLVoidProps<MetaTagProps>;
      meter: HTMLProps<MeterTagProps>;
      nav: HTMLProps<NavTagProps>;
      noindex: HTMLProps<NoindexTagProps>;
      noscript: HTMLProps<NoscriptTagProps>;
      object: HTMLProps<ObjectTagProps>;
      ol: HTMLProps<OlTagProps>;
      optgroup: HTMLProps<OptgroupTagProps>;
      option: HTMLProps<OptionTagProps>;
      output: HTMLProps<OutputTagProps>;
      p: HTMLProps<ParagraphTagProps>;
      param: HTMLVoidProps<ParamTagProps>;
      picture: HTMLProps<PictureTagProps>;
      pre: HTMLProps<PreTagProps>;
      progress: HTMLProps<ProgressTagProps>;
      q: HTMLProps<QTagProps>;
      rp: HTMLProps<RpTagProps>;
      rt: HTMLProps<RtTagProps>;
      ruby: HTMLProps<RubyTagProps>;
      s: HTMLProps<STagProps>;
      samp: HTMLProps<SampTagProps>;
      slot: HTMLProps<SlotTagProps>;
      script: HTMLProps<ScriptTagProps>;
      section: HTMLProps<SectionTagProps>;
      select: HTMLProps<SelectTagProps>;
      small: HTMLProps<SmallTagProps>;
      source: HTMLVoidProps<SourceTagProps>;
      span: HTMLProps<SpanTagProps>;
      strong: HTMLProps<StrongTagProps>;
      style: HTMLProps<StyleTagProps>;
      sub: HTMLProps<SubTagProps>;
      summary: HTMLProps<SummaryTagProps>;
      sup: HTMLProps<SupTagProps>;
      table: HTMLProps<TableTagProps>;
      template: HTMLProps<TemplateTagProps>;
      tbody: HTMLProps<TbodyTagProps>;
      td: HTMLProps<TdTagProps>;
      textarea: HTMLProps<TextareaTagProps>;
      tfoot: HTMLProps<TfootTagProps>;
      th: HTMLProps<ThTagProps>;
      thead: HTMLProps<TheadTagProps>;
      time: HTMLProps<TimeTagProps>;
      title: HTMLProps<TitleTagProps>;
      tr: HTMLProps<TrTagProps>;
      track: HTMLVoidProps<TrackTagProps>;
      u: HTMLProps<UTagProps>;
      ul: HTMLProps<UlTagProps>;
      var: HTMLProps<VarTagProps>;
      video: HTMLProps<VideoTagProps>;
      wbr: HTMLVoidProps<WbrTagProps>;
      webview: HTMLProps<WebviewTagProps>;

      // SVG
      svg: HTMLProps<SvgTagProps>;
    }
  }
}

type AttributeBool = true | false | "true" | "false";

export type Rewrap<T extends object> = T extends infer OBJ ? {
    [K in keyof OBJ]: OBJ[K] extends infer O ? O : never;
  }
  : never;

type HTMLProps<T extends object = never> =
  & HTMLVoidProps<T>
  & Partial<Record<"children", JSX.Children>>
  & Partial<Record<"ref", JSX.Ref<Element>>>;

type HTMLVoidProps<T extends object = never> = Rewrap<
  ExtendBaseProps<
    [T] extends [never] ? BaseHTMLTagProps : Partial<T> & BaseHTMLTagProps
  >
>;

interface AttributeAcceptedTypes {}

type ExtendBaseProps<P> = {
  [K in keyof P]: AttributeAcceptedTypes extends {
    [E in K]: infer T;
  } ? T | P[K]
    : P[K];
};

interface BaseHTMLTagProps
  extends Record<`data-${string}`, string | undefined> {
  accesskey?: string;
  class?: string;
  contenteditable?: AttributeBool;
  dir?: "ltr" | "rtl" | "auto";
  draggable?: AttributeBool | "auto";
  hidden?: AttributeBool;
  id?: string;
  inert?: AttributeBool;
  is?: string;
  lang?: string;
  onabort?: string;
  onafterprint?: string;
  onanimationend?: string;
  onanimationiteration?: string;
  onanimationstart?: string;
  onbeforeprint?: string;
  onbeforeunload?: string;
  onblur?: string;
  oncanplay?: string;
  oncanplaythrough?: string;
  onchange?: string;
  onclick?: string;
  oncontextmenu?: string;
  oncopy?: string;
  oncuechange?: string;
  oncut?: string;
  ondblclick?: string;
  ondrag?: string;
  ondragend?: string;
  ondragenter?: string;
  ondragleave?: string;
  ondragover?: string;
  ondragstart?: string;
  ondrop?: string;
  ondurationchange?: string;
  onemptied?: string;
  onended?: string;
  onerror?: string;
  onfocus?: string;
  onfocusin?: string;
  onfocusout?: string;
  onfullscreenchange?: string;
  onfullscreenerror?: string;
  ongotpointercapture?: string;
  onhashchange?: string;
  oninput?: string;
  oninvalid?: string;
  onkeydown?: string;
  onkeypress?: string;
  onkeyup?: string;
  onload?: string;
  onloadeddata?: string;
  onloadedmetadata?: string;
  onloadstart?: string;
  onlostpointercapture?: string;
  onmessage?: string;
  onmousedown?: string;
  onmouseenter?: string;
  onmouseleave?: string;
  onmousemove?: string;
  onmouseout?: string;
  onmouseover?: string;
  onmouseup?: string;
  onmousewheel?: string;
  onoffline?: string;
  ononline?: string;
  onopen?: string;
  onpagehide?: string;
  onpageshow?: string;
  onpaste?: string;
  onpause?: string;
  onplay?: string;
  onplaying?: string;
  onpointercancel?: string;
  onpointerdown?: string;
  onpointerenter?: string;
  onpointerleave?: string;
  onpointermove?: string;
  onpointerout?: string;
  onpointerover?: string;
  onpointerup?: string;
  onpopstate?: string;
  onprogress?: string;
  onratechange?: string;
  onreset?: string;
  onresize?: string;
  onscroll?: string;
  onsearch?: string;
  onseeked?: string;
  onseeking?: string;
  onselect?: string;
  onshow?: string;
  onstalled?: string;
  onstorage?: string;
  onsubmit?: string;
  onsuspend?: string;
  ontimeupdate?: string;
  ontoggle?: string;
  ontouchcancel?: string;
  ontouchend?: string;
  ontouchmove?: string;
  ontouchstart?: string;
  ontransitionend?: string;
  onunload?: string;
  onvolumechange?: string;
  onwaiting?: string;
  onwheel?: string;
  role?: string;
  slot?: string;
  spellcheck?: AttributeBool;
  style?: string;
  tabindex?: string | number;
  title?: string;
  translate?: "yes" | "no";
}
