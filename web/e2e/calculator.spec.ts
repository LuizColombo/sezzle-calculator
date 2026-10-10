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
  // The live region announces the detail too; the visible line shows it under "Error".
  await expect(page.getByRole("status")).toHaveText("Error: division by zero");
  await expect(page.getByText("division by zero", { exact: true })).toBeVisible();
});

test("chains operations and keeps a history", async ({ page }) => {
  await press(page, "2", "add", "3", "multiply", "4", "equals");
  await expect(page.getByRole("status")).toHaveText("20");

  await page.getByRole("button", { name: "History" }).click();
  // A side panel on desktop, a modal sheet on phones: same element either way.
  const entry = page.locator("#history-panel").getByRole("button", { name: /5 × 4 =/ });
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

test("scientific mode applies operator precedence", async ({ page }) => {
  await page.getByRole("radio", { name: "Scientific" }).click();
  await press(page, "2", "add", "3", "multiply", "4", "equals");
  await expect(page.getByRole("status")).toHaveText("14");
  await press(
    page,
    "all clear",
    "open parenthesis",
    "2",
    "add",
    "3",
    "close parenthesis",
    "multiply",
    "4",
    "equals",
  );
  await expect(page.getByRole("status")).toHaveText("20");
  // Basic mode evaluates as typed: the same keys give 20.
  await page.getByRole("radio", { name: "Basic" }).click();
  await press(page, "2", "add", "3", "multiply", "4", "equals");
  await expect(page.getByRole("status")).toHaveText("20");
});
