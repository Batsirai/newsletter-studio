import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { callTool, listTools, testEnv } from "@every-app/sdk/testing";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
const fixtureDb = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return fixtureDb.current;
  },
}));
vi.mock("./mail", () => ({
  deliver: vi.fn(async () => ({ ok: true })),
  renderConfirmation: vi.fn(() => ({
    subject: "Fixture confirmation",
    text: "Fixture only",
  })),
  renderWelcome: vi.fn(() => ({
    subject: "Fixture welcome",
    text: "Fixture only",
  })),
}));
const {
  claimSignup,
  signupReceipt,
  confirmationView,
  confirmSignup,
  signupConfig,
  CONSENT_VERSION,
} = await import("./signupClaims");
const { signupConfirmationResponse } = await import("./signupConfirmationPage");
const { tools } = await import("@/tools");

const config = {
  newsletterId: "publication-1",
  origin: "https://newsletter.example",
};
const input = (): Parameters<typeof claimSignup>[1] => ({
  newsletterId: config.newsletterId,
  claimKey: "claim_key_0001",
  email: "parent@fixture-family.org",
  source: "instagram_tonight" as const,
  variant: "follow_email",
  testTraffic: false,
  consentVersion: CONSENT_VERSION,
  consentedAt: Date.now(),
});
let client: Client;
let db: ReturnType<typeof drizzle<typeof schema>>;
async function claim() {
  return claimSignup("owner", input(), config);
}
function token(result: Awaited<ReturnType<typeof claim>>) {
  return new URL(
    (result as { confirmationUrl: string }).confirmationUrl,
  ).pathname
    .split("/")
    .at(-1)!;
}
async function status() {
  return (await db.select().from(schema.contacts))[0]?.status;
}

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  db = drizzle(client, { schema });
  fixtureDb.current = db;
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  });
  await db.insert(schema.newsletters).values({
    id: "publication-1",
    ownerId: "owner",
    name: "AlreadyLoved Letters",
    slug: "letters",
    confirmOptIn: true,
    websiteEnabled: true,
  });
  await db.insert(schema.newsletters).values({
    id: "publication-2",
    ownerId: "other",
    name: "Other private newsletter",
    slug: "other",
    confirmOptIn: true,
    websiteEnabled: true,
  });
});
afterEach(() => {
  client.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("authenticated publication-scoped claims (SQLite; no mail/provider calls)", () => {
  it("creates a pending contact and private canonical link, without claiming activation", async () => {
    const result = await claim();
    expect(result).toMatchObject({
      status: "pending",
      baseline: "absent",
      newActive: false,
    });
    expect((result as { confirmationUrl: string }).confirmationUrl).toMatch(
      /^https:\/\/newsletter\.example\/n\/letters\/join\/[a-f0-9]{64}$/,
    );
    expect(await status()).toBe("pending");
  });
  it("reuses the same claim and URL instead of creating another contact or confirmation", async () => {
    const args = input();
    const a = await claimSignup("owner", args, config),
      b = await claimSignup("owner", args, config);
    expect(a).toEqual(b);
    expect(await db.select().from(schema.contacts)).toHaveLength(1);
    expect(await db.select().from(schema.signupClaims)).toHaveLength(1);
    expect(await db.select().from(schema.contactEvents)).toHaveLength(1);
  });
  it("rejects replay of a claim with a changed email or attribution", async () => {
    const args = input();
    await claimSignup("owner", args, config);
    for (const override of [
      { email: "other@fixture-family.org" },
      { variant: "other_arm" },
      { testTraffic: true },
    ])
      await expect(
        claimSignup("owner", { ...args, ...override }, config),
      ).rejects.toThrow("original request");
  });
  it("does not activate on a confirmation GET or leak email in the page", async () => {
    const result = await claim();
    const t = token(result);
    const response = await signupConfirmationResponse(
      new Request(`${config.origin}/n/letters/join/${t}`),
      { slug: "letters", token: t },
      config,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(input().email);
    expect(await status()).toBe("pending");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(
      (await db.select().from(schema.signupClaims))[0].confirmedAt,
    ).toBeNull();
  });
  it("requires a same-origin explicit POST, then records one confirmed new active subscriber", async () => {
    const result = await claim();
    const t = token(result);
    const params = { slug: "letters", token: t };
    const post = (origin: string, body = "confirm=yes") =>
      new Request(`${config.origin}/n/letters/join/${t}`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
    expect(
      (
        await signupConfirmationResponse(
          post("https://attacker.example"),
          params,
          config,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await signupConfirmationResponse(
          post(config.origin, "confirm=no"),
          params,
          config,
        )
      ).status,
    ).toBe(400);
    expect(await status()).toBe("pending");
    expect(
      (await signupConfirmationResponse(post(config.origin), params, config))
        .status,
    ).toBe(200);
    expect(await status()).toBe("active");
    expect(
      await signupReceipt(
        "owner",
        { newsletterId: config.newsletterId, claimKey: input().claimKey },
        config,
      ),
    ).toMatchObject({ status: "active", newActive: true });
    await signupConfirmationResponse(post(config.origin), params, config);
    expect(
      (await db.select().from(schema.contactEvents)).filter(
        (e) => e.type === "confirmed",
      ),
    ).toHaveLength(1);
  });
  it.each([
    "active",
    "pending",
    "dormant",
    "unsubscribed",
    "bounced",
    "complained",
  ])("never reactivates or counts an existing %s contact", async (current) => {
    await db.insert(schema.contacts).values({
      id: "prior",
      newsletterId: config.newsletterId,
      email: input().email,
      status: current,
      source: "manual",
      token: "existing-token",
    });
    const result = await claim();
    expect(result).toMatchObject({ baseline: "existing", newActive: false });
    expect(result).not.toHaveProperty("confirmationUrl");
    expect(await status()).toBe(current);
    expect(await db.select().from(schema.contactEvents)).toHaveLength(0);
  });
  it("a second claim for the same email is existing, not another acquisition", async () => {
    const first = await claim();
    await confirmSignup("letters", token(first), config);
    const second = await claimSignup(
      "owner",
      { ...input(), claimKey: "another_claim_0002" },
      config,
    );
    expect(second).toMatchObject({ baseline: "existing", newActive: false });
    expect(await db.select().from(schema.contacts)).toHaveLength(1);
  });
  it("explicit test traffic and reserved test addresses never count as growth", async () => {
    for (const [i, override] of [
      { testTraffic: true },
      { email: "person@example.com" },
      { email: "parent+igtest@fixture-family.org" },
    ].entries()) {
      const args = {
        ...input(),
        claimKey: `test_claim_${i}`,
        email: `person${i}@fixture-family.org`,
        ...override,
      };
      const result = await claimSignup("owner", args, config);
      await confirmSignup("letters", token(result), config);
      expect(
        await signupReceipt(
          "owner",
          { newsletterId: config.newsletterId, claimKey: args.claimKey },
          config,
        ),
      ).toMatchObject({
        status: "active",
        newActive: false,
        testTraffic: true,
      });
    }
  });
  it("another owner or publication cannot claim or read a receipt", async () => {
    await claim();
    await expect(claimSignup("other", input(), config)).rejects.toThrow(
      "not found",
    );
    await expect(
      signupReceipt(
        "other",
        { newsletterId: config.newsletterId, claimKey: input().claimKey },
        config,
      ),
    ).rejects.toThrow("not found");
    await expect(
      claimSignup(
        "owner",
        { ...input(), newsletterId: "publication-2" },
        config,
      ),
    ).rejects.toThrow("not found");
  });
  it("a token for the wrong publication cannot confirm", async () => {
    const result = await claim();
    expect(await confirmationView("other", token(result), config)).toBeNull();
    expect(await status()).toBe("pending");
  });
  it("an expired link cannot confirm or produce a fresh confirmation on retry", async () => {
    const args = input(),
      result = await claimSignup("owner", args, config);
    vi.spyOn(Date, "now").mockReturnValue(args.consentedAt + 4 * 86400000);
    expect(await confirmSignup("letters", token(result), config)).toMatchObject(
      { status: "expired" },
    );
    expect(await claimSignup("owner", args, config)).not.toHaveProperty(
      "confirmationUrl",
    );
    expect(await status()).toBe("pending");
  });
  it("unsubscribing before confirmation stays suppressed after POST", async () => {
    const result = await claim();
    await db.update(schema.contacts).set({ status: "unsubscribed" });
    expect(await confirmSignup("letters", token(result), config)).toMatchObject(
      { status: "suppressed" },
    );
    expect(
      (await db.select().from(schema.signupClaims))[0].confirmedAt,
    ).toBeNull();
    expect(await status()).toBe("unsubscribed");
  });
  it("requires fresh consent, confirmation enabled and canonical origin", async () => {
    await expect(
      claimSignup(
        "owner",
        { ...input(), consentedAt: Date.now() - 2 * 86400000 },
        config,
      ),
    ).rejects.toThrow("fresh explicit");
    await db
      .update(schema.newsletters)
      .set({ confirmOptIn: false })
      .where(eq(schema.newsletters.id, config.newsletterId));
    await expect(claim()).rejects.toThrow("requires confirmation");
    for (const origin of [
      "",
      "http://newsletter.example",
      "https://newsletter.example/path",
      "https://user:pass@newsletter.example",
    ])
      expect(() =>
        signupConfig({
          SIGNUP_NEWSLETTER_ID: config.newsletterId,
          SIGNUP_PUBLIC_ORIGIN: origin,
        }),
      ).toThrow("setup");
  });
  it("receipt lookup returns neither email nor token and never claims an unknown signup", async () => {
    await claim();
    const receipt = await signupReceipt(
      "owner",
      { newsletterId: config.newsletterId, claimKey: input().claimKey },
      config,
    );
    expect(JSON.stringify(receipt)).not.toContain(input().email);
    expect(receipt).not.toHaveProperty("confirmationUrl");
    expect(
      await signupReceipt(
        "owner",
        { newsletterId: config.newsletterId, claimKey: "unknown_claim" },
        config,
      ),
    ).toMatchObject({ status: "unknown", newActive: false });
  });
});

describe("acquisition and confirmation races", () => {
  it("does not recount a recipient after the contact was deleted", async () => {
    const original = await claim();
    await confirmSignup("letters", token(original), config);
    await db.delete(schema.contacts);
    const next = await claimSignup(
      "owner",
      { ...input(), claimKey: "after_deletion_0002" },
      config,
    );
    expect(next).toMatchObject({
      baseline: "existing",
      status: "unknown",
      newActive: false,
    });
    expect(next).not.toHaveProperty("confirmationUrl");
    expect(await db.select().from(schema.contacts)).toHaveLength(0);
  });
  it("a contact activated outside this claim is not a confirmed acquisition", async () => {
    await claim();
    await db
      .update(schema.contacts)
      .set({ status: "active", confirmedAt: new Date().toISOString() });
    expect(
      await signupReceipt(
        "owner",
        { newsletterId: config.newsletterId, claimKey: input().claimKey },
        config,
      ),
    ).toMatchObject({ status: "active", newActive: false });
  });
  it("suppression winning between lookup and confirmation batch cannot produce confirmation proof", async () => {
    const result = await claim();
    fixtureDb.current = new Proxy(db, {
      get(target, key, receiver) {
        if (key === "batch")
          return async (queries: Parameters<typeof db.batch>[0]) => {
            await db.update(schema.contacts).set({ status: "unsubscribed" });
            return db.batch(queries);
          };
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    expect(await confirmSignup("letters", token(result), config)).toMatchObject(
      { status: "suppressed" },
    );
    expect(
      (await db.select().from(schema.signupClaims))[0].confirmedAt,
    ).toBeNull();
    expect(
      (await db.select().from(schema.contactEvents)).filter(
        (e) => e.type === "confirmed",
      ),
    ).toHaveLength(0);
  });
});

describe("review regressions", () => {
  it("does not attribute an outside activation at the exact same timestamp", async () => {
    const fixed = new Date();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(fixed);
    const result = await claim();
    fixtureDb.current = new Proxy(db, {
      get(target, key, receiver) {
        if (key === "batch")
          return async (queries: Parameters<typeof db.batch>[0]) => {
            await db
              .update(schema.contacts)
              .set({ status: "active", confirmedAt: fixed.toISOString() });
            return db.batch(queries);
          };
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await confirmSignup("letters", token(result), config);
    expect(
      await signupReceipt(
        "owner",
        { newsletterId: config.newsletterId, claimKey: input().claimKey },
        config,
      ),
    ).toMatchObject({ status: "active", newActive: false });
    expect(
      (await db.select().from(schema.signupClaims))[0].confirmedAt,
    ).toBeNull();
  });
  it("reserves a recipient even if contact deletion occurs during another claim's paused insert", async () => {
    const bArgs = { ...input(), claimKey: "paused_claim_B" };
    let releaseB!: () => void, reached!: () => void;
    const wait = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    const entering = new Promise<void>((resolve) => {
      reached = resolve;
    });
    fixtureDb.current = new Proxy(db, {
      get(target, key, receiver) {
        if (key === "batch")
          return async (queries: Parameters<typeof db.batch>[0]) => {
            const isB = queries.some((q) =>
              (q as unknown as { toSQL(): { params: unknown[] } })
                .toSQL()
                .params.includes(bArgs.claimKey),
            );
            if (isB) {
              reached();
              await wait;
            }
            return db.batch(queries);
          };
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const pendingB = claimSignup("owner", bArgs, config);
    await entering;
    const a = await claimSignup(
      "owner",
      { ...input(), claimKey: "winning_claim_A" },
      config,
    );
    await confirmSignup("letters", token(a), config);
    await db.delete(schema.contacts);
    releaseB();
    const b = await pendingB;
    if ("confirmationUrl" in b)
      await confirmSignup("letters", token(b), config);
    expect(
      await signupReceipt(
        "owner",
        { newsletterId: config.newsletterId, claimKey: bArgs.claimKey },
        config,
      ),
    ).toMatchObject({ newActive: false, baseline: "existing" });
    expect(
      (await db.select().from(schema.signupClaims)).filter(
        (c) => c.baseline === "absent",
      ),
    ).toHaveLength(1);
  });
});

describe("stable claim replay", () => {
  it("concurrent identical authenticated claims share one pending contact and confirmation link", async () => {
    const args = input();
    const [a, b] = await Promise.all([
      claimSignup("owner", args, config),
      claimSignup("owner", args, config),
    ]);
    expect(a).toEqual(b);
    expect(await db.select().from(schema.contacts)).toHaveLength(1);
    expect(
      (await db.select().from(schema.signupClaims)).filter(
        (c) => c.firstRecipient,
      ),
    ).toHaveLength(1);
  });
  it("a consumed token cannot reactivate a later pending resubscription", async () => {
    const result = await claim();
    const t = token(result);
    await confirmSignup("letters", t, config);
    await db
      .update(schema.contacts)
      .set({ status: "pending", confirmedAt: null });
    expect(await confirmSignup("letters", t, config)).toMatchObject({
      status: "existing",
    });
    expect(await status()).toBe("pending");
    expect(
      await signupReceipt(
        "owner",
        { newsletterId: config.newsletterId, claimKey: input().claimKey },
        config,
      ),
    ).toMatchObject({ newActive: false });
  });
});

describe("consumed token concurrency", () => {
  it("a paused old confirmation cannot activate a later native pending resubscription", async () => {
    const { subscribe } = await import("./public");
    const result = await claim();
    const t = token(result);
    let release!: () => void,
      reached!: () => void,
      pause = true;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entering = new Promise<void>((resolve) => {
      reached = resolve;
    });
    fixtureDb.current = new Proxy(db, {
      get(target, key, receiver) {
        if (key === "batch")
          return async (queries: Parameters<typeof db.batch>[0]) => {
            if (pause) {
              pause = false;
              reached();
              await wait;
            }
            return db.batch(queries);
          };
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const delayed = confirmSignup("letters", t, config);
    await entering;
    await confirmSignup("letters", t, config);
    const consumedAt = (await db.select().from(schema.signupClaims))[0]
      .confirmedAt;
    await db.update(schema.contacts).set({ status: "unsubscribed" });
    await subscribe(
      "letters",
      { email: input().email, firstName: "", source: "website", tags: [] },
      config.origin,
    );
    expect(await status()).toBe("pending");
    release();
    await delayed;
    expect(await status()).toBe("pending");
    expect((await db.select().from(schema.signupClaims))[0].confirmedAt).toBe(
      consumedAt,
    );
  });
});

describe("Gateway tools", () => {
  const env = () =>
    testEnv({
      SIGNUP_NEWSLETTER_ID: config.newsletterId,
      SIGNUP_PUBLIC_ORIGIN: config.origin,
    });
  it("declares honest risks and refuses a read-only connection's write", async () => {
    expect((await listTools(tools)).tools.map((t) => [t.name, t.risk])).toEqual(
      [
        ["claim_signup", "write"],
        ["signup_receipt", "read"],
      ],
    );
    expect(
      await callTool(tools, "claim_signup", input(), {
        user: { id: "owner" },
        env: env(),
        scopes: ["mcp:read"],
      }),
    ).toMatchObject({ error: { code: "forbidden" } });
  });
  it("uses SDK identity; a caller cannot supply an owner id or switch the configured publication", async () => {
    const foreign = await callTool(tools, "claim_signup", input(), {
      user: { id: "other" },
      env: env(),
    });
    expect(foreign).toMatchObject({ result: { isError: true } });
    expect(await db.select().from(schema.contacts)).toHaveLength(0);
    const spoof = await callTool(
      tools,
      "claim_signup",
      { ...input(), ownerId: "owner" },
      { user: { id: "other" }, env: env() },
    );
    expect(spoof).toHaveProperty("error");
  });
});
