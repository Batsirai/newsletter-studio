// A small Markdown renderer for issues: headings, paragraphs, lists, quotes,
// rules, bold, italic, links, images and buttons ([[Label]](url)). Raw HTML is
// escaped, never passed through.

import { BRAND } from "./brand";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface RenderOptions {
  /** Rewrites each link and button URL (click tracking). */
  link?: (url: string) => string;
  /** Inline styles for email clients instead of bare tags. */
  email?: boolean;
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  return SAFE_URL.test(trimmed) ? trimmed : null;
}

const EMAIL_STYLE: Record<string, string> = {
  h1: `font-family:${BRAND.heading};font-size:28px;line-height:1.25;font-weight:600;color:${BRAND.ink};margin:8px 0 14px`,
  h2: `font-family:${BRAND.heading};font-size:22px;line-height:1.3;font-weight:600;color:${BRAND.ink};margin:24px 0 10px`,
  h3: `font-family:${BRAND.heading};font-size:18px;line-height:1.35;font-weight:600;color:${BRAND.ink};margin:20px 0 8px`,
  p: `font-size:16px;line-height:1.65;color:${BRAND.ink};margin:0 0 16px`,
  li: `font-size:16px;line-height:1.65;color:${BRAND.ink};margin:0 0 6px`,
  a: `color:${BRAND.link};text-decoration:underline`,
  blockquote: `margin:0 0 16px;padding:14px 18px;background-color:${BRAND.soft};border-radius:8px;font-style:italic;color:${BRAND.ink}`,
  img: "max-width:100%;height:auto;display:block;margin:0 0 16px;border-radius:8px",
  button: `display:inline-block;padding:12px 22px;background-color:${BRAND.accent};border-radius:999px;font-weight:600;text-decoration:none;color:#ffffff`,
};

function style(tag: string, options: RenderOptions): string {
  return options.email && EMAIL_STYLE[tag] ? ` style="${EMAIL_STYLE[tag]}"` : "";
}

function inline(text: string, options: RenderOptions): string {
  const tokens: string[] = [];
  const keep = (html: string) => `\u0000${tokens.push(html) - 1}\u0000`;
  let out = text;
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, alt: string, url: string) => {
    const src = safeUrl(url);
    return src
      ? keep(`<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${style("img", options)}>`)
      : whole;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, url: string) => {
    const href = safeUrl(url);
    if (!href) return keep(escapeHtml(label));
    const target = options.link ? options.link(href) : href;
    return keep(`<a href="${escapeHtml(target)}"${style("a", options)}>${formatText(label)}</a>`);
  });
  out = formatText(out);
  return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => tokens[Number(i)]!);
}

function formatText(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, "$1<em>$2</em>")
    .replace(/&amp;#0;/g, "");
}

export function renderMarkdown(source: string, options: RenderOptions = {}): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p${style("p", options)}>${paragraph.map((l) => inline(l, options)).join("<br>")}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      const tag = list.ordered ? "ol" : "ul";
      html.push(`<${tag}>${list.items.map((i) => `<li${style("li", options)}>${inline(i, options)}</li>`).join("")}</${tag}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const button = /^\[\[([^\]]+)\]\]\(([^)\s]+)\)$/.exec(line.trim());
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const tag = `h${heading[1]!.length}`;
      html.push(`<${tag}${style(tag, options)}>${inline(heading[2]!, options)}</${tag}>`);
    } else if (button) {
      flushParagraph();
      flushList();
      const href = safeUrl(button[2]!);
      if (href) {
        const target = options.link ? options.link(href) : href;
        html.push(
          `<p${style("p", options)}><a href="${escapeHtml(target)}" data-button${style("button", options)}>${escapeHtml(button[1]!)}</a></p>`,
        );
      } else {
        html.push(`<p${style("p", options)}>${escapeHtml(button[1]!)}</p>`);
      }
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushParagraph();
      flushList();
      html.push("<hr>");
    } else if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      html.push(`<blockquote${style("blockquote", options)}>${inline(line.replace(/^>\s?/, ""), options)}</blockquote>`);
    } else if (bullet || numbered) {
      flushParagraph();
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return html.join("\n");
}

/** Every link and button URL in the source, as written. */
export function linksIn(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/(?<!!)\[\[?([^\]]*)\]?\]\(([^)\s]*)\)/g)) {
    found.add(match[2]!.trim());
  }
  return [...found];
}

/** Replaces {{first_name|fallback}} and {{first_name}}. */
export function mergeTags(source: string, values: { first_name?: string }): string {
  return source.replace(/\{\{\s*(\w+)\s*(?:\|([^}]*))?\}\}/g, (_, name: string, fallback?: string) => {
    const value = name === "first_name" ? values.first_name : undefined;
    return value?.trim() ? value.trim() : (fallback ?? "").trim();
  });
}

/** Plain text for the text/plain part. */
export function toPlainText(source: string): string {
  return source
    .replace(/^\[\[([^\]]+)\]\]\(([^)\s]+)\)$/gm, "$1: $2")
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "issue"
  );
}
