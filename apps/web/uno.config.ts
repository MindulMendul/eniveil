import { defineConfig, presetWind4 } from "unocss";
import { readFileSync } from "node:fs";

type DtcgNode = {
  $type?: string;
  $value?: unknown;
  [key: string]: unknown;
};

type ThemeTokens = Record<string, string | ThemeTokens>;

const tokens = JSON.parse(
  readFileSync(new URL("./design-tokens.tokens.json", import.meta.url), "utf8"),
) as DtcgNode;

function dimensionToCss(value: unknown): string {
  const dimension = value as { value: number; unit: string };
  return `${dimension.value}${dimension.unit}`;
}

function colorToCss(value: unknown): string {
  if (typeof value === "string") return value;
  const color = value as { hex?: string; alpha?: number; components?: number[] };
  if (!color.hex) throw new Error("Design token color is missing its hex fallback.");
  if (color.alpha === undefined || color.alpha >= 1 || !color.components) return color.hex;
  const channels = color.components.map((channel) => Math.round(channel * 255)).join(" ");
  return `rgb(${channels} / ${color.alpha})`;
}

function tokenToCss(value: unknown, type: string): string {
  if (type === "dimension") return dimensionToCss(value);
  if (type === "number") return String(value);
  if (type === "color") return colorToCss(value);
  if (type === "fontFamily") {
    const families = Array.isArray(value) ? value : [value];
    return families
      .map((family) => {
        const name = String(family);
        return name.includes(" ") ? `\"${name}\"` : name;
      })
      .join(", ");
  }
  if (type === "shadow") {
    const shadows = Array.isArray(value) ? value : [value];
    return shadows
      .map((item) => {
        const shadow = item as {
          color: unknown;
          offsetX: unknown;
          offsetY: unknown;
          blur: unknown;
          spread: unknown;
          inset?: boolean;
        };
        return [
          shadow.inset ? "inset" : "",
          dimensionToCss(shadow.offsetX),
          dimensionToCss(shadow.offsetY),
          dimensionToCss(shadow.blur),
          dimensionToCss(shadow.spread),
          colorToCss(shadow.color),
        ]
          .filter(Boolean)
          .join(" ");
      })
      .join(", ");
  }
  throw new Error(`Unsupported design token type: ${type}`);
}

function toThemeTokens(node: DtcgNode, inheritedType = ""): ThemeTokens | string {
  const type = typeof node.$type === "string" ? node.$type : inheritedType;
  if ("$value" in node) return tokenToCss(node.$value, type);

  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => !key.startsWith("$"))
      .map(([key, value]) => [key, toThemeTokens(value as DtcgNode, type)]),
  );
}

const extensions = tokens.$extensions as DtcgNode;
const unoExtensions = extensions["com.murderparker.unocss"] as DtcgNode;
const viewportSizing = unoExtensions.viewportSizing as Record<string, string>;
const typography = tokens.typography as DtcgNode;
const typeScale = typography.size as DtcgNode;

function cssVariables(node: DtcgNode, path: string[] = [], inheritedType = ""): string[] {
  const type = typeof node.$type === "string" ? node.$type : inheritedType;
  if ("$value" in node) return [`--${path.join("-")}:${tokenToCss(node.$value, type)}`];
  return Object.entries(node).filter(([key]) => !key.startsWith("$")).flatMap(
    ([key, child]) => cssVariables(child as DtcgNode, [...path, key], type),
  );
}

export default defineConfig({
  preflights: [{ getCSS: () => `:root{${cssVariables(tokens).join(";")}}` }],
  presets: [
    presetWind4({
      preflights: { reset: true },
    }),
  ],
  content: {
    filesystem: ["src/**/*.{astro,svelte,html}"],
  },
  theme: {
    // DTCG tokens are the source of truth; viewport-relative sizes are UnoCSS extensions.
    breakpoint: toThemeTokens(tokens.breakpoint as DtcgNode) as Record<string, string>,
    spacing: {
      ...Object.fromEntries(Object.entries(toThemeTokens(tokens.spacing as DtcgNode) as Record<string, string>)
        .map(([name, value]) => [name.replace("-", "."), value])),
      ...(toThemeTokens(tokens.layout as DtcgNode) as Record<string, string>),
      ...viewportSizing,
    },
    text: Object.fromEntries(
      Object.entries(toThemeTokens(typeScale as DtcgNode) as Record<string, string>).map(
        ([name, fontSize]) => [name, { fontSize }],
      ),
    ),
    fontWeight: toThemeTokens(typography.weight as DtcgNode) as Record<string, string>,
    leading: toThemeTokens(typography["line-height"] as DtcgNode) as Record<string, string>,
    tracking: toThemeTokens(typography["letter-spacing"] as DtcgNode) as Record<string, string>,
    radius: toThemeTokens(tokens.radius as DtcgNode) as Record<string, string>,
    shadow: toThemeTokens(tokens.shadow as DtcgNode) as Record<string, string>,
    colors: toThemeTokens(tokens.color as DtcgNode) as Record<string, Record<string, string>>,
    font: toThemeTokens(typography.family as DtcgNode) as Record<string, string>,
  },
  rules: [
    ["grid-entrance", { "grid-template-columns": "1.3fr 1fr" }],
    ["grid-lobby", { "grid-template-columns": "minmax(0, 1fr) 19.375rem" }],
  ],
  shortcuts: {
    "tap-highlight-none": "[-webkit-tap-highlight-color:transparent]",
    "font-synthesis-none": "[font-synthesis:none]",
    shell: "mx-auto w-full max-w-7xl px-13 min-h-viewport flex flex-col max-tablet:px-6 max-mobile:px-4.5",
    header: "h-27 flex items-center justify-between border-b border-festival-line max-tablet:h-22.5",
    brand: "flex items-center gap-3.5 font-serif text-title-lg font-semibold max-tablet:text-brand-tablet text-inherit no-underline tap-highlight-none focus-visible:outline-2 focus-visible:outline-festival-gold focus-visible:outline-offset-5",
    "brand-subtitle": "block mt-1.75 font-sans text-micro tracking-brand text-festival-muted max-mobile:text-mini",
    emblem: "text-display-xl text-festival-gold font-normal max-tablet:text-display-lg",
    identity: "flex items-center gap-2.5 text-body-sm max-tablet:text-caption",
    edition: "text-festival-muted text-xs max-mobile:hidden",
    "identity-tag": "max-mobile:hidden",
    tag: "inline-block whitespace-nowrap border border-festival-line px-2 py-1 text-label tracking-label text-festival-muted",
    gold: "text-festival-gold border-festival-gold-border",
    dot: "inline-block size-1.75 shrink-0 rounded-full bg-festival-status-offline",
    live: "bg-festival-live shadow-live",
    main: "flex-1 py-13.5 pb-18 max-mobile:py-9 max-mobile:pb-12",
    entrance: "grid-entrance grid min-h-entrance items-center gap-22.5 max-tablet:min-h-0 max-tablet:grid-cols-1 max-tablet:gap-9 max-tablet:pt-11.25",
    "heading-one": "mt-0 mb-5 font-serif text-display leading-display font-medium tracking-display max-tablet:text-display-sm",
    "entrance-title": "mb-5 text-display-xl max-tablet:text-display-lg max-mobile:text-display-sm",
    "page-title": "mb-2.5",
    "heading-two": "mt-0 mb-4.5 font-serif text-title-xl leading-title font-medium",
    "sidebar-title": "text-title-lg",
    "section-title": "m-0 font-sans text-base",
    "heading-three": "mt-0 mb-3 text-body-lg leading-body-lg font-medium",
    "room-title": "my-5 mb-2.5 font-serif text-title",
    "eyebrow": "mb-5 text-label leading-normal font-semibold tracking-eyebrow text-festival-gold",
    intro: "m-0 whitespace-pre-line text-body leading-intro text-festival-muted",
    ticket: "mt-14.5 flex justify-between border-y border-dashed border-festival-ticket-border py-5 text-label tracking-label text-festival-gold max-tablet:mt-7 max-mobile:text-mini",
    panel: "border border-festival-line bg-festival-panel p-7 max-mobile:p-5.5",
    login: "p-10 max-tablet:p-7",
    muted: "m-0 text-sm leading-body text-festival-muted",
    fine: "mt-5.5 mb-0 text-xs leading-body text-festival-muted",
    "input-label": "mt-6 mb-2.5 block text-xs text-festival-muted-light",
    "join-label": "mt-3.75",
    "input-field": "w-full rounded-control border border-festival-input-border bg-festival-panel-input px-4 py-3.5 text-festival-text outline-none tap-highlight-none placeholder:text-festival-muted-dark focus:border-festival-gold focus-visible:outline-2 focus-visible:outline-festival-gold focus-visible:outline-offset-5",
    primary: "mt-5 flex min-h-11 w-full cursor-pointer items-center justify-between rounded-control border border-festival-gold bg-festival-gold tap-highlight-none px-4.5 py-3.5 text-body-sm font-semibold text-festival-button-foreground transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-festival-gold focus-visible:outline-offset-5 disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-festival-gold-hover",
    secondary: "mt-5 flex min-h-11 w-full cursor-pointer items-center justify-between rounded-control border border-festival-button-border bg-transparent tap-highlight-none px-4.5 py-3.5 text-body-sm text-festival-button-text transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-festival-gold focus-visible:outline-offset-5 disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:border-festival-gold enabled:hover:bg-festival-panel-hover",
    "secondary-compact": "w-auto min-w-40",
    "page-heading": "mb-10 flex items-center justify-between gap-6 max-tablet:items-start max-mobile:gap-3",
    count: "whitespace-nowrap text-body-sm text-festival-muted",
    "lobby-grid": "grid-lobby grid gap-7 max-tablet:grid-cols-1",
    sidebar: "flex flex-col gap-5 max-tablet:grid max-tablet:grid-cols-2 max-tablet:items-start max-mobile:flex",
    "section-heading": "flex items-center justify-between gap-3.75",
    "section-eyebrow": "m-0",
    empty: "mt-5.5 flex min-h-90 flex-col items-center justify-center border border-dashed border-festival-empty-border p-7.5 text-center",
    "empty-symbol": "mb-5 text-symbol text-festival-symbol",
    "empty-copy": "mb-0 text-body-sm text-festival-muted",
    rooms: "mt-5.5 grid gap-4",
    "room-card": "border border-festival-line bg-festival-panel p-6",
    "room-count": "m-0 text-sm leading-body text-festival-muted",
    "footer": "flex justify-between gap-4 border-t border-festival-line py-6 pb-7.5 text-label tracking-label text-festival-muted-green",
    "footer-tagline": "max-tablet:hidden",
    offline: "text-festival-gold",
    notice: "mt-6 flex items-center justify-between border border-festival-notice-border bg-festival-notice px-4.5 py-3.5 text-body-sm text-festival-notice-text",
    dismiss: "grid min-h-11 min-w-11 place-items-center cursor-pointer border-0 bg-transparent tap-highlight-none px-1.25 py-0 text-title-xl text-festival-muted focus-visible:outline-2 focus-visible:outline-festival-gold focus-visible:outline-offset-5",
    "text-button": "min-h-11 cursor-pointer border-0 border-b border-festival-button-hover-border bg-transparent tap-highlight-none px-0 py-2 text-body-sm text-festival-muted focus-visible:outline-2 focus-visible:outline-festival-gold focus-visible:outline-offset-5 disabled:cursor-not-allowed disabled:opacity-40",
    members: "mt-7",
    member: "flex items-center gap-4 border-t border-festival-line py-5",
    "member-info": "min-w-0 flex-1",
    "member-status": "ml-auto",
    "member-name": "text-body font-medium",
    "member-role": "mt-1.75 block text-caption text-festival-muted",
    avatar: "grid size-11 shrink-0 place-items-center border border-festival-avatar-border bg-festival-avatar font-serif text-festival-gold",
    vacant: "text-body-sm text-festival-muted-vacant",
    "vacant-avatar": "border-dashed bg-transparent",
    "invite-code": "my-6 font-mono text-code tracking-code text-festival-gold",
    steps: "mb-8 grid grid-cols-4 gap-3 border-t border-festival-line",
    step: "pt-4 text-xs text-festival-muted max-mobile:text-label max-mobile:leading-readable",
    active: "-mt-px border-t-2 border-festival-gold text-festival-gold",
    narrative: "my-6.5 font-serif text-title-sm leading-narrative text-festival-copy",
    story: "min-h-90 p-9 max-mobile:p-5.5",
    clue: "border-b border-festival-line py-5.5",
    "clue-label": "text-caption tracking-label text-festival-gold",
    "clue-text": "mt-3 mb-0 text-body leading-copy text-festival-copy-soft",
    summary: "cursor-pointer text-sm leading-readable text-festival-gold",
    "detail-copy": "mt-4.5",
    votes: "my-7",
    "vote-result": "my-0 border-t border-festival-line py-4 text-sm",
    "vote-target": "px-5 text-festival-gold",
    center: "grid place-items-center",
    "modal-backdrop": "fixed inset-0 z-10 flex items-center justify-center bg-festival-modal-backdrop p-6 max-mobile:p-3",
    modal: "m-auto max-h-modal-height w-full max-w-modal overflow-auto border border-festival-modal-border bg-festival-panel p-9 text-festival-dialog-text max-mobile:p-5.5 backdrop:bg-festival-modal-backdrop",
    "modal-title": "my-5.5 font-serif text-title-xl leading-title font-medium",
    tabs: "mb-5 flex items-center gap-7 border-b border-festival-line max-mobile:gap-5",
    tab: "min-h-11 px-3 py-3.5 text-body-sm",
    selected: "border-b-2 border-festival-gold text-festival-gold",
    "tab-button": "min-h-11 px-3 py-3.5 cursor-pointer border-0 bg-transparent tap-highlight-none text-festival-muted focus-visible:outline-2 focus-visible:outline-festival-gold focus-visible:outline-offset-5 disabled:cursor-not-allowed disabled:opacity-40",
    "tab-tag": "ml-1.25 text-micro",
    scenario: "mt-3 flex min-h-11 w-full cursor-pointer items-center justify-between gap-3.75 border border-festival-line bg-festival-scenario-bg tap-highlight-none p-5.5 text-left text-festival-scenario-text focus-visible:outline-2 focus-visible:outline-festival-gold focus-visible:outline-offset-5 disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:border-festival-gold",
    "scenario-label": "text-micro",
    "scenario-title": "my-2.5 text-title-sm",
    "scenario-description": "mb-2.5 text-xs leading-readable text-festival-muted",
    "scenario-meta": "text-caption text-festival-scenario-small",
    "scenario-status": "whitespace-nowrap text-xs text-festival-gold",
  },
});
