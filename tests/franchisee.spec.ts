import { Page } from "@playwright/test";
import { test, expect } from "./testSetup";
import { Role, User } from "../src/service/pizzaService";

const FRANCHISEE_EMAIL = "f@jwt.com";
const FRANCHISEE_PASSWORD = "franchisee";
const FRANCHISEE_USER: User = {
  id: "3",
  name: "Pizza Franchisee",
  email: FRANCHISEE_EMAIL,
  password: FRANCHISEE_PASSWORD,
  roles: [{ role: Role.Franchisee, objectId: "2" }],
};

async function franchiseeInit(page: Page) {
  let loggedInUser: User | undefined;
  const franchise = {
    id: "2",
    name: "LotaPizza",
    stores: [
      { id: "4", name: "Lehi", totalRevenue: 0.082 },
      { id: "5", name: "Springville", totalRevenue: 0.041 },
    ],
  };

  await page.route("*/**/api/auth", async (route) => {
    const request = route.request();
    const loginRequest = request.postDataJSON();
    expect(request.method()).toBe("PUT");

    if (
      loginRequest.email !== FRANCHISEE_EMAIL ||
      loginRequest.password !== FRANCHISEE_PASSWORD
    ) {
      await route.fulfill({ status: 401, json: { error: "Unauthorized" } });
      return;
    }

    loggedInUser = FRANCHISEE_USER;
    await route.fulfill({
      json: { user: loggedInUser, token: "abcdef" },
    });
  });

  await page.route("*/**/api/user/me", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: loggedInUser });
  });

  await page.route(/\/api\/franchise\/[^/]+(?:\/store)?$/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === "POST") {
      expect(path).toBe("/api/franchise/2/store");
      const storeRequest = request.postDataJSON();
      const createdStore = {
        id: "6",
        name: storeRequest.name,
        totalRevenue: 0,
      };
      franchise.stores.push(createdStore);
      await route.fulfill({ status: 201, json: createdStore });
      return;
    }

    expect(request.method()).toBe("GET");
    expect(path).toBe("/api/franchise/3");
    await route.fulfill({ json: [franchise] });
  });
}

async function loginAsFranchisee(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Email address").fill(FRANCHISEE_EMAIL);
  await page.getByPlaceholder("Password").fill(FRANCHISEE_PASSWORD);
  await page.getByRole("button", { name: "Login" }).click();
  await page.goto("/franchise-dashboard");
}

test("create store", async ({ page }) => {
  await franchiseeInit(page);
  await loginAsFranchisee(page);

  await page.getByRole("button", { name: "Create store" }).click();
  await page.getByRole("textbox", { name: "store name" }).fill("American Fork");

  const createRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/franchise/2/store",
  );
  await page.getByRole("button", { name: "Create" }).click();

  const createRequest = await createRequestPromise;
  expect(createRequest.postDataJSON()).toMatchObject({
    id: "",
    name: "American Fork",
  });
  await expect(page).toHaveURL(/\/franchise-dashboard$/);
});

test("list stores", async ({ page }) => {
  await franchiseeInit(page);

  const franchiseRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "GET" &&
      new URL(request.url()).pathname === "/api/franchise/3",
  );
  await loginAsFranchisee(page);

  const franchiseRequest = await franchiseRequestPromise;
  expect(new URL(franchiseRequest.url()).pathname).toBe("/api/franchise/3");
  await expect(
    page.getByRole("cell", { name: "Lehi", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Springville", exact: true }),
  ).toBeVisible();
});
