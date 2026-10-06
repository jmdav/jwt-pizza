import { Page } from "@playwright/test";
import { test, expect } from "./testSetup";
import { Role, User } from "../src/service/pizzaService";

const ADMIN_EMAIL = "a@jwt.com";
const ADMIN_PASSWORD = "admin";
const ADMIN_USER: User = {
  id: "1",
  name: "常用名字",
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
  roles: [{ role: Role.Admin }],
};

type MockFranchise = {
  id: number;
  name: string;
  admins?: { name: string; email: string }[];
  stores: { id: number; name: string }[];
};

function mockFranchises(includeTestFranchise: boolean): MockFranchise[] {
  const franchises: MockFranchise[] = [
    {
      id: 2,
      name: "LotaPizza",
      stores: [
        { id: 4, name: "Lehi" },
        { id: 5, name: "Springville" },
        { id: 6, name: "American Fork" },
      ],
    },
    { id: 3, name: "PizzaCorp", stores: [{ id: 7, name: "Spanish Fork" }] },
    { id: 4, name: "topSpot", stores: [] },
  ];

  if (includeTestFranchise) {
    franchises.push({
      id: 5,
      name: "test",
      admins: [{ name: ADMIN_USER.name!, email: ADMIN_EMAIL }],
      stores: [],
    });
  }

  return franchises;
}

async function adminInit(page: Page, includeTestFranchise = true) {
  let loggedInUser: User | undefined;
  const franchises = mockFranchises(includeTestFranchise);

  await page.route("*/**/api/auth", async (route) => {
    const request = route.request();
    const loginReq = request.postDataJSON();
    expect(request.method()).toBe("PUT");

    if (
      loginReq.email !== ADMIN_EMAIL ||
      loginReq.password !== ADMIN_PASSWORD
    ) {
      await route.fulfill({ status: 401, json: { error: "Unauthorized" } });
      return;
    }

    loggedInUser = ADMIN_USER;
    await route.fulfill({ json: { user: loggedInUser, token: "abcdef" } });
  });

  await page.route("*/**/api/user/me", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: loggedInUser });
  });

  await page.route(/\/api\/franchise(?:\/[^?]+)?(?:\?.*)?$/, async (route) => {
    const request = route.request();

    if (request.method() === "POST") {
      const franchiseReq = request.postDataJSON();
      const createdFranchise = {
        id: 5,
        name: franchiseReq.name,
        admins: [
          { name: ADMIN_USER.name!, email: franchiseReq.admins[0].email },
        ],
        stores: [],
      };
      franchises.push(createdFranchise);
      await route.fulfill({ status: 201, json: createdFranchise });
      return;
    }

    if (request.method() === "DELETE") {
      const franchiseId = new URL(request.url()).pathname.split("/").pop();
      const index = franchises.findIndex(
        (franchise) => String(franchise.id) === franchiseId,
      );
      if (index >= 0) franchises.splice(index, 1);
      await route.fulfill({ json: {} });
      return;
    }

    expect(request.method()).toBe("GET");
    await route.fulfill({ json: { franchises, more: false } });
  });
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Email address").fill(ADMIN_EMAIL);
  await page.getByPlaceholder("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Login" }).click();
  await page.goto("/admin-dashboard");
}

test("add franchise", async ({ page }) => {
  await adminInit(page, false);
  await loginAsAdmin(page);
  await page.getByRole("button", { name: "Add Franchise" }).click();
  await page.getByRole("textbox", { name: "franchise name" }).fill("test");
  await page
    .getByRole("textbox", { name: "franchisee admin email" })
    .fill(ADMIN_EMAIL);

  const createRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/franchise",
  );
  await page.getByRole("button", { name: "Create" }).click();

  const createRequest = await createRequestPromise;
  expect(createRequest.postDataJSON()).toMatchObject({
    name: "test",
    admins: [{ email: ADMIN_EMAIL }],
  });

  await expect(page).toHaveURL(/\/admin-dashboard$/);
  await page.getByRole("textbox", { name: "Filter franchises" }).fill("test");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("test", { exact: true })).toBeVisible();
});

test("filter franchises", async ({ page }) => {
  await adminInit(page);
  await loginAsAdmin(page);

  const filterRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "GET" &&
      new URL(request.url()).pathname === "/api/franchise" &&
      new URL(request.url()).searchParams.get("name") === "*test*",
  );

  await page.getByRole("textbox", { name: "Filter franchises" }).fill("test");
  await page.getByRole("button", { name: "Submit" }).click();

  const filterRequest = await filterRequestPromise;
  const filterUrl = new URL(filterRequest.url());
  expect(filterUrl.searchParams.get("page")).toBe("0");
  expect(filterUrl.searchParams.get("limit")).toBe("10");
  expect(filterUrl.searchParams.get("name")).toBe("*test*");
});

test("delete franchise", async ({ page }) => {
  await adminInit(page);
  await loginAsAdmin(page);

  const testFranchiseRow = page
    .getByRole("row")
    .filter({ has: page.getByText("test", { exact: true }) });
  await testFranchiseRow
    .getByRole("button", { name: "Close", exact: true })
    .click();

  await expect(page.getByText(/test franchise/)).toBeVisible();

  const deleteRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "DELETE" &&
      new URL(request.url()).pathname === "/api/franchise/5",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();

  const deleteRequest = await deleteRequestPromise;
  expect(new URL(deleteRequest.url()).pathname).toBe("/api/franchise/5");
  await expect(page).toHaveURL(/\/admin-dashboard$/);
  await expect(page.getByText("test", { exact: true })).toHaveCount(0);
});
