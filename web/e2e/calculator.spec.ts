import { expect, test, type Page } from "@playwright/test";

const press = async (page: Page, ...names: string[]) => {
  for (const name of names) {
    await page.getByRole("button", { name, exact: true }).click();
  }
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // The keyboard listener is attached once React has mounted the calculator.
  await expect(page.getByRole("button", { name: "equals" })).toBeVisible();
  await page.waitForLoadState("networkidle");
});

test("adds decimals exactly through the real API", async ({ page }) => {
  await press(page, "0", "decimal point", "1", "add", "0", "decimal point", "2", "equals");
  await expect(page.getByRole("status")).toHaveText("0.3");
  await expect(page.getByText("0.1 + 0.2 =")).toBeVisible();
});

test("reports division by zero with the API's detail", async ({ page }) => {
  await press(page, "1", "divide", "0", "equals");
  await expect(page.getByRole("status")).toHaveText("Error");
  await expect(page.getByText("division by zero")).toBeVisible();
});

test("chains operations and keeps a history", async ({ page }) => {
  await press(page, "2", "add", "3", "multiply", "4", "equals");
  await expect(page.getByRole("status")).toHaveText("20");

  await page.getByRole("button", { name: "History" }).click();
  const entry = page
    .getByRole("complementary", { name: "History" })
    .getByRole("button", { name: /5 × 4 =/ });
  await expect(entry).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "History" }).click();
  await expect(entry).toBeVisible();
});

test("works from the physical keyboard", async ({ page, isMobile }) => {
  test.skip(isMobile, "no physical keyboard on phones");
  await page.keyboard.type("2^10");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("1,024");
});
