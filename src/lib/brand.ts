/**
 * AlreadyLoved's look for emails, taken from alreadylovedkids.com: cream page,
 * white card, rose accents, a serif for headings. Email clients can't load the
 * site's fonts, so each stack ends in a font every client has.
 */
export const BRAND = {
  /** The 1200x400 header (shown at 600x200) ("already loved with Batsirai & Aimee"), served from public/assets. */
  headerUrl: "https://newsletter-studio.apps.alreadylovedkids.com/assets/email-header.png",
  headerAlt: "AlreadyLoved with Batsirai & Aimee",
  /** Batsirai waving (416x411 GIF), shown round at the end of each letter. */
  signoffUrl: "https://newsletter-studio.apps.alreadylovedkids.com/assets/signoff.gif",
  signoffName: "Batsirai",
  signoffLine: "AlreadyLoved",
  siteUrl: "https://alreadylovedkids.com",
  page: "#fffaf5",
  card: "#ffffff",
  border: "#f1e6da",
  ink: "#1a1a1a",
  muted: "#6b6460",
  link: "#be123c",
  accent: "#e11d48",
  soft: "#fff1f2",
  heading: "Fraunces, Georgia, 'Times New Roman', serif",
  body: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
} as const;
