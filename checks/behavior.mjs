import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";
import { fakeGatewayOptions, sentEmails, poll } from "./fake-gateway.mjs";

const runtime = await startRuntime(fakeGatewayOptions());
const host = runtime.hostname;
const linksIn = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));
const pathOf = (url) => { const u = new URL(url); expect(u.hostname).toBe(host); return u.pathname + u.search; };

try {
  const page = await (await runtime.context("owner")).newPage();

  // F001: create a newsletter and its sender settings.
  await page.goto("/");
  await runtime.assertBackLink(page);
  await page.getByTestId("new-newsletter").click();
  await page.getByLabel("Name").fill("Field Notes");
  await page.getByLabel("URL slug").fill("field-notes");
  await Promise.all([page.waitForURL(/\/newsletters\/[^/]+$/), page.getByRole("button", { name: "Create" }).click()]);
  const nid = new URL(page.url()).pathname.split("/")[2];
  const base = `/newsletters/${nid}`;

  await page.goto(`${base}/settings`);
  await page.getByLabel("Description").fill("Seasonal notes from a small market garden.");
  await page.getByLabel("From name").fill("Ana Ruiz");
  await page.getByLabel("Reply-to address").fill("ana@example.com");
  await page.getByLabel("Postal address").fill("12 Harbour Road, Bristol BS1 4XY");
  await page.getByRole("checkbox", { name: "Confirmed opt-in" }).check();
  await page.getByRole("checkbox", { name: "Welcome email" }).check();
  await page.getByLabel("Welcome subject").fill("Welcome to Field Notes");
  await page.getByLabel("Welcome message").fill("Hi {{first_name|there}}, thanks for joining.");
  await page.getByRole("checkbox", { name: "Public website" }).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Postal address")).toHaveValue("12 Harbour Road, Bristol BS1 4XY");
  await expect(page.getByTestId("embed-snippet")).toContainText(`://${host}/n/field-notes/subscribe`);

  // F002: contacts by hand, search, filters, status, bulk, export.
  await page.goto(`${base}/contacts`);
  for (const [email, name, tags] of [["maya@example.com", "Maya", "gardening, members"], ["leo@example.org", "Leo", "gardening"], ["sam@example.net", "", ""]]) {
    await page.getByRole("button", { name: "Add contact" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email").fill(email);
    if (name) await dialog.getByLabel("First name").fill(name);
    if (tags) await dialog.getByLabel("Tags").fill(tags);
    await dialog.getByRole("button", { name: "Add" }).click();
    await expect(page.getByTestId("contact-row").filter({ hasText: email })).toBeVisible();
  }
  await page.getByLabel("Search email").fill("*@example.org");
  await page.getByLabel("Search email").press("Enter");
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByTestId("contact-row")).toHaveCount(1);
  await page.goto(`${base}/contacts?tag=gardening`);
  await expect(page.getByTestId("contact-row")).toHaveCount(2);
  await page.goto(`${base}/contacts?source=manual&status=active`);
  await expect(page.getByTestId("contact-row")).toHaveCount(3);

  await page.getByRole("link", { name: "sam@example.net" }).click();
  await expect(page.getByRole("heading", { name: "sam@example.net" })).toBeVisible();
  await page.getByRole("button", { name: "Mark bounced" }).click();
  await expect(page.getByTestId("contact-status")).toHaveText("Bounced");
  await expect(page.getByRole("button", { name: "Mark active" })).toHaveCount(0);

  await page.goto(`${base}/contacts`);
  await page.getByRole("link", { name: "maya@example.com" }).click();
  await page.getByRole("button", { name: "Mark dormant" }).click();
  await expect(page.getByTestId("contact-status")).toHaveText("Dormant");
  await page.getByRole("button", { name: "Mark active" }).click();
  await expect(page.getByTestId("contact-status")).toHaveText("Active");
  await page.getByRole("button", { name: "Add field" }).click();
  await page.getByLabel("Field name").last().fill("city");
  await page.getByLabel("Field value").last().fill("Bristol");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByText("Contact saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Field value").first()).toHaveValue("Bristol");
  await expect(page.getByTestId("activity")).toContainText("Dormant");

  await page.goto(`${base}/contacts?status=active`);
  await page.getByLabel("Select maya@example.com").check();
  await page.getByLabel("Select leo@example.org").check();
  await page.getByRole("button", { name: "Add tag" }).click();
  await page.getByRole("dialog").getByLabel("Tag").fill("spring");
  await page.getByRole("dialog").getByRole("button", { name: "Add tag" }).click();
  await expect(page.getByTestId("contact-row").filter({ hasText: "spring" })).toHaveCount(2);

  // F003: segment from a bulk selection.
  await page.getByLabel("Select maya@example.com").check();
  await page.getByLabel("Select leo@example.org").check();
  await page.getByRole("button", { name: "Create segment" }).click();
  await page.getByRole("dialog").getByLabel("Segment name").fill("Spring readers");
  await page.getByRole("dialog").getByRole("button", { name: "Create segment" }).click();
  await expect(page.getByTestId("contact-row").filter({ hasText: "Spring readers" })).toHaveCount(2);

  const csv = await runtime.fetch(`${base.replace("/newsletters/", "/export/contacts/")}?tag=gardening`, { role: "owner" });
  expect(csv.status).toBe(200);
  const csvText = await csv.text();
  expect(csvText).toContain("maya@example.com");
  expect(csvText).not.toContain("sam@example.net");

  await page.goto(`${base}/segments`);
  await expect(page.getByTestId("segment-row").filter({ hasText: "Spring readers" })).toContainText("2 of 2 active");
  await page.getByRole("button", { name: "New segment" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Members only");
  await page.getByRole("dialog").getByLabel("Has all of these tags").fill("members");
  await page.getByRole("dialog").getByRole("button", { name: "Save segment" }).click();
  await expect(page.getByTestId("segment-row").filter({ hasText: "Members only" })).toContainText("1 of 2 active");
  await page.getByRole("link", { name: "Members only" }).click();
  await expect(page.getByTestId("contact-row")).toHaveCount(1);
  await expect(page.getByTestId("contact-row")).toContainText("maya@example.com");

  // F005: public signup with confirmed opt-in, from the site's form.
  const signup = await runtime.fetch("/n/field-notes/subscribe", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "email=nora%40example.com&first_name=Nora&source=website",
  });
  expect(signup.status).toBe(200);
  expect(await signup.text()).toContain("Check your inbox");
  const confirmMail = await poll(async () => (await sentEmails(runtime)).find((m) => m.to === "nora@example.com"));
  const confirmLink = linksIn(confirmMail.html).find((l) => l.includes("/confirm/"));
  const confirmed = await runtime.fetch(pathOf(confirmLink));
  expect(confirmed.status).toBe(200);
  expect(await confirmed.text()).toContain("confirmed");
  await poll(async () => (await sentEmails(runtime)).find((m) => m.to === "nora@example.com" && m.subject === "Welcome to Field Notes"));
  const again = await runtime.fetch("/n/field-notes/subscribe", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "email=nora%40example.com&tags=market",
  });
  expect(again.status).toBe(200);
  await page.goto(`${base}/contacts?q=nora`);
  await expect(page.getByTestId("contact-row")).toContainText("Active");
  await expect(page.getByTestId("contact-row")).toContainText("market");
  await expect(page.getByTestId("contact-row")).toContainText("Website");

  // F004: write, review, test, send to a segment.
  await page.goto(`${base}/campaigns`);
  await Promise.all([page.waitForURL(/\/campaigns\/[^/]+$/), page.getByRole("button", { name: "New campaign" }).click()]);
  const cpath = new URL(page.url()).pathname;
  await expect(page.getByTestId("review")).toContainText("Add a subject");
  await page.getByLabel("Subject").fill("Tomatoes, seed swaps and the first frost");
  await page.getByLabel("Preview text").fill("What to plant before winter.");
  await page.getByLabel("Content").fill("# Hello {{first_name|friend}}\n\nThe seed swap is on Saturday. [Read the planting guide](https://garden.example.com/guide)\n\n[[Reserve a table]](https://garden.example.com/swap)\n\nTODO add photos");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await expect(page.getByTestId("preview")).toContainText("Hello friend");
  await page.getByRole("button", { name: "Phone" }).click();
  await expect(page.getByTestId("preview")).toContainText("Reserve a table");
  await expect(page.getByTestId("review")).toContainText("placeholder text");
  await expect(page.getByTestId("review")).toContainText("No test sent");
  await expect(page.getByTestId("review")).not.toContainText("Add a subject");
  await page.getByLabel("Content").fill("# Hello {{first_name|friend}}\n\nThe seed swap is on Saturday. [Read the planting guide](https://garden.example.com/guide)\n\n[[Reserve a table]](https://garden.example.com/swap)");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByTestId("review")).not.toContainText("placeholder text");
  await page.getByRole("button", { name: "Send test" }).click();
  await expect(page.getByText("Test sent to owner@example.test")).toBeVisible();
  await expect(page.getByTestId("review")).not.toContainText("No test sent");
  await page.getByLabel("Audience").selectOption({ label: "Spring readers" });
  await expect(page.getByTestId("recipient-count")).toContainText("2");
  await page.getByRole("button", { name: "Send now" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Send" }).click();
  await poll(async () => { await page.reload(); return (await page.getByTestId("campaign-status").textContent()) === "Sent"; });
  const issueMails = await poll(async () => { const m = (await sentEmails(runtime)).filter((x) => x.subject === "Tomatoes, seed swaps and the first frost" && x.to !== "owner@example.test"); return m.length === 2 && m; });
  const mayaMail = issueMails.find((m) => m.to === "maya@example.com");
  expect(mayaMail.html).toContain("Hello Maya");
  expect(mayaMail.html).toContain("12 Harbour Road, Bristol BS1 4XY");
  expect(Object.keys(mayaMail.headers ?? {}).map((k) => k.toLowerCase())).toContain("list-unsubscribe");

  // F006: opens and clicks.
  const pixel = mayaMail.html.match(/src="([^"]*\/t\/o\/[^"]+)"/)[1];
  const opened = await runtime.fetch(pathOf(pixel));
  expect(opened.status).toBe(200);
  expect(opened.headers.get("content-type")).toContain("image/gif");
  const tracked = linksIn(mayaMail.html).find((l) => l.includes("/t/c/") && decodeURIComponent(l).includes("garden.example.com/guide"));
  const click = await runtime.fetch(pathOf(tracked));
  expect(click.status).toBe(302);
  expect(click.headers.get("location")).toBe("https://garden.example.com/guide");
  const bad = await runtime.fetch(pathOf(tracked).replace(/u=[^&]+/, "u=" + encodeURIComponent("https://evil.example.net/")));
  expect(bad.status).toBe(400);

  // F005: unsubscribe from the issue email.
  const leoMail = issueMails.find((m) => m.to === "leo@example.org");
  const unsub = linksIn(leoMail.html).find((l) => l.includes("/unsubscribe/"));
  const unsubPage = await runtime.fetch(pathOf(unsub));
  expect(unsubPage.status).toBe(200);
  expect(await unsubPage.text()).toContain("unsubscribed");

  await page.goto(`${cpath}/report`);
  await expect(page.getByTestId("stat-recipients")).toContainText("2");
  await expect(page.getByTestId("stat-delivered")).toContainText("2");
  await expect(page.getByTestId("stat-opens")).toContainText("1");
  await expect(page.getByTestId("stat-opens")).toContainText("50%");
  await expect(page.getByTestId("stat-clicks")).toContainText("1");
  await expect(page.getByTestId("stat-unsubscribes")).toContainText("1");
  await expect(page.getByTestId("link-row").filter({ hasText: "garden.example.com/guide" })).toContainText("1");
  await expect(page.getByTestId("who-row").filter({ hasText: "maya@example.com" })).toBeVisible();

  // F005: the public site lists the sent issue.
  const home = await runtime.fetch("/n/field-notes");
  expect(home.status).toBe(200);
  const homeHtml = await home.text();
  expect(homeHtml).toContain("Tomatoes, seed swaps and the first frost");
  expect(homeHtml).not.toContain("maya@example.com");
  const issuePath = homeHtml.match(/href="(\/n\/field-notes\/p\/[^"]+)"/)[1];
  const issue = await runtime.fetch(issuePath);
  expect(issue.status).toBe(200);
  expect(await issue.text()).toContain("Hello friend");

  // F004: schedule and cancel; pause and resume.
  await page.goto(`${base}/campaigns`);
  await Promise.all([page.waitForURL(/\/campaigns\/[^/]+$/), page.getByRole("button", { name: "New campaign" }).click()]);
  const c2 = new URL(page.url()).pathname.split("/").pop();
  await page.getByLabel("Subject").fill("Winter seed catalogue");
  await page.getByLabel("Content").fill("Our winter list is ready.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Date").fill(tomorrow);
  await page.getByLabel("Time", { exact: true }).selectOption("09:15");
  await page.getByLabel("Time zone").selectOption("Europe/London");
  await page.getByRole("button", { name: "Schedule" }).click();
  await expect(page.getByTestId("campaign-status")).toHaveText("Scheduled");
  await page.getByRole("button", { name: "Cancel schedule" }).click();
  await expect(page.getByTestId("campaign-status")).toHaveText("Draft");

  const db = await runtime.database();
  const maya = await db.prepare("SELECT id FROM contacts WHERE email = 'maya@example.com'").first();
  await db.batch([
    db.prepare("UPDATE campaigns SET status = 'sending', sent_at = ? WHERE id = ?").bind(new Date().toISOString(), c2),
    db.prepare("INSERT INTO deliveries (id, campaign_id, contact_id, status) VALUES (?, ?, ?, 'queued')").bind("d" + "0".repeat(31), c2, maya.id),
  ]);
  await page.reload();
  await expect(page.getByTestId("campaign-status")).toHaveText("Sending");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByTestId("campaign-status")).toHaveText("Paused");
  await page.getByRole("button", { name: "Resume" }).click();
  await poll(async () => { await page.reload(); return (await page.getByTestId("campaign-status").textContent()) === "Sent"; });

  // F006: overview and contact rates.
  await page.goto(`${base}/contacts?q=maya`);
  await page.getByRole("link", { name: "maya@example.com" }).click();
  await expect(page.getByTestId("contact-rates")).toContainText("Opens");
  await expect(page.getByTestId("activity")).toContainText("Opened");

  const phone = await (await runtime.context("owner", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto(`${base}/contacts`);
  await expect(phone.getByRole("heading", { name: "Contacts" })).toBeVisible();
  await expect(phone.getByTestId("contact-row").first()).toBeVisible();

  await page.goto(base);
  await expect(page.getByTestId("stat-active")).toContainText("2");
  await expect(page.getByTestId("signups-chart")).toBeVisible();
  await expect(page.getByTestId("recent-campaign").filter({ hasText: "Tomatoes" })).toContainText("50%");
  await runtime.screenshot(page);
  console.log("behavior: ok");
} finally {
  await runtime.close();
}
