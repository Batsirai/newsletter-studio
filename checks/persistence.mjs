import { startRuntime, expect } from "/home/user/oss-new/control/runtime/index.mjs";

const runtime = await startRuntime();
try {
  let page = await (await runtime.context("member")).newPage();
  await page.goto("/");
  await page.getByTestId("new-newsletter").click();
  await page.getByLabel("Name").fill("Kitchen Letters");
  await page.getByLabel("URL slug").fill("kitchen-letters");
  await Promise.all([page.waitForURL(/\/newsletters\/[^/]+$/), page.getByRole("button", { name: "Create" }).click()]);
  const base = new URL(page.url()).pathname;
  await page.goto(`${base}/contacts`);
  await page.getByRole("button", { name: "Add contact" }).click();
  await page.getByRole("dialog").getByLabel("Email").fill("cook@example.com");
  await page.getByRole("dialog").getByLabel("Tags").fill("recipes");
  await page.getByRole("dialog").getByRole("button", { name: "Add" }).click();
  await expect(page.getByTestId("contact-row")).toHaveCount(1);

  await runtime.restart();

  page = await (await runtime.context("member")).newPage();
  await page.goto("/");
  await expect(page.getByTestId("newsletter-row").filter({ hasText: "Kitchen Letters" })).toBeVisible();
  await page.goto(`${base}/contacts`);
  await expect(page.getByTestId("contact-row").filter({ hasText: "cook@example.com" })).toContainText("recipes");
  console.log("persistence: ok");
} finally {
  await runtime.close();
}
