import { BRAND } from "./brand";
import { escapeHtml } from "./markdown";

export { BRAND };

/**
 * The frame every email goes out in: the AlreadyLoved header on a cream page, the message on a
 * white card below it, then the footer. Tables and inline styles, so Gmail and Outlook
 * keep it.
 */
export function emailLayout(p: { title: string; inner: string; footer: string; preview?: string; signoff?: boolean }): string {
  const b = BRAND;
  const title = escapeHtml(p.title);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${title}</title></head>
<body style="margin:0;padding:0;background-color:${b.page};color:${b.ink};font-family:${b.body}">
${p.preview ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(p.preview)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${b.page}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td align="center" style="padding:0 0 24px"><a href="${b.siteUrl}" style="text-decoration:none"><img src="${b.headerUrl}" alt="${escapeHtml(b.headerAlt)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>
<tr><td style="background-color:${b.card};border:1px solid ${b.border};border-radius:12px;padding:28px 28px 32px;font-family:${b.body};color:${b.ink}">${p.inner}${p.signoff ? signoff() : ""}</td></tr>
<tr><td align="center" style="padding:20px 16px 0;font-family:${b.body};font-size:12px;line-height:1.6;color:${b.muted}">${p.footer}</td></tr>
</table></td></tr></table></body></html>`;
}

/** The sign-off at the end of a letter: Batsirai waving, then his name. */
function signoff(): string {
  const b = BRAND;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px"><tr>
<td style="padding:0 14px 0 0;vertical-align:middle"><img src="${b.signoffUrl}" alt="${escapeHtml(b.signoffName)} waving" width="72" height="72" style="display:block;width:72px;height:72px;border:0;border-radius:50%;object-fit:cover"></td>
<td style="vertical-align:middle;font-family:${b.body};color:${b.ink}"><div style="font-family:${b.heading};font-size:18px;font-weight:600;line-height:1.3">${escapeHtml(b.signoffName)}</div><div style="font-size:14px;line-height:1.4;color:${b.muted}">${escapeHtml(b.signoffLine)}</div></td>
</tr></table>`;
}
