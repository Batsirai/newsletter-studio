import { BRAND } from "./brand";
import { escapeHtml } from "./markdown";

export { BRAND };

/**
 * The frame every email goes out in: the AlreadyLoved banner on a cream page, the message on a
 * white card, then the footer. Tables and inline styles, so Gmail and Outlook
 * keep it.
 */
export function emailLayout(p: { title: string; inner: string; footer: string; preview?: string }): string {
  const b = BRAND;
  const title = escapeHtml(p.title);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${title}</title></head>
<body style="margin:0;padding:0;background-color:${b.page};color:${b.ink};font-family:${b.body}">
${p.preview ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(p.preview)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${b.page}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td align="center" style="padding:0"><a href="${b.siteUrl}" style="text-decoration:none"><img src="${b.headerUrl}" alt="${escapeHtml(b.headerAlt)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>
<tr><td style="background-color:${b.card};border:1px solid ${b.border};border-radius:12px;padding:32px 28px;font-family:${b.body};color:${b.ink}">${p.inner}</td></tr>
<tr><td align="center" style="padding:20px 16px 0;font-family:${b.body};font-size:12px;line-height:1.6;color:${b.muted}">${p.footer}</td></tr>
</table></td></tr></table></body></html>`;
}
