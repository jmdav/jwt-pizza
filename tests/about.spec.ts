import { Page } from "@playwright/test";
import { test, expect } from "./testSetup";
import { Role, User } from "../src/service/pizzaService";

test("login", async ({ page }) => {
  await page.goto("/about");
  await expect(
    page.getByText("Our talented employees at JWT Pizza are true artisans."),
  ).toBeVisible();
});
