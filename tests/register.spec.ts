import { Page } from "@playwright/test";
import { test, expect } from "./testSetup";

const REGISTERED_USER = {
  id: "8",
  name: "New Diner",
  email: "newdiner@jwt.com",
  roles: [{ role: "diner" }],
};

async function registerInit(page: Page, registrationStatus = 201) {
  await page.route("*/**/api/auth", async (route) => {
    const request = route.request();
    expect(request.method()).toBe("POST");

    if (registrationStatus !== 201) {
      await route.fulfill({
        status: registrationStatus,
        json: { message: "Email is already registered" },
      });
      return;
    }

    await route.fulfill({
      status: registrationStatus,
      json: { user: REGISTERED_USER, token: "registered-token" },
    });
  });
}

test("register new user", async ({ page }) => {
  await registerInit(page);
  await page.goto("/register");

  await page.getByPlaceholder("Full name").fill("New Diner");
  await page.getByPlaceholder("Email address").fill("newdiner@jwt.com");
  await page.getByPlaceholder("Password").fill("secure-password");

  const registrationRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/auth",
  );
  await page.getByRole("button", { name: "Register" }).click();

  const registrationRequest = await registrationRequestPromise;
  expect(registrationRequest.postDataJSON()).toEqual({
    name: "New Diner",
    email: "newdiner@jwt.com",
    password: "secure-password",
  });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("ND", { exact: true })).toBeVisible();
});

test("registration errors", async ({ page }) => {
  await registerInit(page, 409);
  await page.goto("/register");

  await page.getByPlaceholder("Full name").fill("Existing Diner");
  await page.getByPlaceholder("Email address").fill("newdiner@jwt.com");
  await page.getByPlaceholder("Password").fill("secure-password");
  await page.getByRole("button", { name: "Register" }).click();

  await expect(
    page.getByText('{"code":409,"message":"Email is already registered"}', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
});
