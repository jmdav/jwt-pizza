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

  const users = Array.from({ length: 12 }, (_, index) => ({
    id: index + 10,
    name: index === 0 ? "Casey & Co" : `Diner ${index + 1}`,
    email: `diner${index + 1}@test.com`,
  }));
  await page.route(/\/api\/user(?:\?.*)?$/, async (route) => {
    const request = route.request();
    expect(request.method()).toBe("GET");
    expect(request.headers()["authorization"]).toBe("Bearer abcdef");
    const query = new URL(request.url()).searchParams;
    const pageNumber = Number(query.get("page"));
    const limit = Number(query.get("limit"));
    const name = (query.get("name") || "*").replace(/\*/g, "").toLowerCase();
    const filteredUsers = users.filter((user) => user.name.toLowerCase().includes(name));
    const offset = (pageNumber - 1) * limit;
    await route.fulfill({
      json: {
        users: filteredUsers.slice(offset, offset + limit),
        more: offset + limit < filteredUsers.length,
      },
    });
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
      const path = new URL(request.url()).pathname;
      const pathParts = path.split("/");
      if (pathParts.length === 6 && pathParts[4] === "store") {
        const franchiseId = pathParts[3];
        const storeId = pathParts[5];
        const franchise = franchises.find(
          (candidate) => String(candidate.id) === franchiseId,
        );
        const storeIndex = franchise?.stores.findIndex(
          (store) => String(store.id) === storeId,
        );
        if (franchise && storeIndex !== undefined && storeIndex >= 0) {
          franchise.stores.splice(storeIndex, 1);
        }
        await route.fulfill({ json: null });
        return;
      }

      const franchiseId = pathParts.pop();
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
  await expect(page).toHaveURL("/");
  await page.goto("/admin-dashboard");
}

test("admin user list paginates independently of franchises", async ({ page }) => {
  await adminInit(page);
  await loginAsAdmin(page);

  const users = page.getByRole("table", { name: "Users", exact: true });
  await expect(users.getByRole("cell", { name: "Casey & Co", exact: true })).toBeVisible();
  await expect(users.locator("tbody tr")).toHaveCount(10);
  await expect(users.getByRole("button", { name: "Previous user page" })).toBeDisabled();

  const nextRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/user" && url.searchParams.get("page") === "2";
  });
  await users.getByRole("button", { name: "Next user page" }).click();
  const nextQuery = new URL((await nextRequest).url()).searchParams;
  expect(nextQuery.get("limit")).toBe("10");
  expect(nextQuery.get("name")).toBe("*");
  await expect(users.locator("tbody tr")).toHaveCount(2);
  await expect(users.getByRole("cell", { name: "Diner 11", exact: true })).toBeVisible();
  await expect(users.getByRole("cell", { name: "Diner 12", exact: true })).toBeVisible();
  await expect(users.getByRole("button", { name: "Next user page" })).toBeDisabled();
  await expect(page.getByRole("cell", { name: "LotaPizza", exact: true })).toBeVisible();

  await users.getByRole("button", { name: "Previous user page" }).click();
  await expect(users.getByRole("cell", { name: "Casey & Co", exact: true })).toBeVisible();
  await expect(users.locator("tbody tr")).toHaveCount(10);
});

test("admin user filter encodes names and resets pagination", async ({ page }) => {
  await adminInit(page);
  await loginAsAdmin(page);

  const users = page.getByRole("table", { name: "Users", exact: true });
  await users.getByRole("button", { name: "Next user page" }).click();
  await expect(users.getByRole("cell", { name: "Diner 11", exact: true })).toBeVisible();

  const filterRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === "/api/user" && url.searchParams.get("name") === "*Casey & Co*";
  });
  await users.getByRole("textbox", { name: "Filter users by name" }).fill("Casey & Co");
  await users.getByRole("button", { name: "Apply user filter" }).click();
  const query = new URL((await filterRequest).url()).searchParams;
  expect(query.get("page")).toBe("1");
  expect(query.get("limit")).toBe("10");
  await expect(users.locator("tbody tr")).toHaveCount(1);
  await expect(users.getByRole("cell", { name: "Casey & Co", exact: true })).toBeVisible();
  await expect(users.getByRole("cell", { name: "diner1@test.com", exact: true })).toBeVisible();
  await expect(users.getByRole("button", { name: "Previous user page" })).toBeDisabled();
  await expect(users.getByRole("button", { name: "Next user page" })).toBeDisabled();
});

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

test("delete store", async ({ page }) => {
  await adminInit(page);
  await loginAsAdmin(page);

  const storeRow = page
    .getByRole("row")
    .filter({ has: page.getByText("Lehi", { exact: true }) });
  await storeRow.getByRole("button", { name: "Close", exact: true }).click();

  await expect(page.getByText(/store Lehi/)).toBeVisible();

  const deleteRequestPromise = page.waitForRequest(
    (request) =>
      request.method() === "DELETE" &&
      new URL(request.url()).pathname === "/api/franchise/2/store/4",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();

  const deleteRequest = await deleteRequestPromise;
  expect(new URL(deleteRequest.url()).pathname).toBe(
    "/api/franchise/2/store/4",
  );
  await expect(page).toHaveURL(/\/admin-dashboard$/);
  await expect(page.getByText("Lehi", { exact: true })).toHaveCount(0);
});
