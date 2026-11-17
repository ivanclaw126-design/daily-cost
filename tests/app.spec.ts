import { test, expect } from "@playwright/test";

test("payment channels offer fixed choices and reuse saved custom channels", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "添加第一个项目", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const channel = dialog.getByLabel("支付渠道", { exact: true });
  for (const name of ["信用卡", "微信", "支付宝", "Apple Store"]) {
    await channel.selectOption({ label: name });
    await expect(channel).toHaveValue(name);
  }
  await channel.selectOption("");
  await dialog.getByLabel("新支付渠道名称").fill("  PayPal  ");
  await dialog.getByLabel("项目名称").fill("自定义渠道项目");
  await dialog.getByLabel("每期金额").fill("20");
  await dialog.getByRole("button", { name: "保存项目" }).click();
  await page.reload();
  await page.locator(".project-main").click();
  await expect(dialog.locator(".detail-grid")).toContainText("PayPal");
  await dialog.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(channel).toHaveValue("PayPal");
  await dialog.getByRole("button", { name: "关闭弹窗" }).click();
  await dialog.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "添加项目", exact: true }).click();
  await channel.selectOption("PayPal");
  await expect(channel).toHaveValue("PayPal");
});

test("personal ledger: add, persist, edit, pause/resume, record payment, category and delete", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "添加第一个项目", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("项目名称").fill("测试云服务");
  await dialog.getByLabel("每期金额").fill("31");
  await dialog.getByLabel("开始日期").fill("2026-01-01");
  await dialog.getByLabel("下次付费日期").fill("2026-12-01");
  await dialog.getByRole("button", { name: "保存项目" }).click();
  await expect(page.locator(".project-name")).toContainText("测试云服务");
  await page.reload();
  await expect(page.locator(".project-name")).toContainText("测试云服务");
  await page.locator(".project-main").click();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await dialog.getByLabel("每期金额").fill("62");
  await dialog.getByRole("button", { name: "保存修改" }).click();
  await expect(dialog).toContainText("¥62.00");
  await dialog.getByRole("button", { name: "暂停", exact: true }).click();
  await page.getByRole("button", { name: "暂停项目", exact: true }).click();
  await expect(dialog).toContainText("已暂停");
  await expect(page.locator(".daily-amount")).toContainText("0.00");
  await dialog.getByRole("button", { name: "恢复", exact: true }).click();
  await dialog.getByRole("button", { name: "记已付款" }).click();
  await page.getByRole("button", { name: "确认已付款", exact: true }).click();
  await expect(dialog).toContainText("2027.01.01");
  await expect(dialog.locator(".history")).toContainText(
    "对应 2026.12.01 到期账单",
  );
  await dialog.getByRole("button", { name: "关闭弹窗" }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "分类管理", exact: true })
    .click();
  await page.getByRole("button", { name: "新建分类", exact: true }).click();
  await dialog.getByLabel("分类名称").fill("学习成长");
  await dialog.getByRole("button", { name: "保存分类" }).click();
  await expect(page.locator(".category-manager")).toContainText("学习成长");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: /我的项目/ })
    .click();
  await page.locator(".project-main").click();
  await dialog.getByRole("button", { name: "删除项目", exact: true }).click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "删除项目", exact: true })
    .click();
  await expect(page.locator(".empty-state")).toBeVisible();
});

test("demo, search, calendar, backup export/import and responsive layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: /先看看示例/ }).click();
  await expect(page.locator(".project-card")).toHaveCount(9);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.getByRole("textbox", { name: "搜索项目" }).fill("MacBook");
  await expect(page.locator(".project-card")).toHaveCount(1);
  await page.getByRole("textbox", { name: "搜索项目" }).fill("");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "付费日历", exact: true })
    .click();
  await expect(page.locator(".calendar-grid")).toBeVisible();
  const calDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出日历提醒" }).click();
  expect((await calDownload).suggestedFilename()).toMatch(/\.ics$/);
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "设置与备份", exact: true })
    .click();
  const backupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份", exact: true }).click();
  expect((await backupDownload).suggestedFilename()).toMatch(/\.json$/);
  const ledger = await page.evaluate(() =>
    localStorage.getItem("riyou-shu:ledger:v1"),
  );
  await page.getByRole("button", { name: "清空示例", exact: true }).click();
  await page.getByRole("button", { name: "清空示例，开始记录" }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(ledger!),
    });
  await page.getByRole("button", { name: "替换并导入" }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "总览", exact: true })
    .click();
  await expect(page.locator(".project-card")).toHaveCount(9);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-nav")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "付费日历" })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "我的项目" })
    .click();
  await page.getByRole("button", { name: "添加项目", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("invalid imports preserve existing ledger", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /先看看示例/ }).click();
  const before = await page.evaluate(() =>
    localStorage.getItem("riyou-shu:ledger:v1"),
  );
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":1,"items":[]}'),
    });
  await expect(page.getByRole("status")).toContainText("格式或版本");
  expect(
    await page.evaluate(() => localStorage.getItem("riyou-shu:ledger:v1")),
  ).toBe(before);
});

test("assets use residual value, and corrupted storage is preserved until an explicit restore", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "添加第一个项目", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /设备与资产/ }).click();
  await dialog.getByLabel("项目名称").fill("测试电脑");
  await dialog.getByLabel("购买金额").fill("9999");
  await dialog.getByLabel("预计残值").fill("1999");
  await dialog.getByLabel("预计使用时长").fill("36");
  await dialog.getByRole("button", { name: "保存项目" }).click();
  await expect(page.locator(".project-card")).toContainText("测试电脑");
  const before = await page.evaluate(() =>
    localStorage.getItem("riyou-shu:ledger:v1"),
  );
  await page.evaluate(() =>
    localStorage.setItem("riyou-shu:ledger:v1", "{bad-json"),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("原始数据已保留");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "添加分类", exact: true })
    .click();
  await dialog.getByLabel("分类名称").fill("不应覆盖");
  await dialog.getByRole("button", { name: "保存分类" }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("riyou-shu:ledger:v1")),
  ).toBe("{bad-json");
  await dialog.getByRole("button", { name: "取消" }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "restore.json",
      mimeType: "application/json",
      buffer: Buffer.from(before!),
    });
  await page.getByRole("button", { name: "替换并导入" }).click();
  await expect(page.locator(".project-card")).toContainText("测试电脑");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
