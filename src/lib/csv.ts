/** Splits CSV text into rows of cells: quoted cells, doubled quotes, CRLF and a BOM are handled. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}

export interface ImportRow {
  email: string;
  firstName: string;
  /** False when the file says the person left the list: they are stored as unsubscribed and never emailed. */
  active: boolean;
}

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const EMAIL_HEADERS = ["email", "email address", "e-mail", "email_address"];
const NAME_HEADERS = ["first_name", "first name", "firstname", "name"];
const STATUS_HEADERS = ["status", "subscription status", "state"];
/** Status words that mean the person may be emailed. Any other value is stored as unsubscribed. */
const ACTIVE_WORDS = new Set([
  "",
  "active",
  "subscribed",
  "confirmed",
  "validating",
]);

/**
 * Reads contacts from a CSV export (beehiiv, Kit, Resend or this app's own).
 * With a header row, the email, first name and status columns are found by
 * name; without one, the first column is the email and the second the name.
 * A repeated email keeps its first row.
 */
export function parseContactsCsv(text: string): {
  rows: ImportRow[];
  invalid: number;
  repeated: number;
} {
  const lines = parseCsv(text);
  if (!lines.length) return { rows: [], invalid: 0, repeated: 0 };
  const header = lines[0]!.map((h) => h.trim().toLowerCase());
  const emailAt = header.findIndex((h) => EMAIL_HEADERS.includes(h));
  const hasHeader = emailAt >= 0;
  const nameAt = hasHeader
    ? header.findIndex((h) => NAME_HEADERS.includes(h))
    : 1;
  const statusAt = hasHeader
    ? header.findIndex((h) => STATUS_HEADERS.includes(h))
    : -1;
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  let invalid = 0;
  let repeated = 0;
  for (const line of hasHeader ? lines.slice(1) : lines) {
    const email = (line[hasHeader ? emailAt : 0] ?? "").trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) {
      invalid++;
      continue;
    }
    if (seen.has(email)) {
      repeated++;
      continue;
    }
    seen.add(email);
    const status =
      statusAt >= 0 ? (line[statusAt] ?? "").trim().toLowerCase() : "";
    rows.push({
      email,
      firstName: nameAt >= 0 ? (line[nameAt] ?? "").trim().slice(0, 100) : "",
      active: ACTIVE_WORDS.has(status),
    });
  }
  return { rows, invalid, repeated };
}
