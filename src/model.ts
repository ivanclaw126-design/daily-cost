export type Kind = "subscription" | "asset";
export type Cadence = "month" | "quarter" | "year" | "custom";
export interface Payment {
  id: string;
  date: string;
  amount: number;
  due: string;
}
export interface Item {
  id: string;
  name: string;
  kind: Kind;
  categoryId: string;
  amount: number;
  channel: string;
  startDate: string;
  status: "active" | "paused";
  note: string;
  cadence: Cadence;
  customDays: number;
  anchor: string;
  cycle: number;
  autoRenew: boolean;
  lifeMonths: number;
  residual: number;
  payments: Payment[];
}
export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
}
export interface Ledger {
  version: 1;
  items: Item[];
  categories: Category[];
  demo: boolean;
}
export const STORAGE_KEY = "riyou-shu:ledger:v1";
export const CHANNELS = [
  "支付宝",
  "微信支付",
  "Apple Store",
  "信用卡",
  "银行卡",
  "现金",
  "其他",
];
export const CADENCES: Record<Cadence, string> = {
  month: "月付",
  quarter: "季付",
  year: "年付",
  custom: "自定义天数",
};
export const COLORS = [
  "#49765e",
  "#709e95",
  "#b49b73",
  "#8493ad",
  "#b38383",
  "#9d95a9",
  "#6a8b9b",
  "#90987a",
];
export const DEFAULT_CATEGORIES: Category[] = [
  { id: "software", name: "软件订阅", color: COLORS[0], icon: "software" },
  {
    id: "entertainment",
    name: "影音会员",
    color: COLORS[1],
    icon: "entertainment",
  },
  { id: "digital", name: "数码设备", color: COLORS[2], icon: "digital" },
  { id: "car", name: "汽车出行", color: COLORS[3], icon: "car" },
  { id: "insurance", name: "保险保障", color: COLORS[4], icon: "insurance" },
  { id: "life", name: "生活服务", color: COLORS[5], icon: "life" },
];
export function emptyLedger(): Ledger {
  return {
    version: 1,
    items: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    demo: false,
  };
}
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const MS_DAY = 86_400_000;
export function validDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const time = Date.parse(`${s}T00:00:00Z`);
  return (
    Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === s &&
    s >= "1900-01-01" &&
    s <= "2200-12-31"
  );
}
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_DAY,
  );
}
export function addDays(s: string, days: number): string {
  return new Date(Date.parse(`${s}T00:00:00Z`) + days * MS_DAY)
    .toISOString()
    .slice(0, 10);
}
export function addMonths(s: string, months: number): string {
  const [y, m, day] = s.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + months, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(day, last)))
    .toISOString()
    .slice(0, 10);
}
export function occurrence(item: Item, offset = item.cycle): string {
  if (item.cadence === "custom")
    return addDays(item.anchor, offset * item.customDays);
  return addMonths(
    item.anchor,
    offset * { month: 1, quarter: 3, year: 12 }[item.cadence],
  );
}
export function assetEnd(item: Item): string {
  return addMonths(item.startDate, item.lifeMonths);
}
export function isIncluded(item: Item, date = today()): boolean {
  return (
    item.status === "active" &&
    item.startDate <= date &&
    (item.kind === "asset"
      ? date < assetEnd(item)
      : item.autoRenew || date < occurrence(item))
  );
}
export function dailyCost(item: Item, date = today()): number {
  if (!isIncluded(item, date)) return 0;
  if (item.kind === "asset")
    return (
      (item.amount - item.residual) /
      Math.max(1, daysBetween(item.startDate, assetEnd(item)))
    );
  // Use the actual calendar period containing today, regardless of whether the bill is overdue.
  const [y, m] = date.split("-").map(Number);
  const [ay, am] = item.anchor.split("-").map(Number);
  let idx =
    item.cadence === "custom"
      ? Math.floor(daysBetween(item.anchor, date) / item.customDays)
      : Math.floor(
          ((y - ay) * 12 + m - am) /
            { month: 1, quarter: 3, year: 12 }[item.cadence],
        );
  if (occurrence(item, idx) > date) idx--;
  return (
    item.amount /
    Math.max(1, daysBetween(occurrence(item, idx), occurrence(item, idx + 1)))
  );
}
export function dueItems(items: Item[]): Item[] {
  return items
    .filter(
      (i) => i.kind === "subscription" && i.status === "active" && i.autoRenew,
    )
    .sort((a, b) => occurrence(a).localeCompare(occurrence(b)));
}
export function dueLabel(date: string, now = today()): string {
  const days = daysBetween(now, date);
  return days < 0
    ? `逾期 ${-days} 天`
    : days === 0
      ? "今天到期"
      : days === 1
        ? "明天到期"
        : `${days} 天后`;
}
export function money(n: number): string {
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
export function freshItem(kind: Kind = "subscription"): Item {
  return {
    id: crypto.randomUUID(),
    name: "",
    kind,
    categoryId: kind === "asset" ? "digital" : "software",
    amount: 0,
    channel: "支付宝",
    startDate: today(),
    status: "active",
    note: "",
    cadence: "month",
    customDays: 30,
    anchor: addMonths(today(), 1),
    cycle: 0,
    autoRenew: true,
    lifeMonths: 36,
    residual: 0,
    payments: [],
  };
}
export function validateItem(
  item: Item,
  categories: Category[],
): string | null {
  if (!item.name.trim() || item.name.length > 80)
    return "请输入 1–80 个字的项目名称";
  if (
    !Number.isFinite(item.amount) ||
    item.amount <= 0 ||
    item.amount > 1_000_000_000
  )
    return "请输入大于 0 且不超过 10 亿的金额";
  if (!validDate(item.startDate)) return "请选择有效的开始日期（1900–2200 年）";
  if (!categories.some((c) => c.id === item.categoryId))
    return "请选择一个分类";
  if (item.kind === "asset") {
    if (
      !Number.isInteger(item.lifeMonths) ||
      item.lifeMonths < 1 ||
      item.lifeMonths > 1200
    )
      return "使用时长应为 1–1200 个月";
    if (
      !Number.isFinite(item.residual) ||
      item.residual < 0 ||
      item.residual > item.amount
    )
      return "预计残值应介于 0 与购买金额之间";
  } else {
    if (!validDate(item.anchor) || item.anchor <= item.startDate)
      return "下次付费日期必须晚于开始日期";
    if (
      !Number.isInteger(item.customDays) ||
      item.customDays < 1 ||
      item.customDays > 36500
    )
      return "自定义周期应为 1–36500 天";
  }
  return null;
}
export function parseLedger(input: unknown): Ledger {
  if (!input || typeof input !== "object")
    throw new Error("这不是有效的日有数备份文件");
  const v = input as Ledger;
  if (
    v.version !== 1 ||
    !Array.isArray(v.items) ||
    !Array.isArray(v.categories) ||
    v.items.length > 10000 ||
    v.categories.length > 100
  )
    throw new Error("备份格式或版本不受支持");
  if (
    !v.categories.length ||
    v.categories.some(
      (c) =>
        !c ||
        typeof c.id !== "string" ||
        typeof c.name !== "string" ||
        !c.name.trim() ||
        c.name.length > 40 ||
        !/^#[0-9a-f]{6}$/i.test(c.color) ||
        typeof c.icon !== "string",
    )
  )
    throw new Error("备份中的分类不完整");
  if (
    new Set(v.categories.map((c) => c.id)).size !== v.categories.length ||
    new Set(v.items.map((i) => i?.id)).size !== v.items.length
  )
    throw new Error("备份中存在重复编号");
  for (const i of v.items) {
    if (
      !i ||
      typeof i.id !== "string" ||
      !["asset", "subscription"].includes(i.kind) ||
      !["active", "paused"].includes(i.status) ||
      typeof i.name !== "string" ||
      typeof i.note !== "string" ||
      typeof i.channel !== "string" ||
      !(i.cadence in CADENCES) ||
      typeof i.autoRenew !== "boolean" ||
      !Number.isInteger(i.cycle) ||
      i.cycle < 0 ||
      i.cycle > 100000 ||
      !Array.isArray(i.payments) ||
      validateItem(i, v.categories)
    )
      throw new Error("备份中的项目数据无效，请检查金额、日期与分类");
    for (const p of i.payments)
      if (
        !p ||
        typeof p.id !== "string" ||
        !validDate(p.date) ||
        !validDate(p.due) ||
        !Number.isFinite(p.amount) ||
        p.amount <= 0
      )
        throw new Error("备份中的付款记录无效");
    if (i.kind === "subscription" && !validDate(occurrence(i)))
      throw new Error("备份中的付费日期超出支持范围");
  }
  return {
    version: 1,
    items: v.items,
    categories: v.categories,
    demo: !!v.demo,
  };
}
export function demoLedger(): Ledger {
  const make = (
    name: string,
    categoryId: string,
    amount: number,
    extras: Partial<Item>,
  ): Item => ({
    ...freshItem(),
    name,
    categoryId,
    amount,
    startDate: addMonths(today(), -6),
    ...extras,
  });
  return {
    ...emptyLedger(),
    demo: true,
    items: [
      make("iCloud+", "software", 21, {
        channel: "Apple Store",
        anchor: addDays(today(), 3),
        note: "200 GB，照片和文件安心存放",
      }),
      make("网易云音乐", "entertainment", 188, {
        cadence: "year",
        channel: "微信支付",
        anchor: addDays(today(), 6),
        note: "黑胶 VIP · 每天都有好音乐",
      }),
      make("Notion Plus", "software", 720, {
        cadence: "year",
        channel: "信用卡",
        anchor: addDays(today(), 18),
        note: "个人知识库与项目管理",
      }),
      make("哔哩哔哩大会员", "entertainment", 148, {
        cadence: "year",
        channel: "支付宝",
        anchor: addDays(today(), 26),
      }),
      make("MacBook Air", "digital", 8999, {
        kind: "asset",
        lifeMonths: 48,
        residual: 1800,
        channel: "信用卡",
        note: "工作、创作，以及偶尔的放空",
      }),
      make("iPhone", "digital", 6999, {
        kind: "asset",
        lifeMonths: 36,
        residual: 1500,
        channel: "Apple Store",
      }),
      make("我的汽车", "car", 189800, {
        kind: "asset",
        lifeMonths: 96,
        residual: 45000,
        channel: "银行卡",
        note: "预计使用 8 年",
      }),
      make("汽车商业险", "insurance", 3860, {
        cadence: "year",
        channel: "支付宝",
        anchor: addDays(today(), 45),
      }),
      make("健身房会员", "life", 1800, {
        cadence: "year",
        channel: "微信支付",
        anchor: addDays(today(), 60),
        status: "paused",
      }),
    ],
  };
}
export function calendarEvents(
  items: Item[],
  start: string,
  end: string,
): { item: Item; date: string; offset: number }[] {
  const events: { item: Item; date: string; offset: number }[] = [];
  for (const item of dueItems(items)) {
    let idx = item.cycle;
    if (item.cadence === "custom")
      idx = Math.max(
        idx,
        Math.floor(daysBetween(item.anchor, start) / item.customDays),
      );
    else {
      const [sy, sm] = start.split("-").map(Number),
        [ay, am] = item.anchor.split("-").map(Number);
      idx = Math.max(
        idx,
        Math.floor(
          ((sy - ay) * 12 + sm - am) /
            { month: 1, quarter: 3, year: 12 }[item.cadence],
        ) - 1,
      );
    }
    for (let guard = 0; guard < 400; guard++, idx++) {
      const date = occurrence(item, idx);
      if (date > end) break;
      if (date >= start) events.push({ item, date, offset: idx });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}
export function icsExport(items: Item[]): string {
  const escape = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Riyoushu//Billing Calendar//ZH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const item of dueItems(items)) {
    const date = occurrence(item);
    // Export the upcoming year as concrete dates: calendar RRULEs skip Jan 31 / leap-day months.
    const events = calendarEvents([item], date, addMonths(date, 12));
    for (const event of events)
      lines.push(
        "BEGIN:VEVENT",
        `UID:${escape(item.id)}-${event.offset}@riyoushu`,
        `DTSTAMP:${today().replaceAll("-", "")}T000000Z`,
        `DTSTART;VALUE=DATE:${event.date.replaceAll("-", "")}`,
        `DTEND;VALUE=DATE:${addDays(event.date, 1).replaceAll("-", "")}`,
        `SUMMARY:${escape(item.name)} 续费 ¥${item.amount}`,
        `DESCRIPTION:${escape(`${CADENCES[item.cadence]} · ${item.channel}\n来自日有数；请核对实际账单。`)}`,
        "BEGIN:VALARM",
        "TRIGGER:-P3D",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escape(item.name)} 即将续费`,
        "END:VALARM",
        "END:VEVENT",
      );
  }
  lines.push("END:VCALENDAR");
  // RFC 5545: fold physical lines at 75 UTF-8 octets without splitting characters.
  const encoder = new TextEncoder();
  return (
    lines
      .map((line) => {
        let part = "",
          out = "";
        for (const char of line) {
          if (encoder.encode(part + char).length > 75) {
            out += part + "\r\n";
            part = " ";
          }
          part += char;
        }
        return out + part;
      })
      .join("\r\n") + "\r\n"
  );
}
