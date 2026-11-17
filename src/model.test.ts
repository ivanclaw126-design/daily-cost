import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  addDays,
  daysBetween,
  validDate,
  dailyCost,
  occurrence,
  freshItem,
  emptyLedger,
  parseLedger,
  calendarEvents,
  icsExport,
  dueItems,
  validateItem,
} from "./model.ts";
import type { Item } from "./model.ts";
const sub = (overrides: Partial<Item> = {}): Item => ({
  ...freshItem(),
  name: "测试订阅",
  amount: 31,
  startDate: "2026-01-01",
  anchor: "2026-01-31",
  ...overrides,
});

test("calendar arithmetic clamps month ends without losing the original billing day", () => {
  const item = sub();
  assert.equal(occurrence(item, 1), "2026-02-28");
  assert.equal(occurrence(item, 2), "2026-03-31");
  assert.equal(occurrence(item, 3), "2026-04-30");
  assert.equal(addMonths("2024-02-29", 12), "2025-02-28");
  assert.equal(addMonths("2024-02-29", 48), "2028-02-29");
  assert.equal(addMonths("2026-01-31", -1), "2025-12-31");
  assert.equal(daysBetween("2026-01-01", "2027-01-01"), 365);
  assert.equal(daysBetween("2024-01-01", "2025-01-01"), 366);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
test("daily subscription costs use actual current period and exclude paused, future and expired records", () => {
  assert.equal(
    dailyCost(sub({ anchor: "2026-02-01", amount: 31 }), "2026-01-15"),
    1,
  );
  assert.equal(
    dailyCost(sub({ anchor: "2026-02-01", amount: 28 }), "2026-02-15"),
    1,
  );
  assert.equal(
    dailyCost(
      sub({ cadence: "quarter", anchor: "2026-04-01", amount: 90 }),
      "2026-01-15",
    ),
    1,
  );
  assert.equal(
    dailyCost(
      sub({ cadence: "year", anchor: "2027-01-01", amount: 365 }),
      "2026-05-15",
    ),
    1,
  );
  assert.equal(
    dailyCost(
      sub({
        cadence: "year",
        anchor: "2025-01-01",
        startDate: "2024-01-01",
        amount: 366,
      }),
      "2024-05-15",
    ),
    1,
  );
  assert.equal(
    dailyCost(
      sub({ cadence: "custom", customDays: 20, amount: 100 }),
      "2026-02-10",
    ),
    5,
  );
  assert.equal(dailyCost(sub({ status: "paused" }), "2026-01-15"), 0);
  assert.equal(dailyCost(sub({ startDate: "2026-01-20" }), "2026-01-15"), 0);
  assert.equal(dailyCost(sub({ autoRenew: false }), "2026-01-31"), 0);
  assert.equal(
    dueItems([sub({ autoRenew: false }), sub({ status: "paused" })]).length,
    0,
  );
});
test("asset amortization subtracts residual and stops at end of expected service", () => {
  const item = sub({
    kind: "asset",
    amount: 465,
    residual: 100,
    lifeMonths: 12,
    startDate: "2026-01-01",
  });
  assert.equal(dailyCost(item, "2026-08-01"), 1);
  assert.equal(dailyCost(item, "2027-01-01"), 0);
  assert.match(
    validateItem({ ...item, residual: 500 }, emptyLedger().categories)!,
    /残值/,
  );
});
test("calendar produces all occurrences and skips paid cycles, paused and non-renewing items", () => {
  const i = sub({
    cadence: "custom",
    anchor: "2026-01-01",
    startDate: "2025-12-01",
    customDays: 7,
  });
  assert.equal(calendarEvents([i], "2026-01-01", "2026-01-31").length, 5);
  assert.equal(
    calendarEvents([{ ...i, cycle: 2 }], "2026-01-01", "2026-01-31").length,
    3,
  );
  assert.equal(
    calendarEvents(
      [
        { ...i, status: "paused" },
        { ...i, autoRenew: false },
      ],
      "2026-01-01",
      "2026-01-31",
    ).length,
    0,
  );
  assert.equal(
    calendarEvents([sub()], "2026-02-01", "2026-02-28")[0].date,
    "2026-02-28",
  );
});
test("validates imported money, dates, identities, references and payment history", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2024-02-29"), true);
  const ledger = { ...emptyLedger(), items: [sub()] };
  assert.deepEqual(parseLedger(JSON.parse(JSON.stringify(ledger))), ledger);
  assert.throws(() => parseLedger({ ...ledger, version: 99 }));
  assert.throws(() => parseLedger({ ...ledger, items: [sub({ amount: -1 })] }));
  assert.throws(() =>
    parseLedger({ ...ledger, items: [sub({ categoryId: "missing" })] }),
  );
  const same = sub();
  assert.throws(() => parseLedger({ ...ledger, items: [same, same] }));
  assert.throws(() =>
    parseLedger({
      ...ledger,
      items: [
        sub({
          payments: [{ id: "p", amount: 1, date: "no", due: "2026-01-01" }],
        }),
      ],
    }),
  );
});
test("ICS contains real clamped renewal dates, escaped names and UTF-8 folded lines", () => {
  const text = icsExport([
    sub({ name: "测试,服务;特别长的中文名字".repeat(8) }),
  ]);
  assert.ok(text.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(text.includes("DTSTART;VALUE=DATE:20260228"));
  assert.ok(text.includes("DTSTART;VALUE=DATE:20260331"));
  assert.ok(text.includes("TRIGGER:-P3D"));
  assert.ok(text.includes("测试\\,服务\\;"));
  for (const line of text.split("\r\n"))
    assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(
    icsExport([sub({ status: "paused" })]).includes("BEGIN:VEVENT"),
    false,
  );
});
