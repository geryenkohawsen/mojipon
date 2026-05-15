import { test, expect } from "@playwright/test";

test("kana input produces two variants and downloads a zip", async ({ page }) => {
  await page.goto("/studio");

  const input = page.getByPlaceholder(/type text/i);
  await input.fill("ありがとう");

  await expect(page.getByText("arigatou.png")).toBeVisible();
  await expect(page.getByText("ありがとう.png")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /download zip/i }).click(),
  ]);

  const suggested = download.suggestedFilename();
  expect(suggested).toMatch(/\.zip$/);
});
