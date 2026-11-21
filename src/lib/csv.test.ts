import { describe, expect, it } from "vitest";
import { parseContactsCsv, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("reads quoted cells, doubled quotes, CRLF and a BOM, and drops empty lines", () => {
    expect(
      parseCsv('﻿a,"b, c","say ""hi"""\r\n\r\n1,"two\nlines",3\n'),
    ).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "two\nlines", "3"],
    ]);
  });
});

describe("parseContactsCsv", () => {
  it("finds the columns by header name, in any order", () => {
    const csv =
      "Status,First Name,Email\nactive,Ana, Mom@Gmail.com \nactive,,b@test.org\n";
    expect(parseContactsCsv(csv).rows).toEqual([
      { email: "mom@gmail.com", firstName: "Ana", active: true },
      { email: "b@test.org", firstName: "", active: true },
    ]);
  });
  it("keeps people who left the list out of the send", () => {
    const { rows } = parseContactsCsv(
      "email,status\na@test.org,unsubscribed\nb@test.org,inactive\nc@test.org,pending\nd@test.org,active\n",
    );
    expect(rows.map((r) => r.active)).toEqual([false, false, false, true]);
  });
  it("reads a plain list of emails with no header", () => {
    expect(parseContactsCsv("a@test.org\nb@test.org,Ben\n").rows).toEqual([
      { email: "a@test.org", firstName: "", active: true },
      { email: "b@test.org", firstName: "Ben", active: true },
    ]);
  });
  it("counts bad and repeated emails and keeps the first row", () => {
    const result = parseContactsCsv(
      "email,first_name\na@test.org,Ana\nnot-an-email,X\nA@test.org,Other\n,\n",
    );
    expect(result.rows).toEqual([
      { email: "a@test.org", firstName: "Ana", active: true },
    ]);
    expect(result.invalid).toBe(1);
    expect(result.repeated).toBe(1);
  });
});
