import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";

const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess(["/", "/admin"]);

  // The owner makes a newsletter with a contact; the member makes their own.
  const owner = await (await runtime.context("owner")).newPage();
  async function createNewsletter(page, name, slug) {
    await page.goto("/");
    await page.getByTestId("new-newsletter").click();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("URL slug").fill(slug);
    await Promise.all([page.waitForURL(/\/newsletters\/[^/]+$/), page.getByRole("button", { name: "Create" }).click()]);
    return new URL(page.url()).pathname.split("/")[2];
  }
  const ownerId = await createNewsletter(owner, "Owner Letters", "owner-letters");
  await owner.goto(`/newsletters/${ownerId}/contacts`);
  await owner.getByRole("button", { name: "Add contact" }).click();
  await owner.getByRole("dialog").getByLabel("Email").fill("private.reader@example.com");
  await owner.getByRole("dialog").getByRole("button", { name: "Add" }).click();
  await owner.getByRole("link", { name: "private.reader@example.com" }).click();
  await owner.waitForURL(/\/contacts\/[^/]+$/);
  const contactPath = new URL(owner.url()).pathname;

  const member = await (await runtime.context("member")).newPage();
  const memberId = await createNewsletter(member, "Member Digest", "member-digest");

  // A member never sees or changes another member's newsletter or contacts.
  await member.goto("/");
  await expect(member.getByTestId("newsletter-row")).toHaveCount(1);
  await expect(member.getByText("Owner Letters")).toHaveCount(0);
  for (const path of [`/newsletters/${ownerId}`, `/newsletters/${ownerId}/settings`, `/newsletters/${ownerId}/contacts`, `/newsletters/${ownerId}/campaigns`, contactPath]) {
    await member.goto(path);
    await expect(member.getByText("Newsletter not found")).toBeVisible();
    await expect(member.getByText("private.reader@example.com")).toHaveCount(0);
    await expect(member.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  }
  expect((await runtime.fetch(`/export/contacts/${ownerId}`, { role: "member" })).status).toBe(404);
  expect((await runtime.fetch(`/export/contacts/${ownerId}`, { role: "owner" })).status).toBe(200);
  expect((await runtime.fetch(`/export/contacts/${ownerId}`, { role: "outsider" })).status).toBeGreaterThanOrEqual(401);

  // Admin-only page.
  await member.goto("/admin");
  await expect(member.getByText("Only workspace admins can open this page.")).toBeVisible();
  await expect(member.getByTestId("admin-newsletter-row")).toHaveCount(0);
  await owner.goto("/admin");
  await expect(owner.getByTestId("admin-newsletter-row").filter({ hasText: "Member Digest" })).toBeVisible();

  // Public routes expose only what they should.
  expect((await runtime.fetch("/n/owner-letters")).status).toBe(404); // website off by default
  await owner.goto(`/newsletters/${ownerId}/settings`);
  await owner.getByRole("checkbox", { name: "Public website" }).check();
  await owner.getByRole("button", { name: "Save changes" }).click();
  await expect(owner.getByText("Saved", { exact: true })).toBeVisible();
  const site = await runtime.fetch("/n/owner-letters");
  expect(site.status).toBe(200);
  const html = await site.text();
  expect(html).toContain("Owner Letters");
  expect(html).not.toContain("private.reader@example.com");
  expect((await runtime.fetch("/n/owner-letters/unsubscribe/not-a-token")).status).toBe(404);
  expect((await runtime.fetch("/n/owner-letters/confirm/not-a-token")).status).toBe(404);
  expect((await runtime.fetch("/t/c/unknown?u=https%3A%2F%2Fexample.com")).status).toBe(400);
  for (const path of [`/newsletters/${ownerId}`, `/export/contacts/${ownerId}`, "/admin"]) {
    expect([401, 403]).toContain((await runtime.fetch(path)).status);
  }

  // The app has no sign-in of its own.
  for (const path of ["/login", "/signin", "/signup", "/logout"]) {
    const response = await runtime.fetch(path, { role: "member" });
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('type="password"');
  }
  await member.goto(`/newsletters/${memberId}`);
  await expect(member.getByRole("heading", { name: "Member Digest" })).toBeVisible();
  console.log("authorization: ok");
} finally {
  await runtime.close();
}
