import { expect, test, type Page } from "@playwright/test";
import { backendUrl } from "../dev.config.ts";

// Every test starts from the example's data: its server puts it back on POST /reset.

const asUser = async (page: Page, user: "admin" | "clerk") => {
  await page.goto("/");
  await page.evaluate((u) => localStorage.setItem("steward-demo.user", u), user);
};

const productsTable = (page: Page) => page.locator("table").nth(1);

test.beforeEach(async ({ page, request }) => {
  expect((await request.post(`${backendUrl}/reset`)).status()).toBe(204);
  await asUser(page, "admin");
});

test("the menu of both services, and the dashboard", async ({ page }) => {
  await page.goto("/#/s/shop/dashboard");
  for (const item of ["Dashboard", "Catalog", "Products", "Categories", "Orders", "Payments"]) {
    await expect(page.getByRole("menuitem", { name: item, exact: true }).or(page.getByRole("button", { name: item, exact: true }))).toBeVisible();
  }
  await expect(page.getByText("Open orders")).toBeVisible();
  await expect(page.getByRole("cell", { name: "A-1" })).toBeVisible();
  await expect(page.getByText("Recent payments")).toBeVisible();
});

test("rows carry their meta: tints, cell colors, classes, disabled actions with reasons", async ({ page }) => {
  await page.goto("/#/s/shop/products");
  const table = productsTable(page);
  await expect(table.getByRole("row")).toHaveCount(5);
  await expect(table.getByRole("row").filter({ hasText: "GAME-2" })).toHaveClass(/tag-archived/);
  await expect(table.getByRole("row").filter({ hasText: "BOOK-1" }).getByText("$0.00")).toBeVisible();
  const publish = table.getByRole("row").filter({ hasText: "BOOK-1" }).getByRole("button", { name: "Publish" });
  await expect(publish).toBeDisabled();
  await publish.locator("..").hover();
  await expect(page.getByRole("tooltip")).toHaveText("Out of stock.");
});

test("filters and sorts", async ({ page }) => {
  await page.goto("/#/s/shop/products");
  await page.getByLabel("SKU", { exact: true }).fill("book");
  await expect(productsTable(page).getByRole("row")).toHaveCount(3);
  await page.getByLabel("SKU", { exact: true }).fill("");
  await expect(productsTable(page).getByRole("row")).toHaveCount(5);
  await productsTable(page).getByRole("button", { name: "SKU" }).click();
  await expect(productsTable(page).getByRole("row").nth(1)).toContainText("BOOK-1");
});

test("a text filter names its field; a reference filter searches the titles as the user types", async ({ page }) => {
  await page.goto("/#/s/shop/products");
  await page.getByLabel("Category", { exact: true }).fill("gam");
  await expect(page.getByRole("option")).toHaveText(["Games"]);
  await page.getByRole("option", { name: "Games" }).click();
  await expect(productsTable(page).getByRole("row")).toHaveCount(3);
  await page.goto("/#/s/shop/orders");
  await page.getByLabel("Number", { exact: true }).fill("a-2");
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("row").nth(1)).toContainText("A-2");
});

test("a row opens the record's page in the panel, with its tabs and related rows", async ({ page }) => {
  await page.goto("/#/s/shop/products");
  await productsTable(page).getByRole("row").filter({ hasText: "BOOK-2" }).getByRole("cell").first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "BOOK-2" })).toBeVisible();
  await expect(drawer.getByText("Books").first()).toBeVisible();
  await drawer.getByRole("tab", { name: "Orders" }).click();
  await expect(drawer.getByText("A-2")).toBeVisible();
  await expect(drawer.getByText("bob@example.com")).toBeVisible();
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/#\/s\/shop\/products$/);
});

test("an action asks first, runs and refreshes the rows", async ({ page }) => {
  await page.goto("/#/s/shop/products");
  const row = productsTable(page).getByRole("row").filter({ hasText: "GAME-1" });
  await row.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Publish the product?")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Published.")).toBeVisible();
  await expect(row.getByText("Published")).toBeVisible();
});

test("a form shows the server's errors next to its fields", async ({ page }) => {
  await page.goto("/#/s/shop/products");
  await productsTable(page).getByRole("row").filter({ hasText: "BOOK-2" }).getByRole("button", { name: "Discount" }).click();
  const dialog = page.getByRole("dialog");
  const percent = dialog.getByLabel("Discount, %");
  await expect(percent).toHaveValue("10");
  await percent.fill("60");
  await dialog.getByRole("button", { name: "Discount" }).click();
  await expect(dialog.getByText("At most 50% for a published product.")).toBeVisible();
  await percent.fill("50");
  await dialog.getByRole("button", { name: "Discount" }).click();
  await expect(page.getByText("Discount applied to BOOK-2.")).toBeVisible();
  await expect(productsTable(page).getByRole("row").filter({ hasText: "BOOK-2" })).toContainText("$10.00");
});

test("a form picks a reference, creates a record and opens its page", async ({ page }) => {
  await page.goto("/#/s/shop/products");
  await page.getByRole("button", { name: "New product" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("SKU").fill("TOY-1");
  await dialog.getByRole("button", { name: "Browse" }).click();
  await page.getByRole("dialog").last().getByRole("cell", { name: "Games" }).click();
  await expect(dialog.getByLabel("Category")).toHaveValue("Games");
  await dialog.getByLabel("Price").fill("12");
  await dialog.getByLabel("Stock").fill("4");
  await dialog.getByLabel("Status").click();
  await page.getByRole("option", { name: "Draft" }).click();
  await dialog.getByRole("button", { name: "New product" }).click();
  await expect(page.getByText("Created.")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "TOY-1" })).toBeVisible();
});

test("a failure of the handler is told, and the page stays", async ({ page }) => {
  await page.goto("/#/s/shop/products");
  await productsTable(page).getByRole("row").filter({ hasText: "GAME-1" }).getByRole("cell").first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("GAME-1 is in the open order A-1.")).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "GAME-1" })).toBeVisible();
});

test("deleting from the record's page closes it", async ({ page }) => {
  await page.goto("/#/s/shop/products");
  await productsTable(page).getByRole("row").filter({ hasText: "BOOK-1" }).getByRole("cell").first().click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Deleted.")).toBeVisible();
  await expect(drawer).toHaveCount(0);
  await expect(productsTable(page).getByText("BOOK-1")).toHaveCount(0);
});

test("an action gives a file", async ({ page }) => {
  await page.goto("/#/s/shop/orders");
  const download = page.waitForEvent("download");
  await page.getByRole("row").filter({ hasText: "A-1" }).getByRole("button", { name: "Invoice" }).click();
  expect((await download).suggestedFilename()).toBe("A-1.pdf");
});

test("an action opens a page no menu reaches", async ({ page }) => {
  await page.goto("/#/s/shop/dashboard");
  await page.getByRole("button", { name: "Sync catalog" }).click();
  await expect(page).toHaveURL(/#\/s\/shop\/dashboard\?peek=shop\/sync_report$/);
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Last sync" })).toBeVisible();
});

test("a page of another service, with an embedded record", async ({ page }) => {
  await page.goto("/#/s/shop/dashboard");
  await page.getByRole("link", { name: "ann@example.com" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Ann Smith" })).toBeVisible();
  await expect(drawer.getByText("Amsterdam")).toBeVisible();
  await drawer.getByRole("tab", { name: "Subscriptions" }).click();
  await expect(drawer.getByText("Pro", { exact: true })).toBeVisible();
});

test("every record opens in the one panel, whatever page it is opened from", async ({ page }) => {
  await page.goto("/#/s/shop/categories");
  await page.getByRole("cell", { name: "Books" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: "Books", exact: true })).toBeVisible();
  await panel.getByRole("cell", { name: "BOOK-2" }).click();
  await expect(panel.getByRole("heading", { name: "BOOK-2" })).toBeVisible();
  // An order, which the menu's list opens as well, opens in the panel too: nothing leaves it.
  await panel.getByRole("tab", { name: "Orders" }).click();
  await panel.getByRole("cell", { name: "bob@example.com" }).click();
  await expect(panel.getByRole("heading", { name: "Order A-2" })).toBeVisible();
  await expect(page).toHaveURL(/#\/s\/shop\/categories\?/);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await panel.getByRole("button", { name: "Back" }).click();
  await expect(panel.getByRole("heading", { name: "BOOK-2" })).toBeVisible();
  await panel.getByRole("button", { name: "Back" }).click();
  await expect(panel.getByRole("heading", { name: "Books", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Back" })).toHaveCount(0);
});

test("the panel is in the URL: the browser's Back goes back in it, a reload keeps it", async ({ page }) => {
  await page.goto("/#/s/shop/categories");
  await page.getByRole("cell", { name: "Books" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("cell", { name: "BOOK-2" }).click();
  await expect(panel.getByRole("heading", { name: "BOOK-2" })).toBeVisible();
  await page.reload();
  await expect(panel.getByRole("heading", { name: "BOOK-2" })).toBeVisible();
  await page.goBack();
  await expect(panel.getByRole("heading", { name: "Books", exact: true })).toBeVisible();
  await page.goBack();
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/#\/s\/shop\/categories$/);
});

test("closing the panel leaves no history behind it", async ({ page }) => {
  await page.goto("/#/s/shop/products");
  await page.goto("/#/s/shop/categories");
  await page.getByRole("cell", { name: "Books" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("cell", { name: "BOOK-2" }).click();
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/#\/s\/shop\/products$/);
});

test("the panel opens its page as a page of its own", async ({ page }) => {
  await page.goto("/#/s/shop/products");
  await productsTable(page).getByRole("row").filter({ hasText: "GAME-1" }).getByRole("cell").first().click();
  await page.getByRole("dialog").getByRole("link", { name: "Open as a page" }).click();
  await expect(page).toHaveURL(/#\/s\/shop\/product\/00000002-0000-0000-0000-000000000003$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#react-admin-title")).toContainText("GAME-1");
});

test("closing a page in the panel goes back to the page before", async ({ page }) => {
  await page.goto("/#/s/shop/categories");
  await page.getByRole("cell", { name: "Books" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("cell", { name: "BOOK-1" }).click();
  await panel.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Deleted.")).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Books", exact: true })).toBeVisible();
  await expect(panel.getByRole("cell", { name: "BOOK-1" })).toHaveCount(0);
});

test("Ctrl+click on a row opens its page in a new tab", async ({ page, context }) => {
  await page.goto("/#/s/shop/products");
  const opened = context.waitForEvent("page");
  await productsTable(page).getByRole("row").filter({ hasText: "GAME-1" }).getByRole("cell").first().click({ modifiers: ["ControlOrMeta"] });
  const tab = await opened;
  await expect(tab).toHaveURL(/#\/s\/shop\/product\/00000002-0000-0000-0000-000000000003$/);
  await expect(tab.locator("#react-admin-title")).toContainText("GAME-1");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the middle button on a link opens its page in a new tab", async ({ page, context }) => {
  await page.goto("/#/s/shop/dashboard");
  const opened = context.waitForEvent("page");
  await page.getByRole("link", { name: "Ann", exact: true }).click({ button: "middle" });
  const tab = await opened;
  await expect(tab).toHaveURL(/#\/s\/shop\/customer\//);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the options of an experiment as a bar, colored by their names, in their order", async ({ page }) => {
  await page.goto("/#/s/shop/experiments");
  const row = page.getByRole("row").filter({ hasText: "Search ranking" });
  await expect(row.getByText("Control 40%", { exact: true })).toBeVisible();
  await row.getByText("10%", { exact: true }).hover(); // too narrow for its name
  await expect(page.getByRole("tooltip")).toHaveText("Hybrid 10%");
  // The first option of every experiment is Control: one color in every row.
  const firsts = await page.locator("tbody tr").evaluateAll((rows) =>
    rows.map((r) => getComputedStyle(r.querySelector("td:nth-child(3) div div div")!).backgroundColor),
  );
  expect(firsts).toHaveLength(5);
  expect(new Set(firsts).size).toBe(1);
  await row.getByRole("cell").first().click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: "Search ranking" })).toBeVisible();
  await expect(panel.getByRole("row").nth(1)).toContainText("Control");
  await expect(panel.getByRole("row").nth(4)).toContainText("Hybrid");
  await expect(panel.locator("dl").getByText("Hybrid", { exact: true })).toBeVisible(); // the legend
});

test("a user with fewer rights sees less", async ({ page }) => {
  await asUser(page, "clerk");
  await page.goto("/#/s/shop/dashboard");
  await expect(page.getByText("Open orders")).toBeVisible();
  await expect(page.getByText("Recent payments")).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Payments" })).toHaveCount(0);
  await page.goto("/#/s/shop/products");
  await expect(productsTable(page).getByRole("button", { name: "Publish" })).toHaveCount(0);
});

test("editing a projected reference submits its scalar key and the action's fields only", async ({ page }) => {
  await page.goto("/#/s/shop/products");
  await productsTable(page).getByRole("row").filter({ hasText: "BOOK-2" }).getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Category")).toHaveValue("Books");
  await expect(dialog.getByLabel("Price")).toHaveValue("20");
  await dialog.getByLabel("Price").fill("18");
  const submitted = page.waitForRequest((request) => request.method() === "POST" && /Models\.Product%2[fF]edit$/.test(request.url()));
  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  const payload = (await submitted).postDataJSON().payload;
  expect(Object.keys(payload).sort()).toEqual(["category", "price", "stock"]);
  expect(typeof payload.category).toBe("string");
  expect(payload.price).toBe(18);
  await expect(dialog).toHaveCount(0);
  await expect(productsTable(page).getByRole("row").filter({ hasText: "BOOK-2" })).toContainText("$18.00");
});

test("a slow form submission is locked against clicks and repeated submit events", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  await page.route(/\/actions\/Models\.Product%2[fF]edit$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    calls++;
    await pending;
    await route.continue();
  });
  await page.goto("/#/s/shop/products");
  await productsTable(page).getByRole("row").filter({ hasText: "BOOK-2" }).getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const save = dialog.getByRole("button", { name: "Edit", exact: true });
  try {
    await expect(dialog.getByLabel("Category")).toHaveValue("Books");
    await save.click();
    await expect(save).toBeDisabled();
    await expect.poll(() => calls).toBe(1);
    await dialog.locator("form").evaluate((form) => (form as HTMLFormElement).requestSubmit());
    await expect(save).toBeDisabled();
    expect(calls).toBe(1);
  } finally {
    release();
  }
  await expect(dialog).toHaveCount(0);
});

test("failed action initialization offers retry without an empty editable form", async ({ page }) => {
  let failing = true;
  await page.route(/\/actions\/Models\.Product%2[fF]edit\/initial\?/, async (route) => {
    if (!failing) return route.continue();
    await route.fulfill({ status: 500, json: { message: "Cannot load defaults" } });
  });
  await page.goto("/#/s/shop/products");
  await productsTable(page).getByRole("row").filter({ hasText: "BOOK-2" }).getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("Cannot load defaults");
  await expect(dialog.locator("form")).toHaveCount(0);
  failing = false;
  await dialog.getByRole("button", { name: "Retry" }).click();
  await expect(dialog.getByLabel("Category")).toHaveValue("Books");
});

test("failed global page state stays unavailable until retry succeeds", async ({ page }) => {
  let failing = true;
  await page.route("**/admin/shop/pages/dashboard", async (route) => {
    if (!failing) return route.continue();
    await route.fulfill({ status: 422, json: { message: "Dashboard unavailable" } });
  });
  await page.goto("/#/s/shop/dashboard");
  await expect(page.getByRole("alert")).toContainText("Dashboard unavailable");
  await expect(page.getByRole("button", { name: "Sync catalog" })).toHaveCount(0);
  failing = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("button", { name: "Sync catalog" })).toBeEnabled();
});

test("optional embedded values, empty lists and edited datetimes retain their protocol values", async ({ page }) => {
  const field = (name: string, input: unknown, required = true) => ({ name, label: name, input, required, helperText: null, minLength: null, maxLength: null, minValue: null, maxValue: null });
  const fields = [
    { ...field("details", { type: "json" }, false), fields: [field("city", { type: "text" })] },
    field("approved", { type: "bool" }, false),
    field("tags", { type: "list", of: { type: "select", options: [{ value: "a", label: "A" }] } }),
    field("at", { type: "datetime" }, false),
  ];
  // Exercise form shapes absent from the shop demo; backend acceptance is checked by its fixtures.
  await page.route("**/admin/shop/describe", async (route) => {
    const response = await route.fetch();
    const described = await response.json();
    described.actions.test_form = { id: "test_form", record: null, label: "Test form", confirm: null, width: "md", form: fields };
    described.pages.dashboard.widgets[0].buttons.push({ kind: "action", action: "test_form", label: "Test form", confirm: null, width: "md", hideDisabled: false });
    await route.fulfill({ response, json: described });
  });
  await page.route("**/admin/shop/pages/dashboard", async (route) => {
    const response = await route.fetch();
    const state = await response.json();
    state.meta.actions.enabled.push("test_form");
    await route.fulfill({ response, json: state });
  });
  await page.route("**/admin/shop/actions/test_form/initial", (route) => route.fulfill({ json: { data: { details: null, approved: null, tags: [], at: null }, titles: {} } }));
  const payloads: Record<string, unknown>[] = [];
  await page.route("**/admin/shop/actions/test_form", async (route) => {
    payloads.push(route.request().postDataJSON().payload);
    await route.fulfill({ json: { message: "Accepted", effects: [] } });
  });
  await page.goto("/#/s/shop/dashboard");
  await page.getByRole("button", { name: "Test form", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("city", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Test form", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(payloads[0]).toEqual({ details: null, approved: null, tags: [], at: null });
  await page.getByRole("button", { name: "Test form", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Include details").check();
  await expect(dialog.getByLabel("city")).toBeVisible();
  await dialog.getByRole("button", { name: "Test form", exact: true }).click();
  await expect(dialog.getByText("Required", { exact: true })).toBeVisible();
  await dialog.getByLabel("Include details").uncheck();
  await dialog.getByLabel("at", { exact: true }).fill("2026-11-04T10:30");
  await dialog.getByLabel("at", { exact: true }).blur();
  await dialog.getByRole("button", { name: "Test form", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(payloads[1]).toEqual({ details: null, approved: null, tags: [], at: "2026-11-04T09:30:00.000Z" });
});
