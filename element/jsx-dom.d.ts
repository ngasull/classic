// Modified from source: https://github.com/preactjs/preact/blob/main/src/jsx.d.ts

type Defaultize<Props, Defaults> =
  // Distribute over unions
  Props extends any // Make any properties included in Default optional
    ?
      & Partial<Pick<Props, Extract<keyof Props, keyof Defaults>>>
      & // Include the remaining properties from Props
      Pick<Props, Exclude<keyof Props, keyof Defaults>>
    : never;

type Booleanish = boolean | "true" | "false";

export namespace JSXInternal {
  export type LibraryManagedAttributes<Component, Props> = Component extends {
    defaultProps: infer Defaults;
  } ? Defaultize<Props, Defaults>
    : Props;

  export interface IntrinsicAttributes {
    key?: any;
  }

  export type DOMCSSProperties = {
    [
      key in keyof Omit<
        CSSStyleDeclaration,
        | "item"
        | "setProperty"
        | "removeProperty"
        | "getPropertyValue"
        | "getPropertyPriority"
      >
    ]?: string | number | null | undefined;
  };
  export type AllCSSProperties = {
    [key: string]: string | number | null | undefined;
  };
  export interface CSSProperties extends AllCSSProperties, DOMCSSProperties {
    cssText?: string | null;
  }

  export interface SVGAttributes<Target extends EventTarget = SVGElement>
    extends HTMLAttributes<Target> {
    accentHeight?:
      | number
      | string
      | undefined;
    accumulate?:
      | "none"
      | "sum"
      | undefined;
    additive?:
      | "replace"
      | "sum"
      | undefined;
    alignmentBaseline?:
      | "auto"
      | "baseline"
      | "before-edge"
      | "text-before-edge"
      | "middle"
      | "central"
      | "after-edge"
      | "text-after-edge"
      | "ideographic"
      | "alphabetic"
      | "hanging"
      | "mathematical"
      | "inherit"
      | undefined;
    "alignment-baseline"?:
      | "auto"
      | "baseline"
      | "before-edge"
      | "text-before-edge"
      | "middle"
      | "central"
      | "after-edge"
      | "text-after-edge"
      | "ideographic"
      | "alphabetic"
      | "hanging"
      | "mathematical"
      | "inherit"
      | undefined;
    allowReorder?:
      | "no"
      | "yes"
      | undefined;
    "allow-reorder"?:
      | "no"
      | "yes"
      | undefined;
    alphabetic?:
      | number
      | string
      | undefined;
    amplitude?:
      | number
      | string
      | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/arabic-form */
    arabicForm?:
      | "initial"
      | "medial"
      | "terminal"
      | "isolated"
      | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/arabic-form */
    "arabic-form"?:
      | "initial"
      | "medial"
      | "terminal"
      | "isolated"
      | undefined;
    ascent?:
      | number
      | string
      | undefined;
    attributeName?: string | undefined;
    attributeType?: string | undefined;
    autoReverse?:
      | number
      | string
      | undefined;
    azimuth?:
      | number
      | string
      | undefined;
    baseFrequency?:
      | number
      | string
      | undefined;
    baselineShift?:
      | number
      | string
      | undefined;
    "baseline-shift"?:
      | number
      | string
      | undefined;
    baseProfile?:
      | number
      | string
      | undefined;
    bbox?:
      | number
      | string
      | undefined;
    begin?:
      | number
      | string
      | undefined;
    bias?:
      | number
      | string
      | undefined;
    by?: number | string | undefined;
    calcMode?:
      | number
      | string
      | undefined;
    capHeight?:
      | number
      | string
      | undefined;
    "cap-height"?:
      | number
      | string
      | undefined;
    clip?:
      | number
      | string
      | undefined;
    clipPath?: string | undefined;
    "clip-path"?: string | undefined;
    clipPathUnits?:
      | number
      | string
      | undefined;
    clipRule?:
      | number
      | string
      | undefined;
    "clip-rule"?:
      | number
      | string
      | undefined;
    colorInterpolation?:
      | number
      | string
      | undefined;
    "color-interpolation"?:
      | number
      | string
      | undefined;
    colorInterpolationFilters?:
      | "auto"
      | "sRGB"
      | "linearRGB"
      | "inherit"
      | undefined;
    "color-interpolation-filters"?:
      | "auto"
      | "sRGB"
      | "linearRGB"
      | "inherit"
      | undefined;
    colorProfile?:
      | number
      | string
      | undefined;
    "color-profile"?:
      | number
      | string
      | undefined;
    colorRendering?:
      | number
      | string
      | undefined;
    "color-rendering"?:
      | number
      | string
      | undefined;
    contentScriptType?:
      | number
      | string
      | undefined;
    "content-script-type"?:
      | number
      | string
      | undefined;
    contentStyleType?:
      | number
      | string
      | undefined;
    "content-style-type"?:
      | number
      | string
      | undefined;
    cursor?:
      | number
      | string
      | undefined;
    cx?: number | string | undefined;
    cy?: number | string | undefined;
    d?: string | undefined;
    decelerate?:
      | number
      | string
      | undefined;
    descent?:
      | number
      | string
      | undefined;
    diffuseConstant?:
      | number
      | string
      | undefined;
    direction?:
      | number
      | string
      | undefined;
    display?:
      | number
      | string
      | undefined;
    divisor?:
      | number
      | string
      | undefined;
    dominantBaseline?:
      | number
      | string
      | undefined;
    "dominant-baseline"?:
      | number
      | string
      | undefined;
    dur?: number | string | undefined;
    dx?: number | string | undefined;
    dy?: number | string | undefined;
    edgeMode?:
      | number
      | string
      | undefined;
    elevation?:
      | number
      | string
      | undefined;
    enableBackground?:
      | number
      | string
      | undefined;
    "enable-background"?:
      | number
      | string
      | undefined;
    end?: number | string | undefined;
    exponent?:
      | number
      | string
      | undefined;
    externalResourcesRequired?:
      | number
      | string
      | undefined;
    fill?: string | undefined;
    fillOpacity?:
      | number
      | string
      | undefined;
    "fill-opacity"?:
      | number
      | string
      | undefined;
    fillRule?:
      | "nonzero"
      | "evenodd"
      | "inherit"
      | undefined;
    "fill-rule"?:
      | "nonzero"
      | "evenodd"
      | "inherit"
      | undefined;
    filter?: string | undefined;
    filterRes?:
      | number
      | string
      | undefined;
    filterUnits?:
      | number
      | string
      | undefined;
    floodColor?:
      | number
      | string
      | undefined;
    "flood-color"?:
      | number
      | string
      | undefined;
    floodOpacity?:
      | number
      | string
      | undefined;
    "flood-opacity"?:
      | number
      | string
      | undefined;
    focusable?:
      | number
      | string
      | undefined;
    fontFamily?: string | undefined;
    "font-family"?: string | undefined;
    fontSize?:
      | number
      | string
      | undefined;
    "font-size"?:
      | number
      | string
      | undefined;
    fontSizeAdjust?:
      | number
      | string
      | undefined;
    "font-size-adjust"?:
      | number
      | string
      | undefined;
    fontStretch?:
      | number
      | string
      | undefined;
    "font-stretch"?:
      | number
      | string
      | undefined;
    fontStyle?:
      | number
      | string
      | undefined;
    "font-style"?:
      | number
      | string
      | undefined;
    fontVariant?:
      | number
      | string
      | undefined;
    "font-variant"?:
      | number
      | string
      | undefined;
    fontWeight?:
      | number
      | string
      | undefined;
    "font-weight"?:
      | number
      | string
      | undefined;
    format?:
      | number
      | string
      | undefined;
    from?:
      | number
      | string
      | undefined;
    fx?: number | string | undefined;
    fy?: number | string | undefined;
    g1?: number | string | undefined;
    g2?: number | string | undefined;
    glyphName?:
      | number
      | string
      | undefined;
    "glyph-name"?:
      | number
      | string
      | undefined;
    glyphOrientationHorizontal?:
      | number
      | string
      | undefined;
    "glyph-orientation-horizontal"?:
      | number
      | string
      | undefined;
    glyphOrientationVertical?:
      | number
      | string
      | undefined;
    "glyph-orientation-vertical"?:
      | number
      | string
      | undefined;
    glyphRef?:
      | number
      | string
      | undefined;
    gradientTransform?: string | undefined;
    gradientUnits?: string | undefined;
    hanging?:
      | number
      | string
      | undefined;
    horizAdvX?:
      | number
      | string
      | undefined;
    "horiz-adv-x"?:
      | number
      | string
      | undefined;
    horizOriginX?:
      | number
      | string
      | undefined;
    "horiz-origin-x"?:
      | number
      | string
      | undefined;
    ideographic?:
      | number
      | string
      | undefined;
    imageRendering?:
      | number
      | string
      | undefined;
    "image-rendering"?:
      | number
      | string
      | undefined;
    in2?: number | string | undefined;
    in?: string | undefined;
    intercept?:
      | number
      | string
      | undefined;
    k1?: number | string | undefined;
    k2?: number | string | undefined;
    k3?: number | string | undefined;
    k4?: number | string | undefined;
    k?: number | string | undefined;
    kernelMatrix?:
      | number
      | string
      | undefined;
    kernelUnitLength?:
      | number
      | string
      | undefined;
    kerning?:
      | number
      | string
      | undefined;
    keyPoints?:
      | number
      | string
      | undefined;
    keySplines?:
      | number
      | string
      | undefined;
    keyTimes?:
      | number
      | string
      | undefined;
    lengthAdjust?:
      | number
      | string
      | undefined;
    letterSpacing?:
      | number
      | string
      | undefined;
    "letter-spacing"?:
      | number
      | string
      | undefined;
    lightingColor?:
      | number
      | string
      | undefined;
    "lighting-color"?:
      | number
      | string
      | undefined;
    limitingConeAngle?:
      | number
      | string
      | undefined;
    local?:
      | number
      | string
      | undefined;
    markerEnd?: string | undefined;
    "marker-end"?: string | undefined;
    markerHeight?:
      | number
      | string
      | undefined;
    markerMid?: string | undefined;
    "marker-mid"?: string | undefined;
    markerStart?: string | undefined;
    "marker-start"?: string | undefined;
    markerUnits?:
      | number
      | string
      | undefined;
    markerWidth?:
      | number
      | string
      | undefined;
    mask?: string | undefined;
    maskContentUnits?:
      | number
      | string
      | undefined;
    maskUnits?:
      | number
      | string
      | undefined;
    mathematical?:
      | number
      | string
      | undefined;
    mode?:
      | number
      | string
      | undefined;
    numOctaves?:
      | number
      | string
      | undefined;
    offset?:
      | number
      | string
      | undefined;
    opacity?:
      | number
      | string
      | undefined;
    operator?:
      | number
      | string
      | undefined;
    order?:
      | number
      | string
      | undefined;
    orient?:
      | number
      | string
      | undefined;
    orientation?:
      | number
      | string
      | undefined;
    origin?:
      | number
      | string
      | undefined;
    overflow?:
      | number
      | string
      | undefined;
    overlinePosition?:
      | number
      | string
      | undefined;
    "overline-position"?:
      | number
      | string
      | undefined;
    overlineThickness?:
      | number
      | string
      | undefined;
    "overline-thickness"?:
      | number
      | string
      | undefined;
    paintOrder?:
      | number
      | string
      | undefined;
    "paint-order"?:
      | number
      | string
      | undefined;
    panose1?:
      | number
      | string
      | undefined;
    "panose-1"?:
      | number
      | string
      | undefined;
    pathLength?:
      | number
      | string
      | undefined;
    patternContentUnits?: string | undefined;
    patternTransform?:
      | number
      | string
      | undefined;
    patternUnits?: string | undefined;
    pointerEvents?:
      | number
      | string
      | undefined;
    "pointer-events"?:
      | number
      | string
      | undefined;
    points?: string | undefined;
    pointsAtX?:
      | number
      | string
      | undefined;
    pointsAtY?:
      | number
      | string
      | undefined;
    pointsAtZ?:
      | number
      | string
      | undefined;
    preserveAlpha?:
      | number
      | string
      | undefined;
    preserveAspectRatio?: string | undefined;
    primitiveUnits?:
      | number
      | string
      | undefined;
    r?: number | string | undefined;
    radius?:
      | number
      | string
      | undefined;
    refX?:
      | number
      | string
      | undefined;
    refY?:
      | number
      | string
      | undefined;
    renderingIntent?:
      | number
      | string
      | undefined;
    "rendering-intent"?:
      | number
      | string
      | undefined;
    repeatCount?:
      | number
      | string
      | undefined;
    "repeat-count"?:
      | number
      | string
      | undefined;
    repeatDur?:
      | number
      | string
      | undefined;
    "repeat-dur"?:
      | number
      | string
      | undefined;
    requiredExtensions?:
      | number
      | string
      | undefined;
    requiredFeatures?:
      | number
      | string
      | undefined;
    restart?:
      | number
      | string
      | undefined;
    result?: string | undefined;
    rotate?:
      | number
      | string
      | undefined;
    rx?: number | string | undefined;
    ry?: number | string | undefined;
    scale?:
      | number
      | string
      | undefined;
    seed?:
      | number
      | string
      | undefined;
    shapeRendering?:
      | number
      | string
      | undefined;
    "shape-rendering"?:
      | number
      | string
      | undefined;
    slope?:
      | number
      | string
      | undefined;
    spacing?:
      | number
      | string
      | undefined;
    specularConstant?:
      | number
      | string
      | undefined;
    specularExponent?:
      | number
      | string
      | undefined;
    speed?:
      | number
      | string
      | undefined;
    spreadMethod?: string | undefined;
    startOffset?:
      | number
      | string
      | undefined;
    stdDeviation?:
      | number
      | string
      | undefined;
    stemh?:
      | number
      | string
      | undefined;
    stemv?:
      | number
      | string
      | undefined;
    stitchTiles?:
      | number
      | string
      | undefined;
    stopColor?: string | undefined;
    "stop-color"?: string | undefined;
    stopOpacity?:
      | number
      | string
      | undefined;
    "stop-opacity"?:
      | number
      | string
      | undefined;
    strikethroughPosition?:
      | number
      | string
      | undefined;
    "strikethrough-position"?:
      | number
      | string
      | undefined;
    strikethroughThickness?:
      | number
      | string
      | undefined;
    "strikethrough-thickness"?:
      | number
      | string
      | undefined;
    string?:
      | number
      | string
      | undefined;
    stroke?: string | undefined;
    strokeDasharray?:
      | string
      | number
      | undefined;
    "stroke-dasharray"?:
      | string
      | number
      | undefined;
    strokeDashoffset?:
      | string
      | number
      | undefined;
    "stroke-dashoffset"?:
      | string
      | number
      | undefined;
    strokeLinecap?:
      | "butt"
      | "round"
      | "square"
      | "inherit"
      | undefined;
    "stroke-linecap"?:
      | "butt"
      | "round"
      | "square"
      | "inherit"
      | undefined;
    strokeLinejoin?:
      | "miter"
      | "round"
      | "bevel"
      | "inherit"
      | undefined;
    "stroke-linejoin"?:
      | "miter"
      | "round"
      | "bevel"
      | "inherit"
      | undefined;
    strokeMiterlimit?:
      | string
      | number
      | undefined;
    "stroke-miterlimit"?:
      | string
      | number
      | undefined;
    strokeOpacity?:
      | number
      | string
      | undefined;
    "stroke-opacity"?:
      | number
      | string
      | undefined;
    strokeWidth?:
      | number
      | string
      | undefined;
    "stroke-width"?:
      | number
      | string
      | undefined;
    surfaceScale?:
      | number
      | string
      | undefined;
    systemLanguage?:
      | number
      | string
      | undefined;
    tableValues?:
      | number
      | string
      | undefined;
    targetX?:
      | number
      | string
      | undefined;
    targetY?:
      | number
      | string
      | undefined;
    textAnchor?: string | undefined;
    "text-anchor"?: string | undefined;
    textDecoration?:
      | number
      | string
      | undefined;
    "text-decoration"?:
      | number
      | string
      | undefined;
    textLength?:
      | number
      | string
      | undefined;
    textRendering?:
      | number
      | string
      | undefined;
    to?: number | string | undefined;
    transform?: string | undefined;
    u1?: number | string | undefined;
    u2?: number | string | undefined;
    underlinePosition?:
      | number
      | string
      | undefined;
    "underline-position"?:
      | number
      | string
      | undefined;
    underlineThickness?:
      | number
      | string
      | undefined;
    "underline-thickness"?:
      | number
      | string
      | undefined;
    unicode?:
      | number
      | string
      | undefined;
    unicodeBidi?:
      | number
      | string
      | undefined;
    "unicode-bidi"?:
      | number
      | string
      | undefined;
    unicodeRange?:
      | number
      | string
      | undefined;
    "unicode-range"?:
      | number
      | string
      | undefined;
    unitsPerEm?:
      | number
      | string
      | undefined;
    "units-per-em"?:
      | number
      | string
      | undefined;
    vAlphabetic?:
      | number
      | string
      | undefined;
    "v-alphabetic"?:
      | number
      | string
      | undefined;
    values?: string | undefined;
    vectorEffect?:
      | number
      | string
      | undefined;
    "vector-effect"?:
      | number
      | string
      | undefined;
    version?: string | undefined;
    vertAdvY?:
      | number
      | string
      | undefined;
    "vert-adv-y"?:
      | number
      | string
      | undefined;
    vertOriginX?:
      | number
      | string
      | undefined;
    "vert-origin-x"?:
      | number
      | string
      | undefined;
    vertOriginY?:
      | number
      | string
      | undefined;
    "vert-origin-y"?:
      | number
      | string
      | undefined;
    vHanging?:
      | number
      | string
      | undefined;
    "v-hanging"?:
      | number
      | string
      | undefined;
    vIdeographic?:
      | number
      | string
      | undefined;
    "v-ideographic"?:
      | number
      | string
      | undefined;
    viewBox?: string | undefined;
    viewTarget?:
      | number
      | string
      | undefined;
    visibility?:
      | number
      | string
      | undefined;
    vMathematical?:
      | number
      | string
      | undefined;
    "v-mathematical"?:
      | number
      | string
      | undefined;
    widths?:
      | number
      | string
      | undefined;
    wordSpacing?:
      | number
      | string
      | undefined;
    "word-spacing"?:
      | number
      | string
      | undefined;
    writingMode?:
      | number
      | string
      | undefined;
    "writing-mode"?:
      | number
      | string
      | undefined;
    x1?: number | string | undefined;
    x2?: number | string | undefined;
    x?: number | string | undefined;
    xChannelSelector?: string | undefined;
    xHeight?:
      | number
      | string
      | undefined;
    "x-height"?:
      | number
      | string
      | undefined;
    xlinkActuate?: string | undefined;
    "xlink:actuate"?: SVGAttributes["xlinkActuate"];
    xlinkArcrole?: string | undefined;
    "xlink:arcrole"?: string | undefined;
    xlinkHref?: string | undefined;
    "xlink:href"?: string | undefined;
    xlinkRole?: string | undefined;
    "xlink:role"?: string | undefined;
    xlinkShow?: string | undefined;
    "xlink:show"?: string | undefined;
    xlinkTitle?: string | undefined;
    "xlink:title"?: string | undefined;
    xlinkType?: string | undefined;
    "xlink:type"?: string | undefined;
    xmlBase?: string | undefined;
    "xml:base"?: string | undefined;
    xmlLang?: string | undefined;
    "xml:lang"?: string | undefined;
    xmlns?: string | undefined;
    xmlnsXlink?: string | undefined;
    xmlSpace?: string | undefined;
    "xml:space"?: string | undefined;
    y1?: number | string | undefined;
    y2?: number | string | undefined;
    y?: number | string | undefined;
    yChannelSelector?: string | undefined;
    z?: number | string | undefined;
    zoomAndPan?: string | undefined;
  }

  export interface PathAttributes {
    d: string;
  }

  export type TargetedEvent<
    Target extends EventTarget = EventTarget,
    TypedEvent extends Event = Event,
  > = Omit<TypedEvent, "currentTarget"> & {
    readonly currentTarget: Target;
  };

  export type TargetedAnimationEvent<Target extends EventTarget> =
    TargetedEvent<Target, AnimationEvent>;
  export type TargetedClipboardEvent<Target extends EventTarget> =
    TargetedEvent<Target, ClipboardEvent>;
  export type TargetedCompositionEvent<Target extends EventTarget> =
    TargetedEvent<Target, CompositionEvent>;
  export type TargetedDragEvent<Target extends EventTarget> = TargetedEvent<
    Target,
    DragEvent
  >;
  export type TargetedFocusEvent<Target extends EventTarget> = TargetedEvent<
    Target,
    FocusEvent
  >;
  export type TargetedInputEvent<Target extends EventTarget> = TargetedEvent<
    Target,
    InputEvent
  >;
  export type TargetedKeyboardEvent<Target extends EventTarget> = TargetedEvent<
    Target,
    KeyboardEvent
  >;
  export type TargetedMouseEvent<Target extends EventTarget> = TargetedEvent<
    Target,
    MouseEvent
  >;
  export type TargetedPointerEvent<Target extends EventTarget> = TargetedEvent<
    Target,
    PointerEvent
  >;
  export type TargetedSubmitEvent<Target extends EventTarget> = TargetedEvent<
    Target,
    SubmitEvent
  >;
  export type TargetedTouchEvent<Target extends EventTarget> = TargetedEvent<
    Target,
    TouchEvent
  >;
  export type TargetedTransitionEvent<Target extends EventTarget> =
    TargetedEvent<Target, TransitionEvent>;
  export type TargetedUIEvent<Target extends EventTarget> = TargetedEvent<
    Target,
    UIEvent
  >;
  export type TargetedWheelEvent<Target extends EventTarget> = TargetedEvent<
    Target,
    WheelEvent
  >;
  export type TargetedPictureInPictureEvent<Target extends EventTarget> =
    TargetedEvent<Target, PictureInPictureEvent>;

  export type EventHandler<E extends TargetedEvent> = {
    bivarianceHack(event: E): void;
  }["bivarianceHack"];

  export type AnimationEventHandler<Target extends EventTarget> = EventHandler<
    TargetedAnimationEvent<Target>
  >;
  export type ClipboardEventHandler<Target extends EventTarget> = EventHandler<
    TargetedClipboardEvent<Target>
  >;
  export type CompositionEventHandler<Target extends EventTarget> =
    EventHandler<TargetedCompositionEvent<Target>>;
  export type DragEventHandler<Target extends EventTarget> = EventHandler<
    TargetedDragEvent<Target>
  >;
  export type FocusEventHandler<Target extends EventTarget> = EventHandler<
    TargetedFocusEvent<Target>
  >;
  export type GenericEventHandler<Target extends EventTarget> = EventHandler<
    TargetedEvent<Target>
  >;
  export type InputEventHandler<Target extends EventTarget> = EventHandler<
    TargetedInputEvent<Target>
  >;
  export type KeyboardEventHandler<Target extends EventTarget> = EventHandler<
    TargetedKeyboardEvent<Target>
  >;
  export type MouseEventHandler<Target extends EventTarget> = EventHandler<
    TargetedMouseEvent<Target>
  >;
  export type PointerEventHandler<Target extends EventTarget> = EventHandler<
    TargetedPointerEvent<Target>
  >;
  export type SubmitEventHandler<Target extends EventTarget> = EventHandler<
    TargetedSubmitEvent<Target>
  >;
  export type TouchEventHandler<Target extends EventTarget> = EventHandler<
    TargetedTouchEvent<Target>
  >;
  export type TransitionEventHandler<Target extends EventTarget> = EventHandler<
    TargetedTransitionEvent<Target>
  >;
  export type UIEventHandler<Target extends EventTarget> = EventHandler<
    TargetedUIEvent<Target>
  >;
  export type WheelEventHandler<Target extends EventTarget> = EventHandler<
    TargetedWheelEvent<Target>
  >;
  export type PictureInPictureEventHandler<Target extends EventTarget> =
    EventHandler<TargetedPictureInPictureEvent<Target>>;

  export type DataAttributes = {
    [data in `data-${string}`]?: string | undefined;
  };

  export interface DOMAttributes<Target extends EventTarget> {
    ref?: ((el: Target) => void) | undefined;

    // Image Events
    onLoad?: GenericEventHandler<Target> | undefined;
    onLoadCapture?: GenericEventHandler<Target> | undefined;
    onError?: GenericEventHandler<Target> | undefined;
    onErrorCapture?: GenericEventHandler<Target> | undefined;

    // Clipboard Events
    onCopy?: ClipboardEventHandler<Target> | undefined;
    onCopyCapture?: ClipboardEventHandler<Target> | undefined;
    onCut?: ClipboardEventHandler<Target> | undefined;
    onCutCapture?: ClipboardEventHandler<Target> | undefined;
    onPaste?: ClipboardEventHandler<Target> | undefined;
    onPasteCapture?: ClipboardEventHandler<Target> | undefined;

    // Composition Events
    onCompositionEnd?: CompositionEventHandler<Target> | undefined;
    onCompositionEndCapture?: CompositionEventHandler<Target> | undefined;
    onCompositionStart?: CompositionEventHandler<Target> | undefined;
    onCompositionStartCapture?: CompositionEventHandler<Target> | undefined;
    onCompositionUpdate?: CompositionEventHandler<Target> | undefined;
    onCompositionUpdateCapture?: CompositionEventHandler<Target> | undefined;

    // Details Events
    onToggle?: GenericEventHandler<Target> | undefined;

    // Dialog Events
    onClose?: GenericEventHandler<Target> | undefined;
    onCancel?: GenericEventHandler<Target> | undefined;

    // Focus Events
    onFocus?: FocusEventHandler<Target> | undefined;
    onFocusCapture?: FocusEventHandler<Target> | undefined;
    onfocusin?: FocusEventHandler<Target> | undefined;
    onfocusinCapture?: FocusEventHandler<Target> | undefined;
    onfocusout?: FocusEventHandler<Target> | undefined;
    onfocusoutCapture?: FocusEventHandler<Target> | undefined;
    onBlur?: FocusEventHandler<Target> | undefined;
    onBlurCapture?: FocusEventHandler<Target> | undefined;

    // Form Events
    onChange?: GenericEventHandler<Target> | undefined;
    onChangeCapture?: GenericEventHandler<Target> | undefined;
    onInput?: InputEventHandler<Target> | undefined;
    onInputCapture?: InputEventHandler<Target> | undefined;
    onBeforeInput?: InputEventHandler<Target> | undefined;
    onBeforeInputCapture?: InputEventHandler<Target> | undefined;
    onSearch?: GenericEventHandler<Target> | undefined;
    onSearchCapture?: GenericEventHandler<Target> | undefined;
    onSubmit?: SubmitEventHandler<Target> | undefined;
    onSubmitCapture?: SubmitEventHandler<Target> | undefined;
    onInvalid?: GenericEventHandler<Target> | undefined;
    onInvalidCapture?: GenericEventHandler<Target> | undefined;
    onReset?: GenericEventHandler<Target> | undefined;
    onResetCapture?: GenericEventHandler<Target> | undefined;
    onFormData?: GenericEventHandler<Target> | undefined;
    onFormDataCapture?: GenericEventHandler<Target> | undefined;

    // Keyboard Events
    onKeyDown?: KeyboardEventHandler<Target> | undefined;
    onKeyDownCapture?: KeyboardEventHandler<Target> | undefined;
    onKeyPress?: KeyboardEventHandler<Target> | undefined;
    onKeyPressCapture?: KeyboardEventHandler<Target> | undefined;
    onKeyUp?: KeyboardEventHandler<Target> | undefined;
    onKeyUpCapture?: KeyboardEventHandler<Target> | undefined;

    // Media Events
    onAbort?: GenericEventHandler<Target> | undefined;
    onAbortCapture?: GenericEventHandler<Target> | undefined;
    onCanPlay?: GenericEventHandler<Target> | undefined;
    onCanPlayCapture?: GenericEventHandler<Target> | undefined;
    onCanPlayThrough?: GenericEventHandler<Target> | undefined;
    onCanPlayThroughCapture?: GenericEventHandler<Target> | undefined;
    onDurationChange?: GenericEventHandler<Target> | undefined;
    onDurationChangeCapture?: GenericEventHandler<Target> | undefined;
    onEmptied?: GenericEventHandler<Target> | undefined;
    onEmptiedCapture?: GenericEventHandler<Target> | undefined;
    onEncrypted?: GenericEventHandler<Target> | undefined;
    onEncryptedCapture?: GenericEventHandler<Target> | undefined;
    onEnded?: GenericEventHandler<Target> | undefined;
    onEndedCapture?: GenericEventHandler<Target> | undefined;
    onLoadedData?: GenericEventHandler<Target> | undefined;
    onLoadedDataCapture?: GenericEventHandler<Target> | undefined;
    onLoadedMetadata?: GenericEventHandler<Target> | undefined;
    onLoadedMetadataCapture?: GenericEventHandler<Target> | undefined;
    onLoadStart?: GenericEventHandler<Target> | undefined;
    onLoadStartCapture?: GenericEventHandler<Target> | undefined;
    onPause?: GenericEventHandler<Target> | undefined;
    onPauseCapture?: GenericEventHandler<Target> | undefined;
    onPlay?: GenericEventHandler<Target> | undefined;
    onPlayCapture?: GenericEventHandler<Target> | undefined;
    onPlaying?: GenericEventHandler<Target> | undefined;
    onPlayingCapture?: GenericEventHandler<Target> | undefined;
    onProgress?: GenericEventHandler<Target> | undefined;
    onProgressCapture?: GenericEventHandler<Target> | undefined;
    onRateChange?: GenericEventHandler<Target> | undefined;
    onRateChangeCapture?: GenericEventHandler<Target> | undefined;
    onSeeked?: GenericEventHandler<Target> | undefined;
    onSeekedCapture?: GenericEventHandler<Target> | undefined;
    onSeeking?: GenericEventHandler<Target> | undefined;
    onSeekingCapture?: GenericEventHandler<Target> | undefined;
    onStalled?: GenericEventHandler<Target> | undefined;
    onStalledCapture?: GenericEventHandler<Target> | undefined;
    onSuspend?: GenericEventHandler<Target> | undefined;
    onSuspendCapture?: GenericEventHandler<Target> | undefined;
    onTimeUpdate?: GenericEventHandler<Target> | undefined;
    onTimeUpdateCapture?: GenericEventHandler<Target> | undefined;
    onVolumeChange?: GenericEventHandler<Target> | undefined;
    onVolumeChangeCapture?: GenericEventHandler<Target> | undefined;
    onWaiting?: GenericEventHandler<Target> | undefined;
    onWaitingCapture?: GenericEventHandler<Target> | undefined;

    // MouseEvents
    onClick?: MouseEventHandler<Target> | undefined;
    onClickCapture?: MouseEventHandler<Target> | undefined;
    onContextMenu?: MouseEventHandler<Target> | undefined;
    onContextMenuCapture?: MouseEventHandler<Target> | undefined;
    onDblClick?: MouseEventHandler<Target> | undefined;
    onDblClickCapture?: MouseEventHandler<Target> | undefined;
    onDrag?: DragEventHandler<Target> | undefined;
    onDragCapture?: DragEventHandler<Target> | undefined;
    onDragEnd?: DragEventHandler<Target> | undefined;
    onDragEndCapture?: DragEventHandler<Target> | undefined;
    onDragEnter?: DragEventHandler<Target> | undefined;
    onDragEnterCapture?: DragEventHandler<Target> | undefined;
    onDragExit?: DragEventHandler<Target> | undefined;
    onDragExitCapture?: DragEventHandler<Target> | undefined;
    onDragLeave?: DragEventHandler<Target> | undefined;
    onDragLeaveCapture?: DragEventHandler<Target> | undefined;
    onDragOver?: DragEventHandler<Target> | undefined;
    onDragOverCapture?: DragEventHandler<Target> | undefined;
    onDragStart?: DragEventHandler<Target> | undefined;
    onDragStartCapture?: DragEventHandler<Target> | undefined;
    onDrop?: DragEventHandler<Target> | undefined;
    onDropCapture?: DragEventHandler<Target> | undefined;
    onMouseDown?: MouseEventHandler<Target> | undefined;
    onMouseDownCapture?: MouseEventHandler<Target> | undefined;
    onMouseEnter?: MouseEventHandler<Target> | undefined;
    onMouseEnterCapture?: MouseEventHandler<Target> | undefined;
    onMouseLeave?: MouseEventHandler<Target> | undefined;
    onMouseLeaveCapture?: MouseEventHandler<Target> | undefined;
    onMouseMove?: MouseEventHandler<Target> | undefined;
    onMouseMoveCapture?: MouseEventHandler<Target> | undefined;
    onMouseOut?: MouseEventHandler<Target> | undefined;
    onMouseOutCapture?: MouseEventHandler<Target> | undefined;
    onMouseOver?: MouseEventHandler<Target> | undefined;
    onMouseOverCapture?: MouseEventHandler<Target> | undefined;
    onMouseUp?: MouseEventHandler<Target> | undefined;
    onMouseUpCapture?: MouseEventHandler<Target> | undefined;

    // Selection Events
    onSelect?: GenericEventHandler<Target> | undefined;
    onSelectCapture?: GenericEventHandler<Target> | undefined;

    // Touch Events
    onTouchCancel?: TouchEventHandler<Target> | undefined;
    onTouchCancelCapture?: TouchEventHandler<Target> | undefined;
    onTouchEnd?: TouchEventHandler<Target> | undefined;
    onTouchEndCapture?: TouchEventHandler<Target> | undefined;
    onTouchMove?: TouchEventHandler<Target> | undefined;
    onTouchMoveCapture?: TouchEventHandler<Target> | undefined;
    onTouchStart?: TouchEventHandler<Target> | undefined;
    onTouchStartCapture?: TouchEventHandler<Target> | undefined;

    // Pointer Events
    onPointerOver?: PointerEventHandler<Target> | undefined;
    onPointerOverCapture?: PointerEventHandler<Target> | undefined;
    onPointerEnter?: PointerEventHandler<Target> | undefined;
    onPointerEnterCapture?: PointerEventHandler<Target> | undefined;
    onPointerDown?: PointerEventHandler<Target> | undefined;
    onPointerDownCapture?: PointerEventHandler<Target> | undefined;
    onPointerMove?: PointerEventHandler<Target> | undefined;
    onPointerMoveCapture?: PointerEventHandler<Target> | undefined;
    onPointerUp?: PointerEventHandler<Target> | undefined;
    onPointerUpCapture?: PointerEventHandler<Target> | undefined;
    onPointerCancel?: PointerEventHandler<Target> | undefined;
    onPointerCancelCapture?: PointerEventHandler<Target> | undefined;
    onPointerOut?: PointerEventHandler<Target> | undefined;
    onPointerOutCapture?: PointerEventHandler<Target> | undefined;
    onPointerLeave?: PointerEventHandler<Target> | undefined;
    onPointerLeaveCapture?: PointerEventHandler<Target> | undefined;
    onGotPointerCapture?: PointerEventHandler<Target> | undefined;
    onGotPointerCaptureCapture?: PointerEventHandler<Target> | undefined;
    onLostPointerCapture?: PointerEventHandler<Target> | undefined;
    onLostPointerCaptureCapture?: PointerEventHandler<Target> | undefined;

    // UI Events
    onScroll?: UIEventHandler<Target> | undefined;
    onScrollCapture?: UIEventHandler<Target> | undefined;

    // Wheel Events
    onWheel?: WheelEventHandler<Target> | undefined;
    onWheelCapture?: WheelEventHandler<Target> | undefined;

    // Animation Events
    onAnimationStart?: AnimationEventHandler<Target> | undefined;
    onAnimationStartCapture?: AnimationEventHandler<Target> | undefined;
    onAnimationEnd?: AnimationEventHandler<Target> | undefined;
    onAnimationEndCapture?: AnimationEventHandler<Target> | undefined;
    onAnimationIteration?: AnimationEventHandler<Target> | undefined;
    onAnimationIterationCapture?: AnimationEventHandler<Target> | undefined;

    // Transition Events
    onTransitionCancel?: TransitionEventHandler<Target>;
    onTransitionCancelCapture?: TransitionEventHandler<Target>;
    onTransitionEnd?: TransitionEventHandler<Target>;
    onTransitionEndCapture?: TransitionEventHandler<Target>;
    onTransitionRun?: TransitionEventHandler<Target>;
    onTransitionRunCapture?: TransitionEventHandler<Target>;
    onTransitionStart?: TransitionEventHandler<Target>;
    onTransitionStartCapture?: TransitionEventHandler<Target>;

    // PictureInPicture Events
    onEnterPictureInPicture?: PictureInPictureEventHandler<Target>;
    onEnterPictureInPictureCapture?: PictureInPictureEventHandler<Target>;
    onLeavePictureInPicture?: PictureInPictureEventHandler<Target>;
    onLeavePictureInPictureCapture?: PictureInPictureEventHandler<Target>;
    onResize?: PictureInPictureEventHandler<Target>;
    onResizeCapture?: PictureInPictureEventHandler<Target>;
  }

  // All the WAI-ARIA 1.1 attributes from https://www.w3.org/TR/wai-aria-1.1/
  export interface AriaAttributes {
    /** Identifies the currently active element when DOM focus is on a composite widget, textbox, group, or application. */
    "aria-activedescendant"?: string | undefined;
    /** Indicates whether assistive technologies will present all, or only parts of, the changed region based on the change notifications defined by the aria-relevant attribute. */
    "aria-atomic"?: Booleanish | undefined;
    /**
     * Indicates whether inputting text could trigger display of one or more predictions of the user's intended value for an input and specifies how predictions would be
     * presented if they are made.
     */
    "aria-autocomplete"?: "none" | "inline" | "list" | "both" | undefined;
    /**
     * Defines a string value that labels the current element, which is intended to be converted into Braille.
     * @see aria-label.
     */
    "aria-braillelabel"?: string | undefined;
    /**
     * Defines a human-readable, author-localized abbreviated description for the role of an element, which is intended to be converted into Braille.
     * @see aria-roledescription.
     */
    "aria-brailleroledescription"?: string | undefined;
    /** Indicates an element is being modified and that assistive technologies MAY want to wait until the modifications are complete before exposing them to the user. */
    "aria-busy"?: Booleanish | undefined;
    /**
     * Indicates the current "checked" state of checkboxes, radio buttons, and other widgets.
     * @see aria-pressed
     * @see aria-selected.
     */
    "aria-checked"?: Booleanish | "mixed" | undefined;
    /**
     * Defines the total number of columns in a table, grid, or treegrid.
     * @see aria-colindex.
     */
    "aria-colcount"?: number | undefined;
    /**
     * Defines an element's column index or position with respect to the total number of columns within a table, grid, or treegrid.
     * @see aria-colcount
     * @see aria-colspan.
     */
    "aria-colindex"?: number | undefined;
    /**
     * Defines a human readable text alternative of aria-colindex.
     * @see aria-rowindextext.
     */
    "aria-colindextext"?: string | undefined;
    /**
     * Defines the number of columns spanned by a cell or gridcell within a table, grid, or treegrid.
     * @see aria-colindex
     * @see aria-rowspan.
     */
    "aria-colspan"?: number | undefined;
    /**
     * Identifies the element (or elements) whose contents or presence are controlled by the current element.
     * @see aria-owns.
     */
    "aria-controls"?: string | undefined;
    /** Indicates the element that represents the current item within a container or set of related elements. */
    "aria-current"?:
      | Booleanish
      | "page"
      | "step"
      | "location"
      | "date"
      | "time"
      | undefined;
    /**
     * Identifies the element (or elements) that describes the object.
     * @see aria-labelledby
     */
    "aria-describedby"?: string | undefined;
    /**
     * Defines a string value that describes or annotates the current element.
     * @see related aria-describedby.
     */
    "aria-description"?: string | undefined;
    /**
     * Identifies the element that provides a detailed, extended description for the object.
     * @see aria-describedby.
     */
    "aria-details"?: string | undefined;
    /**
     * Indicates that the element is perceivable but disabled, so it is not editable or otherwise operable.
     * @see aria-hidden
     * @see aria-readonly.
     */
    "aria-disabled"?: Booleanish | undefined;
    /**
     * Indicates what functions can be performed when a dragged object is released on the drop target.
     * @deprecated in ARIA 1.1
     */
    "aria-dropeffect"?:
      | "none"
      | "copy"
      | "execute"
      | "link"
      | "move"
      | "popup"
      | undefined;
    /**
     * Identifies the element that provides an error message for the object.
     * @see aria-invalid
     * @see aria-describedby.
     */
    "aria-errormessage"?: string | undefined;
    /** Indicates whether the element, or another grouping element it controls, is currently expanded or collapsed. */
    "aria-expanded"?: Booleanish | undefined;
    /**
     * Identifies the next element (or elements) in an alternate reading order of content which, at the user's discretion,
     * allows assistive technology to override the general default of reading in document source order.
     */
    "aria-flowto"?: string | undefined;
    /**
     * Indicates an element's "grabbed" state in a drag-and-drop operation.
     * @deprecated in ARIA 1.1
     */
    "aria-grabbed"?: Booleanish | undefined;
    /** Indicates the availability and type of interactive popup element, such as menu or dialog, that can be triggered by an element. */
    "aria-haspopup"?:
      | Booleanish
      | "menu"
      | "listbox"
      | "tree"
      | "grid"
      | "dialog"
      | undefined;
    /**
     * Indicates whether the element is exposed to an accessibility API.
     * @see aria-disabled.
     */
    "aria-hidden"?: Booleanish | undefined;
    /**
     * Indicates the entered value does not conform to the format expected by the application.
     * @see aria-errormessage.
     */
    "aria-invalid"?: Booleanish | "grammar" | "spelling" | undefined;
    /** Indicates keyboard shortcuts that an author has implemented to activate or give focus to an element. */
    "aria-keyshortcuts"?: string | undefined;
    /**
     * Defines a string value that labels the current element.
     * @see aria-labelledby.
     */
    "aria-label"?: string | undefined;
    /**
     * Identifies the element (or elements) that labels the current element.
     * @see aria-describedby.
     */
    "aria-labelledby"?: string | undefined;
    /** Defines the hierarchical level of an element within a structure. */
    "aria-level"?: number | undefined;
    /** Indicates that an element will be updated, and describes the types of updates the user agents, assistive technologies, and user can expect from the live region. */
    "aria-live"?: "off" | "assertive" | "polite" | undefined;
    /** Indicates whether an element is modal when displayed. */
    "aria-modal"?: Booleanish | undefined;
    /** Indicates whether a text box accepts multiple lines of input or only a single line. */
    "aria-multiline"?: Booleanish | undefined;
    /** Indicates that the user may select more than one item from the current selectable descendants. */
    "aria-multiselectable"?: Booleanish | undefined;
    /** Indicates whether the element's orientation is horizontal, vertical, or unknown/ambiguous. */
    "aria-orientation"?: "horizontal" | "vertical" | undefined;
    /**
     * Identifies an element (or elements) in order to define a visual, functional, or contextual parent/child relationship
     * between DOM elements where the DOM hierarchy cannot be used to represent the relationship.
     * @see aria-controls.
     */
    "aria-owns"?: string | undefined;
    /**
     * Defines a short hint (a word or short phrase) intended to aid the user with data entry when the control has no value.
     * A hint could be a sample value or a brief description of the expected format.
     */
    "aria-placeholder"?: string | undefined;
    /**
     * Defines an element's number or position in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
     * @see aria-setsize.
     */
    "aria-posinset"?: number | undefined;
    /**
     * Indicates the current "pressed" state of toggle buttons.
     * @see aria-checked
     * @see aria-selected.
     */
    "aria-pressed"?: Booleanish | "mixed" | undefined;
    /**
     * Indicates that the element is not editable, but is otherwise operable.
     * @see aria-disabled.
     */
    "aria-readonly"?: Booleanish | undefined;
    /**
     * Indicates what notifications the user agent will trigger when the accessibility tree within a live region is modified.
     * @see aria-atomic.
     */
    "aria-relevant"?:
      | "additions"
      | "additions removals"
      | "additions text"
      | "all"
      | "removals"
      | "removals additions"
      | "removals text"
      | "text"
      | "text additions"
      | "text removals"
      | undefined;
    /** Indicates that user input is required on the element before a form may be submitted. */
    "aria-required"?: Booleanish | undefined;
    /** Defines a human-readable, author-localized description for the role of an element. */
    "aria-roledescription"?: string | undefined;
    /**
     * Defines the total number of rows in a table, grid, or treegrid.
     * @see aria-rowindex.
     */
    "aria-rowcount"?: number | undefined;
    /**
     * Defines an element's row index or position with respect to the total number of rows within a table, grid, or treegrid.
     * @see aria-rowcount
     * @see aria-rowspan.
     */
    "aria-rowindex"?: number | undefined;
    /**
     * Defines a human readable text alternative of aria-rowindex.
     * @see aria-colindextext.
     */
    "aria-rowindextext"?: string | undefined;
    /**
     * Defines the number of rows spanned by a cell or gridcell within a table, grid, or treegrid.
     * @see aria-rowindex
     * @see aria-colspan.
     */
    "aria-rowspan"?: number | undefined;
    /**
     * Indicates the current "selected" state of various widgets.
     * @see aria-checked
     * @see aria-pressed.
     */
    "aria-selected"?: Booleanish | undefined;
    /**
     * Defines the number of items in the current set of listitems or treeitems. Not required if all elements in the set are present in the DOM.
     * @see aria-posinset.
     */
    "aria-setsize"?: number | undefined;
    /** Indicates if items in a table or grid are sorted in ascending or descending order. */
    "aria-sort"?: "none" | "ascending" | "descending" | "other" | undefined;
    /** Defines the maximum allowed value for a range widget. */
    "aria-valuemax"?: number | undefined;
    /** Defines the minimum allowed value for a range widget. */
    "aria-valuemin"?: number | undefined;
    /**
     * Defines the current value for a range widget.
     * @see aria-valuetext.
     */
    "aria-valuenow"?: number | undefined;
    /** Defines the human readable text alternative of aria-valuenow for a range widget. */
    "aria-valuetext"?: string | undefined;
  }

  // All the WAI-ARIA 1.2 role attribute values from https://www.w3.org/TR/wai-aria-1.2/#role_definitions
  type AriaRole =
    | "alert"
    | "alertdialog"
    | "application"
    | "article"
    | "banner"
    | "blockquote"
    | "button"
    | "caption"
    | "cell"
    | "checkbox"
    | "code"
    | "columnheader"
    | "combobox"
    | "command"
    | "complementary"
    | "composite"
    | "contentinfo"
    | "definition"
    | "deletion"
    | "dialog"
    | "directory"
    | "document"
    | "emphasis"
    | "feed"
    | "figure"
    | "form"
    | "generic"
    | "grid"
    | "gridcell"
    | "group"
    | "heading"
    | "img"
    | "input"
    | "insertion"
    | "landmark"
    | "link"
    | "list"
    | "listbox"
    | "listitem"
    | "log"
    | "main"
    | "marquee"
    | "math"
    | "meter"
    | "menu"
    | "menubar"
    | "menuitem"
    | "menuitemcheckbox"
    | "menuitemradio"
    | "navigation"
    | "none"
    | "note"
    | "option"
    | "paragraph"
    | "presentation"
    | "progressbar"
    | "radio"
    | "radiogroup"
    | "range"
    | "region"
    | "roletype"
    | "row"
    | "rowgroup"
    | "rowheader"
    | "scrollbar"
    | "search"
    | "searchbox"
    | "section"
    | "sectionhead"
    | "select"
    | "separator"
    | "slider"
    | "spinbutton"
    | "status"
    | "strong"
    | "structure"
    | "subscript"
    | "superscript"
    | "switch"
    | "tab"
    | "table"
    | "tablist"
    | "tabpanel"
    | "term"
    | "textbox"
    | "time"
    | "timer"
    | "toolbar"
    | "tooltip"
    | "tree"
    | "treegrid"
    | "treeitem"
    | "widget"
    | "window"
    | "none presentation";

  export interface HTMLAttributes<RefType extends EventTarget = EventTarget>
    extends
      // ClassAttributes<RefType>,
      DOMAttributes<RefType>,
      DataAttributes,
      AriaAttributes {
    // Standard HTML Attributes
    accept?: string | undefined;
    acceptCharset?: string | undefined;
    "accept-charset"?: HTMLAttributes["acceptCharset"];
    accessKey?: string | undefined;
    accesskey?: HTMLAttributes["accessKey"];
    action?: string | undefined;
    allow?: string | undefined;
    allowFullScreen?: boolean | undefined;
    allowTransparency?: boolean | undefined;
    alt?: string | undefined;
    as?: string | undefined;
    async?: boolean | undefined;
    autocomplete?: string | undefined;
    autoComplete?: string | undefined;
    autocorrect?: string | undefined;
    autoCorrect?: string | undefined;
    autofocus?: boolean | undefined;
    autoFocus?: boolean | undefined;
    autoPlay?: boolean | undefined;
    autoplay?: boolean | undefined;
    capture?: boolean | string | undefined;
    cellPadding?: number | string | undefined;
    cellSpacing?: number | string | undefined;
    charSet?: string | undefined;
    charset?: string | undefined;
    challenge?: string | undefined;
    checked?: boolean | undefined;
    cite?: string | undefined;
    class?: string | undefined;
    className?: string | undefined;
    cols?: number | undefined;
    colSpan?: number | undefined;
    colspan?: number | undefined;
    content?: string | undefined;
    contentEditable?:
      | Booleanish
      | ""
      | "plaintext-only"
      | "inherit"
      | undefined;
    contenteditable?: HTMLAttributes["contentEditable"];
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/contextmenu */
    contextMenu?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/contextmenu */
    contextmenu?: string | undefined;
    controls?: boolean | undefined;
    controlsList?: string | undefined;
    coords?: string | undefined;
    crossOrigin?: string | undefined;
    crossorigin?: string | undefined;
    data?: string | undefined;
    dateTime?: string | undefined;
    datetime?: string | undefined;
    default?: boolean | undefined;
    defaultChecked?: boolean | undefined;
    defaultValue?: string | undefined;
    defer?: boolean | undefined;
    dir?:
      | "auto"
      | "rtl"
      | "ltr"
      | undefined;
    disabled?: boolean | undefined;
    disableRemotePlayback?:
      | boolean
      | undefined;
    download?: any | undefined;
    decoding?:
      | "sync"
      | "async"
      | "auto"
      | undefined;
    draggable?: boolean | undefined;
    encType?: string | undefined;
    enctype?: string | undefined;
    enterkeyhint?:
      | "enter"
      | "done"
      | "go"
      | "next"
      | "previous"
      | "search"
      | "send"
      | undefined;
    elementTiming?: string | undefined;
    elementtiming?: HTMLAttributes["elementTiming"];
    exportparts?: string | undefined;
    for?: string | undefined;
    form?: string | undefined;
    formAction?: string | undefined;
    formaction?: string | undefined;
    formEncType?: string | undefined;
    formenctype?: string | undefined;
    formMethod?: string | undefined;
    formmethod?: string | undefined;
    formNoValidate?: boolean | undefined;
    formnovalidate?: boolean | undefined;
    formTarget?: string | undefined;
    formtarget?: string | undefined;
    frameBorder?:
      | number
      | string
      | undefined;
    frameborder?:
      | number
      | string
      | undefined;
    headers?: string | undefined;
    height?:
      | number
      | string
      | undefined;
    hidden?:
      | boolean
      | "hidden"
      | "until-found"
      | undefined;
    high?: number | undefined;
    href?: string | undefined;
    hrefLang?: string | undefined;
    hreflang?: string | undefined;
    htmlFor?: string | undefined;
    httpEquiv?: string | undefined;
    "http-equiv"?: string | undefined;
    icon?: string | undefined;
    id?: string | undefined;
    indeterminate?: boolean | undefined;
    inert?: boolean | undefined;
    inputMode?: string | undefined;
    inputmode?: string | undefined;
    integrity?: string | undefined;
    is?: string | undefined;
    keyParams?: string | undefined;
    keyType?: string | undefined;
    kind?: string | undefined;
    label?: string | undefined;
    lang?: string | undefined;
    list?: string | undefined;
    loading?:
      | "eager"
      | "lazy"
      | undefined;
    loop?: boolean | undefined;
    low?: number | undefined;
    manifest?: string | undefined;
    marginHeight?: number | undefined;
    marginWidth?: number | undefined;
    max?: number | string | undefined;
    maxLength?: number | undefined;
    maxlength?: number | undefined;
    media?: string | undefined;
    mediaGroup?: string | undefined;
    method?: string | undefined;
    min?: number | string | undefined;
    minLength?: number | undefined;
    minlength?: number | undefined;
    multiple?: boolean | undefined;
    muted?: boolean | undefined;
    name?: string | undefined;
    nomodule?: boolean | undefined;
    nonce?: string | undefined;
    noValidate?: boolean | undefined;
    novalidate?: boolean | undefined;
    open?: boolean | undefined;
    optimum?: number | undefined;
    part?: string | undefined;
    pattern?: string | undefined;
    ping?: string | undefined;
    placeholder?: string | undefined;
    playsInline?: boolean | undefined;
    playsinline?: boolean | undefined;
    poster?: string | undefined;
    preload?: string | undefined;
    radioGroup?: string | undefined;
    readonly?: boolean | undefined;
    readOnly?: boolean | undefined;
    referrerpolicy?:
      | "no-referrer"
      | "no-referrer-when-downgrade"
      | "origin"
      | "origin-when-cross-origin"
      | "same-origin"
      | "strict-origin"
      | "strict-origin-when-cross-origin"
      | "unsafe-url"
      | undefined;
    rel?: string | undefined;
    required?: boolean | undefined;
    reversed?: boolean | undefined;
    role?: AriaRole | undefined;
    rows?: number | undefined;
    rowSpan?: number | undefined;
    rowspan?: number | undefined;
    sandbox?: string | undefined;
    scope?: string | undefined;
    scoped?: boolean | undefined;
    scrolling?: string | undefined;
    seamless?: boolean | undefined;
    selected?: boolean | undefined;
    shape?: string | undefined;
    size?: number | undefined;
    sizes?: string | undefined;
    slot?: string | undefined;
    span?: number | undefined;
    spellcheck?: boolean | undefined;
    spellCheck?: boolean | undefined;
    src?: string | undefined;
    srcSet?: string | undefined;
    srcset?: string | undefined;
    srcDoc?: string | undefined;
    srcdoc?: string | undefined;
    srcLang?: string | undefined;
    srclang?: string | undefined;
    start?: number | undefined;
    step?:
      | number
      | string
      | undefined;
    style?:
      | string
      | CSSProperties
      | undefined;
    summary?: string | undefined;
    tabIndex?: number | undefined;
    tabindex?: number | undefined;
    target?: string | undefined;
    title?: string | undefined;
    type?: string | undefined;
    useMap?: string | undefined;
    usemap?: string | undefined;
    value?:
      | string
      | string[]
      | number
      | undefined;
    volume?:
      | string
      | number
      | undefined;
    width?:
      | number
      | string
      | undefined;
    wmode?: string | undefined;
    wrap?: string | undefined;

    // Non-standard Attributes
    autocapitalize?:
      | "off"
      | "none"
      | "on"
      | "sentences"
      | "words"
      | "characters"
      | undefined;
    autoCapitalize?:
      | "off"
      | "none"
      | "on"
      | "sentences"
      | "words"
      | "characters"
      | undefined;
    disablePictureInPicture?:
      | boolean
      | undefined;
    results?: number | undefined;
    translate?: "yes" | "no" | undefined;

    // RDFa Attributes
    about?: string | undefined;
    datatype?: string | undefined;
    inlist?: any;
    prefix?: string | undefined;
    property?: string | undefined;
    resource?: string | undefined;
    typeof?: string | undefined;
    vocab?: string | undefined;

    // Microdata Attributes
    itemProp?: string | undefined;
    itemprop?: string | undefined;
    itemScope?: boolean | undefined;
    itemscope?: boolean | undefined;
    itemType?: string | undefined;
    itemtype?: string | undefined;
    itemID?: string | undefined;
    itemid?: string | undefined;
    itemRef?: string | undefined;
    itemref?: string | undefined;
  }

  export type DetailedHTMLProps<
    HA extends HTMLAttributes<RefType>,
    RefType extends EventTarget = EventTarget,
  > = HA;

  export interface HTMLMarqueeElement extends HTMLElement {
    behavior?:
      | "scroll"
      | "slide"
      | "alternate"
      | undefined;
    bgColor?: string | undefined;
    direction?:
      | "left"
      | "right"
      | "up"
      | "down"
      | undefined;
    height?:
      | number
      | string
      | undefined;
    hspace?:
      | number
      | string
      | undefined;
    loop?:
      | number
      | string
      | undefined;
    scrollAmount?:
      | number
      | string
      | undefined;
    scrollDelay?:
      | number
      | string
      | undefined;
    trueSpeed?: boolean | undefined;
    vspace?:
      | number
      | string
      | undefined;
    width?:
      | number
      | string
      | undefined;
  }

  export interface MathMLAttributes<Target extends EventTarget = MathMLElement>
    extends HTMLAttributes<Target> {
    dir?: "ltr" | "rtl" | undefined;
    displaystyle?: boolean | undefined;
    /** @deprecated This feature is non-standard. See https://developer.mozilla.org/en-US/docs/Web/MathML/Global_attributes/href  */
    href?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Global_attributes/mathbackground */
    mathbackground?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Global_attributes/mathcolor */
    mathcolor?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Global_attributes/mathsize */
    mathsize?: string | undefined;
    nonce?: string | undefined;
    scriptlevel?: string | undefined;
  }

  export interface HTMLAnnotationElement extends MathMLElement {
    encoding?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/semantics#src */
    src?: string | undefined;
  }

  export interface HTMLAnnotationXmlElement extends MathMLElement {
    encoding?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/semantics#src */
    src?: string | undefined;
  }

  export interface HTMLMActionElement extends MathMLElement {
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/maction#actiontype */
    actiontype?:
      | "statusline"
      | "toggle"
      | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/maction#selection */
    selection?: string | undefined;
  }

  export interface HTMLMathElement extends MathMLElement {
    display?:
      | "block"
      | "inline"
      | undefined;
  }

  export interface HTMLMEncloseElement extends MathMLElement {
    notation?: string | undefined;
  }

  export interface HTMLMErrorElement extends MathMLElement {}

  export interface HTMLMFencedElement extends MathMLElement {
    close?: string | undefined;
    open?: string | undefined;
    separators?: string | undefined;
  }

  export interface HTMLMFracElement extends MathMLElement {
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mfrac#denomalign */
    denomalign?:
      | "center"
      | "left"
      | "right"
      | undefined;
    linethickness?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mfrac#numalign */
    numalign?:
      | "center"
      | "left"
      | "right"
      | undefined;
  }

  export interface HTMLMiElement extends MathMLElement {
    /** The only value allowed in the current specification is normal (case insensitive)
     * See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mi#mathvariant */
    mathvariant?:
      | "normal"
      | "bold"
      | "italic"
      | "bold-italic"
      | "double-struck"
      | "bold-fraktur"
      | "script"
      | "bold-script"
      | "fraktur"
      | "sans-serif"
      | "bold-sans-serif"
      | "sans-serif-italic"
      | "sans-serif-bold-italic"
      | "monospace"
      | "initial"
      | "tailed"
      | "looped"
      | "stretched"
      | undefined;
  }

  export interface HTMLMmultiScriptsElement extends MathMLElement {
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mmultiscripts#subscriptshift */
    subscriptshift?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mmultiscripts#superscriptshift */
    superscriptshift?: string | undefined;
  }

  export interface HTMLMNElement extends MathMLElement {}

  export interface HTMLMOElement extends MathMLElement {
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mo#accent */
    accent?: boolean | undefined;
    fence?: boolean | undefined;
    largeop?: boolean | undefined;
    lspace?: string | undefined;
    maxsize?: string | undefined;
    minsize?: string | undefined;
    movablelimits?: boolean | undefined;
    rspace?: string | undefined;
    separator?: boolean | undefined;
    stretchy?: boolean | undefined;
    symmetric?: boolean | undefined;
  }

  export interface HTMLMOverElement extends MathMLElement {
    accent?: boolean | undefined;
  }

  export interface HTMLMPaddedElement extends MathMLElement {
    depth?: string | undefined;
    height?: string | undefined;
    lspace?: string | undefined;
    voffset?: string | undefined;
    width?: string | undefined;
  }

  export interface HTMLMPhantomElement extends MathMLElement {}

  export interface HTMLMPrescriptsElement extends MathMLElement {}

  export interface HTMLMRootElement extends MathMLElement {}

  export interface HTMLMRowElement extends MathMLElement {}

  export interface HTMLMSElement extends MathMLElement {
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/ms#browser_compatibility */
    lquote?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/ms#browser_compatibility */
    rquote?: string | undefined;
  }

  export interface HTMLMSpaceElement extends MathMLElement {
    depth?: string | undefined;
    height?: string | undefined;
    width?: string | undefined;
  }

  export interface HTMLMSqrtElement extends MathMLElement {}

  export interface HTMLMStyleElement extends MathMLElement {
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mstyle#background */
    background?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mstyle#color */
    color?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mstyle#fontsize */
    fontsize?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mstyle#fontstyle */
    fontstyle?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mstyle#fontweight */
    fontweight?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mstyle#scriptminsize */
    scriptminsize?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mstyle#scriptsizemultiplier */
    scriptsizemultiplier?: string | undefined;
  }

  export interface HTMLMSubElement extends MathMLElement {
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/msub#subscriptshift */
    subscriptshift?: string | undefined;
  }

  export interface HTMLMSubsupElement extends MathMLElement {
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/msubsup#subscriptshift */
    subscriptshift?: string | undefined;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/msubsup#superscriptshift */
    superscriptshift?: string | undefined;
  }

  export interface HTMLMSupElement extends MathMLElement {
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/msup#superscriptshift */
    superscriptshift?: string | undefined;
  }

  export interface HTMLMTableElement extends MathMLElement {
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mtable#align */
    align?:
      | "axis"
      | "baseline"
      | "bottom"
      | "center"
      | "top"
      | undefined;
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mtable#columnalign */
    columnalign?:
      | "center"
      | "left"
      | "right"
      | undefined;
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mtable#columnlines */
    columnlines?:
      | "dashed"
      | "none"
      | "solid"
      | undefined;
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mtable#columnspacing */
    columnspacing?: string | undefined;
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mtable#frame */
    frame?:
      | "dashed"
      | "none"
      | "solid"
      | undefined;
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mtable#framespacing */
    framespacing?: string | undefined;
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mtable#rowalign */
    rowalign?:
      | "axis"
      | "baseline"
      | "bottom"
      | "center"
      | "top"
      | undefined;
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mtable#rowlines */
    rowlines?:
      | "dashed"
      | "none"
      | "solid"
      | undefined;
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mtable#rowspacing */
    rowspacing?: string | undefined;
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mtable#width */
    width?: string | undefined;
  }

  export interface HTMLMTdElement extends MathMLElement {
    columnspan?: number | undefined;
    rowspan?: number | undefined;
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mtd#columnalign */
    columnalign?:
      | "center"
      | "left"
      | "right"
      | undefined;
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mtd#rowalign */
    rowalign?:
      | "axis"
      | "baseline"
      | "bottom"
      | "center"
      | "top"
      | undefined;
  }

  export interface HTMLMTextElement extends MathMLElement {}

  export interface HTMLMTrElement extends MathMLElement {
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mtr#columnalign */
    columnalign?:
      | "center"
      | "left"
      | "right"
      | undefined;
    /** Non-standard attribute See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mtr#rowalign */
    rowalign?:
      | "axis"
      | "baseline"
      | "bottom"
      | "center"
      | "top"
      | undefined;
  }

  export interface HTMLMUnderElement extends MathMLElement {
    accentunder?: boolean | undefined;
  }

  export interface HTMLMUnderoverElement extends MathMLElement {
    accent?: boolean | undefined;
    accentunder?: boolean | undefined;
  }

  export interface HTMLSemanticsElement extends MathMLElement {}

  export interface IntrinsicElements {
    // HTML
    a: HTMLAttributes<HTMLAnchorElement>;
    abbr: HTMLAttributes<HTMLElement>;
    address: HTMLAttributes<HTMLElement>;
    area: HTMLAttributes<HTMLAreaElement>;
    article: HTMLAttributes<HTMLElement>;
    aside: HTMLAttributes<HTMLElement>;
    audio: HTMLAttributes<HTMLAudioElement>;
    b: HTMLAttributes<HTMLElement>;
    base: HTMLAttributes<HTMLBaseElement>;
    bdi: HTMLAttributes<HTMLElement>;
    bdo: HTMLAttributes<HTMLElement>;
    big: HTMLAttributes<HTMLElement>;
    blockquote: HTMLAttributes<HTMLQuoteElement>;
    body: HTMLAttributes<HTMLBodyElement>;
    br: HTMLAttributes<HTMLBRElement>;
    button: HTMLAttributes<HTMLButtonElement>;
    canvas: HTMLAttributes<HTMLCanvasElement>;
    caption: HTMLAttributes<HTMLTableCaptionElement>;
    cite: HTMLAttributes<HTMLElement>;
    code: HTMLAttributes<HTMLElement>;
    col: HTMLAttributes<HTMLTableColElement>;
    colgroup: HTMLAttributes<HTMLTableColElement>;
    data: HTMLAttributes<HTMLDataElement>;
    datalist: HTMLAttributes<HTMLDataListElement>;
    dd: HTMLAttributes<HTMLElement>;
    del: HTMLAttributes<HTMLModElement>;
    details: HTMLAttributes<HTMLDetailsElement>;
    dfn: HTMLAttributes<HTMLElement>;
    dialog: HTMLAttributes<HTMLDialogElement>;
    div: HTMLAttributes<HTMLDivElement>;
    dl: HTMLAttributes<HTMLDListElement>;
    dt: HTMLAttributes<HTMLElement>;
    em: HTMLAttributes<HTMLElement>;
    embed: HTMLAttributes<HTMLEmbedElement>;
    fieldset: HTMLAttributes<HTMLFieldSetElement>;
    figcaption: HTMLAttributes<HTMLElement>;
    figure: HTMLAttributes<HTMLElement>;
    footer: HTMLAttributes<HTMLElement>;
    form: HTMLAttributes<HTMLFormElement>;
    h1: HTMLAttributes<HTMLHeadingElement>;
    h2: HTMLAttributes<HTMLHeadingElement>;
    h3: HTMLAttributes<HTMLHeadingElement>;
    h4: HTMLAttributes<HTMLHeadingElement>;
    h5: HTMLAttributes<HTMLHeadingElement>;
    h6: HTMLAttributes<HTMLHeadingElement>;
    head: HTMLAttributes<HTMLHeadElement>;
    header: HTMLAttributes<HTMLElement>;
    hgroup: HTMLAttributes<HTMLElement>;
    hr: HTMLAttributes<HTMLHRElement>;
    html: HTMLAttributes<HTMLHtmlElement>;
    i: HTMLAttributes<HTMLElement>;
    iframe: HTMLAttributes<HTMLIFrameElement>;
    img: HTMLAttributes<HTMLImageElement>;
    input: HTMLAttributes<HTMLInputElement>;
    ins: HTMLAttributes<HTMLModElement>;
    kbd: HTMLAttributes<HTMLElement>;
    keygen: HTMLAttributes<HTMLUnknownElement>;
    label: HTMLAttributes<HTMLLabelElement>;
    legend: HTMLAttributes<HTMLLegendElement>;
    li: HTMLAttributes<HTMLLIElement>;
    link: HTMLAttributes<HTMLLinkElement>;
    main: HTMLAttributes<HTMLElement>;
    map: HTMLAttributes<HTMLMapElement>;
    mark: HTMLAttributes<HTMLElement>;
    marquee: HTMLAttributes<HTMLMarqueeElement>;
    menu: HTMLAttributes<HTMLMenuElement>;
    menuitem: HTMLAttributes<HTMLUnknownElement>;
    meta: HTMLAttributes<HTMLMetaElement>;
    meter: HTMLAttributes<HTMLMeterElement>;
    nav: HTMLAttributes<HTMLElement>;
    noscript: HTMLAttributes<HTMLElement>;
    object: HTMLAttributes<HTMLObjectElement>;
    ol: HTMLAttributes<HTMLOListElement>;
    optgroup: HTMLAttributes<HTMLOptGroupElement>;
    option: HTMLAttributes<HTMLOptionElement>;
    output: HTMLAttributes<HTMLOutputElement>;
    p: HTMLAttributes<HTMLParagraphElement>;
    param: HTMLAttributes<HTMLParamElement>;
    picture: HTMLAttributes<HTMLPictureElement>;
    pre: HTMLAttributes<HTMLPreElement>;
    progress: HTMLAttributes<HTMLProgressElement>;
    q: HTMLAttributes<HTMLQuoteElement>;
    rp: HTMLAttributes<HTMLElement>;
    rt: HTMLAttributes<HTMLElement>;
    ruby: HTMLAttributes<HTMLElement>;
    s: HTMLAttributes<HTMLElement>;
    samp: HTMLAttributes<HTMLElement>;
    script: HTMLAttributes<HTMLScriptElement>;
    search: HTMLAttributes<HTMLElement>;
    section: HTMLAttributes<HTMLElement>;
    select: HTMLAttributes<HTMLSelectElement>;
    slot: HTMLAttributes<HTMLSlotElement>;
    small: HTMLAttributes<HTMLElement>;
    source: HTMLAttributes<HTMLSourceElement>;
    span: HTMLAttributes<HTMLSpanElement>;
    strong: HTMLAttributes<HTMLElement>;
    style: HTMLAttributes<HTMLStyleElement>;
    sub: HTMLAttributes<HTMLElement>;
    summary: HTMLAttributes<HTMLElement>;
    sup: HTMLAttributes<HTMLElement>;
    table: HTMLAttributes<HTMLTableElement>;
    tbody: HTMLAttributes<HTMLTableSectionElement>;
    td: HTMLAttributes<HTMLTableCellElement>;
    textarea: HTMLAttributes<HTMLTextAreaElement>;
    tfoot: HTMLAttributes<HTMLTableSectionElement>;
    th: HTMLAttributes<HTMLTableCellElement>;
    thead: HTMLAttributes<HTMLTableSectionElement>;
    time: HTMLAttributes<HTMLTimeElement>;
    title: HTMLAttributes<HTMLTitleElement>;
    tr: HTMLAttributes<HTMLTableRowElement>;
    track: HTMLAttributes<HTMLTrackElement>;
    u: HTMLAttributes<HTMLElement>;
    ul: HTMLAttributes<HTMLUListElement>;
    var: HTMLAttributes<HTMLElement>;
    video: HTMLAttributes<HTMLVideoElement>;
    wbr: HTMLAttributes<HTMLElement>;

    //SVG
    svg: SVGAttributes<SVGSVGElement>;
    animate: SVGAttributes<SVGAnimateElement>;
    circle: SVGAttributes<SVGCircleElement>;
    animateMotion: SVGAttributes<SVGAnimateMotionElement>;
    animateTransform: SVGAttributes<SVGAnimateTransformElement>;
    clipPath: SVGAttributes<SVGClipPathElement>;
    defs: SVGAttributes<SVGDefsElement>;
    desc: SVGAttributes<SVGDescElement>;
    ellipse: SVGAttributes<SVGEllipseElement>;
    feBlend: SVGAttributes<SVGFEBlendElement>;
    feColorMatrix: SVGAttributes<SVGFEColorMatrixElement>;
    feComponentTransfer: SVGAttributes<SVGFEComponentTransferElement>;
    feComposite: SVGAttributes<SVGFECompositeElement>;
    feConvolveMatrix: SVGAttributes<SVGFEConvolveMatrixElement>;
    feDiffuseLighting: SVGAttributes<SVGFEDiffuseLightingElement>;
    feDisplacementMap: SVGAttributes<SVGFEDisplacementMapElement>;
    feDistantLight: SVGAttributes<SVGFEDistantLightElement>;
    feDropShadow: SVGAttributes<SVGFEDropShadowElement>;
    feFlood: SVGAttributes<SVGFEFloodElement>;
    feFuncA: SVGAttributes<SVGFEFuncAElement>;
    feFuncB: SVGAttributes<SVGFEFuncBElement>;
    feFuncG: SVGAttributes<SVGFEFuncGElement>;
    feFuncR: SVGAttributes<SVGFEFuncRElement>;
    feGaussianBlur: SVGAttributes<SVGFEGaussianBlurElement>;
    feImage: SVGAttributes<SVGFEImageElement>;
    feMerge: SVGAttributes<SVGFEMergeElement>;
    feMergeNode: SVGAttributes<SVGFEMergeNodeElement>;
    feMorphology: SVGAttributes<SVGFEMorphologyElement>;
    feOffset: SVGAttributes<SVGFEOffsetElement>;
    fePointLight: SVGAttributes<SVGFEPointLightElement>;
    feSpecularLighting: SVGAttributes<SVGFESpecularLightingElement>;
    feSpotLight: SVGAttributes<SVGFESpotLightElement>;
    feTile: SVGAttributes<SVGFETileElement>;
    feTurbulence: SVGAttributes<SVGFETurbulenceElement>;
    filter: SVGAttributes<SVGFilterElement>;
    foreignObject: SVGAttributes<SVGForeignObjectElement>;
    g: SVGAttributes<SVGGElement>;
    image: SVGAttributes<SVGImageElement>;
    line: SVGAttributes<SVGLineElement>;
    linearGradient: SVGAttributes<SVGLinearGradientElement>;
    marker: SVGAttributes<SVGMarkerElement>;
    mask: SVGAttributes<SVGMaskElement>;
    metadata: SVGAttributes<SVGMetadataElement>;
    mpath: SVGAttributes<SVGMPathElement>;
    path: SVGAttributes<SVGPathElement>;
    pattern: SVGAttributes<SVGPatternElement>;
    polygon: SVGAttributes<SVGPolygonElement>;
    polyline: SVGAttributes<SVGPolylineElement>;
    radialGradient: SVGAttributes<SVGRadialGradientElement>;
    rect: SVGAttributes<SVGRectElement>;
    set: SVGAttributes<SVGSetElement>;
    stop: SVGAttributes<SVGStopElement>;
    switch: SVGAttributes<SVGSwitchElement>;
    symbol: SVGAttributes<SVGSymbolElement>;
    text: SVGAttributes<SVGTextElement>;
    textPath: SVGAttributes<SVGTextPathElement>;
    tspan: SVGAttributes<SVGTSpanElement>;
    use: SVGAttributes<SVGUseElement>;
    view: SVGAttributes<SVGViewElement>;

    // MathML See https://developer.mozilla.org/en-US/docs/Web/MathML
    "annotation-xml": MathMLAttributes<HTMLAnnotationXmlElement>;
    annotation: MathMLAttributes<HTMLAnnotationElement>;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/maction */
    maction: MathMLAttributes<HTMLMActionElement>;
    math: MathMLAttributes<HTMLMathElement>;
    /** This feature is non-standard. See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/menclose  */
    menclose: MathMLAttributes<HTMLMEncloseElement>;
    merror: MathMLAttributes<HTMLMErrorElement>;
    /** @deprecated See https://developer.mozilla.org/en-US/docs/Web/MathML/Element/mfenced */
    mfenced: HTMLAttributes<HTMLMFencedElement>;
    mfrac: MathMLAttributes<HTMLMFracElement>;
    mi: MathMLAttributes<HTMLMiElement>;
    mmultiscripts: MathMLAttributes<HTMLMmultiScriptsElement>;
    mn: MathMLAttributes<HTMLMNElement>;
    mo: MathMLAttributes<HTMLMOElement>;
    mover: MathMLAttributes<HTMLMOverElement>;
    mpadded: MathMLAttributes<HTMLMPaddedElement>;
    mphantom: MathMLAttributes<HTMLMPhantomElement>;
    mprescripts: MathMLAttributes<HTMLMPrescriptsElement>;
    mroot: MathMLAttributes<HTMLMRootElement>;
    mrow: MathMLAttributes<HTMLMRowElement>;
    ms: MathMLAttributes<HTMLMSElement>;
    mspace: MathMLAttributes<HTMLMSpaceElement>;
    msqrt: MathMLAttributes<HTMLMSqrtElement>;
    mstyle: MathMLAttributes<HTMLMStyleElement>;
    msub: MathMLAttributes<HTMLMSubElement>;
    msubsup: MathMLAttributes<HTMLMSubsupElement>;
    msup: MathMLAttributes<HTMLMSupElement>;
    mtable: MathMLAttributes<HTMLMTableElement>;
    mtd: MathMLAttributes<HTMLMTdElement>;
    mtext: MathMLAttributes<HTMLMTextElement>;
    mtr: MathMLAttributes<HTMLMTrElement>;
    munder: MathMLAttributes<HTMLMUnderElement>;
    munderover: MathMLAttributes<HTMLMUnderoverElement>;
    semantics: MathMLAttributes<HTMLSemanticsElement>;
  }
}
