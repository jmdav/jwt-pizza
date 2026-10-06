import { Page } from "@playwright/test";
import { test, expect } from "./testSetup";
import { Role, User } from "../src/service/pizzaService";

async function adminInit(page: Page) {
  let loggedInUser: User | undefined;
  const validUsers: Record<string, User> = {
    "a@jwt.com": {
      id: "1",
      name: "常用名字",
      email: "a@jwt.com",
      password: "admin",
      roles: [{ role: Role.Admin }],
    },
  };

  await page.route("*/**/api/auth", async (route) => {
    const loginReq = route.request().postDataJSON();
    const user = validUsers[loginReq.email];
    if (!user || user.password !== loginReq.password) {
      await route.fulfill({ status: 401, json: { error: "Unauthorized" } });
      return;
    }
    loggedInUser = validUsers[loginReq.email];
    const loginRes = {
      user: loggedInUser,
      token: "abcdef",
    };
    expect(route.request().method()).toBe("PUT");
    await route.fulfill({ json: loginRes });
  });

  await page.route("*/**/api/user/me", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: loggedInUser });
  });

  const franchiseRes = {
    franchises: [
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
    ],
  };

  await page.route(/\/api\/franchise(\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") {
      const franchiseReq = route.request().postDataJSON();
      const createdFranchise = {
        id: 5,
        name: franchiseReq.name,
        admins: [{ name: "常用名字", email: franchiseReq.admins[0].email }],
        stores: [],
      };
      franchiseRes.franchises.push(createdFranchise);
      await route.fulfill({ status: 201, json: createdFranchise });
      return;
    }

    expect(route.request().method()).toBe("GET");
    await route.fulfill({ json: { ...franchiseRes, more: false } });
  });
}

test("add franchise", async ({ page }) => {
  await adminInit(page);

  await page.goto("/login");
  await page.getByPlaceholder("Email address").fill("a@jwt.com");
  await page.getByPlaceholder("Password").fill("admin");
  await page.getByRole("button", { name: "Login" }).click();

  await page.goto("/admin-dashboard");
  await page.getByRole("button", { name: "Add Franchise" }).click();
  await page.getByRole("textbox", { name: "franchise name" }).fill("test");
  await page
    .getByRole("textbox", { name: "franchisee admin email" })
    .fill("a@jwt.com");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/admin-dashboard$/);
  await expect(page.getByText("test", { exact: true })).toBeVisible();
});
