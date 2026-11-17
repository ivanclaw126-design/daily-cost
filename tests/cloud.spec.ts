import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { emptyLedger, freshItem, type Ledger } from "../src/model";

const TOKEN_KEY = "riyou-shu:github-token:v1";
const LOCAL_KEY = "riyou-shu:ledger:v1";
const fakeToken = "github_pat_test_only";
function githubState() {
  let ledger = emptyLedger();
  let revision = 1;
  let unavailable = false;
  let writes = 0;
  const sha = () => revision.toString(16).padStart(40, "0");
  return {
    get ledger() {
      return ledger;
    },
    get writes() {
      return writes;
    },
    set unavailable(value: boolean) {
      unavailable = value;
    },
    attach: async (context: BrowserContext) => {
      await context.route("https://api.github.com/**", async (route) => {
        if (unavailable) return route.abort();
        const request = route.request();
        if (request.method() === "PUT") {
          const body = request.postDataJSON();
          if (body.sha !== sha())
            return route.fulfill({
              status: 409,
              json: { message: "stale sha" },
            });
          ledger = JSON.parse(
            Buffer.from(body.content, "base64").toString("utf8"),
          );
          revision++;
          writes++;
          return route.fulfill({ json: { content: { sha: sha() } } });
        }
        return route.fulfill({
          json: {
            type: "file",
            sha: sha(),
            encoding: "base64",
            content: Buffer.from(JSON.stringify(ledger)).toString("base64"),
          },
        });
      });
    },
  };
}
async function settings(page: Page) {
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "设置与备份", exact: true })
    .click();
}
async function connect(page: Page) {
  await page.goto("/");
  await settings(page);
  await page.getByLabel("访问令牌", { exact: true }).fill(fakeToken);
  await page.getByRole("button", { name: "连接同一份云端账本" }).click();
  await expect(page.locator(".cloud-banner")).toBeVisible();
}
async function addItem(page: Page, name: string, amount: string) {
  await page
    .getByRole("button", { name: "添加第一个项目", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("项目名称").fill(name);
  await dialog.getByLabel("每期金额").fill(amount);
  await dialog.getByLabel("开始日期").fill("2026-01-01");
  await dialog.getByLabel("下次付费日期").fill("2026-12-01");
  await dialog.getByRole("button", { name: "保存项目" }).click();
}

test("two devices share one GitHub file; stale writes preserve the newer ledger and a downloadable draft", async ({
  browser,
}) => {
  const remote = githubState();
  const a = await browser.newContext(),
    b = await browser.newContext();
  await remote.attach(a);
  await remote.attach(b);
  try {
    const first = await a.newPage(),
      second = await b.newPage();
    await connect(first);
    await connect(second);
    await addItem(first, "跨设备订阅 ☁️", "31");
    await expect(first.locator(".project-card")).toContainText("跨设备订阅");
    await expect.poll(() => remote.ledger.items.length).toBe(1);
    expect(
      await first.evaluate(() => localStorage.getItem("riyou-shu:ledger:v1")),
    ).toBeNull();
    await second
      .getByRole("button", { name: "读取最新账本", exact: true })
      .click();
    await expect(second.locator(".project-card")).toContainText("跨设备订阅");
    await second.getByRole("button", { name: /编辑跨设备订阅/ }).click();
    await second.getByRole("dialog").getByLabel("每期金额").fill("93");
    await first.getByRole("button", { name: /编辑跨设备订阅/ }).click();
    await first.getByRole("dialog").getByLabel("每期金额").fill("62");
    await first.getByRole("button", { name: "保存修改" }).click();
    await expect.poll(() => remote.ledger.items[0].amount).toBe(62);
    await second.getByRole("button", { name: "保存修改" }).click();
    await expect(second.getByRole("alert")).toContainText(
      "另一台设备更新了账本",
    );
    expect(remote.ledger.items[0].amount).toBe(62);
    expect(remote.writes).toBe(2);
    await second
      .getByRole("dialog")
      .getByRole("button", { name: "取消", exact: true })
      .click();
    const download = second.waitForEvent("download");
    await second.getByRole("button", { name: "下载未保存副本" }).click();
    const draft = await download;
    const stream = await draft.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk);
    expect(JSON.parse(Buffer.concat(chunks).toString()).items[0].amount).toBe(
      93,
    );
    await second.getByRole("button", { name: "重新读取", exact: true }).click();
    await second.getByRole("button", { name: "读取并放弃本页修改" }).click();
    await expect(second.getByRole("alert")).toHaveCount(0);
    await second.reload();
    await expect(second.locator(".project-card")).toContainText("62.00");
  } finally {
    await a.close();
    await b.close();
  }
});

test("old local data migrates only after confirmation; offline writes leave the original remote file intact", async ({
  page,
  context,
}) => {
  const remote = githubState();
  await remote.attach(context);
  const old = emptyLedger();
  old.items = [{ ...freshItem(), name: "旧设备账本", amount: 31 }];
  await page.addInitScript(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: LOCAL_KEY, data: old },
  );
  await connect(page);
  await settings(page);
  expect(remote.ledger.items).toHaveLength(0);
  await page.getByRole("button", { name: "迁移到云端", exact: true }).click();
  expect(remote.ledger.items).toHaveLength(0);
  await page.getByRole("button", { name: "确认迁移到云端" }).click();
  await expect.poll(() => remote.ledger.items.length).toBe(1);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      LOCAL_KEY,
    ),
  ).toEqual(old);
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "我的项目", exact: false })
    .click();
  await page.getByRole("button", { name: "编辑旧设备账本" }).click();
  await page.getByRole("dialog").getByLabel("每期金额").fill("100");
  remote.unavailable = true;
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByRole("alert")).toContainText("保存未确认");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(remote.ledger.items[0].amount).toBe(31);
});

test("memory-only connection leaves no token; a bad remembered token cannot silently open a different local ledger", async ({
  page,
  context,
}) => {
  const remote = githubState();
  await remote.attach(context);
  await page.goto("/");
  await settings(page);
  await page.getByLabel("访问令牌", { exact: true }).fill(fakeToken);
  await page.getByLabel("在这台私人设备记住令牌").uncheck();
  await page.getByRole("button", { name: "连接同一份云端账本" }).click();
  await expect(page.locator(".cloud-banner")).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY),
  ).toBeNull();
  await page.evaluate(({ key, token }) => localStorage.setItem(key, token), {
    key: TOKEN_KEY,
    token: fakeToken,
  });
  await context.route("https://api.github.com/**", (route) =>
    route.fulfill({ status: 401, json: { message: "Bad credentials" } }),
  );
  await page.reload();
  await expect(page.getByRole("alert").first()).toContainText("令牌已失效");
  await expect(page.locator(".app-shell")).toHaveCount(0);
});
