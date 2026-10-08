import { Page } from "@playwright/test";
import { test, expect } from "./testSetup";
import { Role, User } from "../src/service/pizzaService";

const DINER_EMAIL = "d@jwt.com";
const DINER_PASSWORD = "a";
const DINER_USER: User = {
  id: "3",
  name: "Kai Chen",
  email: DINER_EMAIL,
  password: DINER_PASSWORD,
  roles: [{ role: Role.Diner }],
};

const orderHistory = {
  id: "history-1",
  dinerId: "3",
  orders: [
    {
      id: "23",
      franchiseId: "2",
      storeId: "4",
      date: "2024-01-15T12:00:00.000Z",
      items: [
        { menuId: "1", description: "Veggie", price: 0.0038 },
        { menuId: "2", description: "Pepperoni", price: 0.0042 },
      ],
    },
  ],
};

async function dinerInit(page: Page) {
  let loggedInUser: User | undefined;

  await page.route("*/**/api/auth", async (route) => {
    const request = route.request();
    const loginRequest = request.postDataJSON();
    expect(request.method()).toBe("PUT");

    if (
      loginRequest.email !== DINER_EMAIL ||
      loginRequest.password !== DINER_PASSWORD
    ) {
      await route.fulfill({ status: 401, json: { error: "Unauthorized" } });
      return;
    }

    loggedInUser = DINER_USER;
    await route.fulfill({
      json: { user: loggedInUser, token: "abcdef" },
    });
  });

  await page.route("*/**/api/user/me", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: loggedInUser });
  });

  await page.route("*/**/api/order", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: orderHistory });
  });
}

async function loginAsDiner(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Email address").fill(DINER_EMAIL);
  await page.getByPlaceholder("Password").fill(DINER_PASSWORD);
  await page.getByRole("button", { name: "Login" }).click();
  await page.goto("/diner-dashboard");
}

test("diner order history", async ({ page }) => {
  await dinerInit(page);

  const ordersRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "GET" &&
      new URL(request.url()).pathname === "/api/order",
  );
  await loginAsDiner(page);

  const ordersRequest = await ordersRequestPromise;
  expect(new URL(ordersRequest.url()).pathname).toBe("/api/order");

  await expect(page.getByText("Kai Chen", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "23", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "0.008 ₿", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "2024-01-15T12:00:00.000Z", exact: true }),
  ).toBeVisible();
});
