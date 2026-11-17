import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChartBar,
  SquaresFour,
  Stack,
  CalendarBlank,
  Tag,
  GearSix,
  Plus,
  ArrowUpRight,
  ArrowRight,
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  X,
  MagnifyingGlass,
  DownloadSimple,
  UploadSimple,
  Pause,
  Play,
  PencilSimple,
  Trash,
  CreditCard,
  Wallet,
  Laptop,
  Car,
  ShieldCheck,
  MusicNotes,
  Cube,
  Info,
  Receipt,
  ListBullets,
  WarningCircle,
  Plant,
  Question,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import {
  STORAGE_KEY,
  CHANNELS,
  CADENCES,
  COLORS,
  emptyLedger,
  today,
  daysBetween,
  addDays,
  addMonths,
  occurrence,
  assetEnd,
  isIncluded,
  dailyCost,
  dueItems,
  dueLabel,
  money,
  freshItem,
  validateItem,
  parseLedger,
  demoLedger,
  calendarEvents,
  icsExport,
} from "./model";
import type { Ledger, Item, Category, Cadence } from "./model";
import { readCloud, writeCloud, type CloudSnapshot } from "./cloud";
import { CloudGate, GithubSyncSettings } from "./CloudGate";
import "./style.css";
import "./playful.css";
import { Daisy } from "./Daisy";

const ICONS: Record<string, Icon> = {
  software: SquaresFour,
  entertainment: MusicNotes,
  digital: Laptop,
  car: Car,
  insurance: ShieldCheck,
  life: Plant,
  other: Cube,
};
const NAV = [
  { id: "overview", label: "总览", icon: SquaresFour },
  { id: "items", label: "我的项目", icon: Stack },
  { id: "calendar", label: "付费日历", icon: CalendarBlank },
  { id: "categories", label: "分类管理", icon: Tag },
];
type ConfirmAction = {
  title: string;
  body: string;
  label: string;
  danger?: boolean;
  run: () => unknown;
};
const formatDate = (date: string) => date.replaceAll("-", ".");
// Present the original muted category palette in the new theme without changing saved data.
const THEME_CATEGORY_INKS: Record<string, string> = {
  "#49765e": "#ac86d1",
  "#709e95": "#83baa1",
  "#b49b73": "#d6aa61",
  "#8493ad": "#90a7ce",
  "#b38383": "#d08e9e",
  "#9d95a9": "#bc99ce",
  "#6a8b9b": "#82b2c2",
  "#90987a": "#b6bc79",
};
const categoryInk = (color: string) =>
  THEME_CATEGORY_INKS[color.toLowerCase()] || color;
function download(
  content: string,
  filename: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function loadInitial(): { ledger: Ledger; error: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return {
      ledger: raw ? parseLedger(JSON.parse(raw)) : emptyLedger(),
      error: "",
    };
  } catch {
    return {
      ledger: emptyLedger(),
      error:
        "浏览器中的账本暂时无法读取。原始数据已保留，请先导出原始数据，再导入有效备份。",
    };
  }
}
function App({
  cloud,
  token,
  onConnect,
  onDisconnect,
}: {
  cloud?: CloudSnapshot;
  token: string;
  onConnect: (token: string, remember: boolean) => Promise<void>;
  onDisconnect: () => void;
}) {
  const [initial] = useState(() =>
    cloud ? { ledger: cloud.ledger, error: "" } : loadInitial(),
  );
  const revision = useRef(cloud?.revision ?? "");
  const operation = useRef(0);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [cloudError, setCloudError] = useState("");
  const [failedSave, setFailedSave] = useState<Ledger | null>(null);
  const [localBackup, setLocalBackup] = useState(() =>
    cloud ? loadInitial() : null,
  );
  const [ledger, setLedger] = useState(initial.ledger);
  const [storageError, setStorageError] = useState(initial.error);
  const [view, setView] = useState("overview");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("default");
  const [layout, setLayout] = useState("grid");
  const [editor, setEditor] = useState<Item | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<Category | null>(null);
  const [toast, setToast] = useState("");
  const [month, setMonth] = useState(today().slice(0, 7) + "-01");
  const fileRef = useRef<HTMLInputElement>(null);
  const now = today();
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4200);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    if (cloud) return;
    const listen = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        try {
          setLedger(
            e.newValue ? parseLedger(JSON.parse(e.newValue)) : emptyLedger(),
          );
          setStorageError("");
          setToast("账本已与另一个窗口同步");
        } catch {
          setStorageError(
            "另一个窗口写入了无法识别的数据，请导出原始数据后恢复备份。",
          );
        }
      }
    };
    window.addEventListener("storage", listen);
    return () => window.removeEventListener("storage", listen);
  }, []);
  const editing = Boolean(editor || categoryEditor || confirm || failedSave);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const refreshCloud = async (explicit = false) => {
    if (!cloud || saving.current || (!explicit && editingRef.current)) return;
    const currentOperation = ++operation.current;
    try {
      const latest = await readCloud(token);
      if (
        currentOperation !== operation.current ||
        saving.current ||
        (!explicit && editingRef.current)
      )
        return;
      revision.current = latest.revision;
      setLedger(latest.ledger);
      setCloudError("");
      if (explicit) {
        setEditor(null);
        setCategoryEditor(null);
        setConfirm(null);
        setFailedSave(null);
        setToast("已读取最新云端账本");
      }
    } catch (e) {
      if (currentOperation === operation.current)
        setCloudError(e instanceof Error ? e.message : "云端连接失败");
    }
  };
  useEffect(() => {
    if (!cloud) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void refreshCloud();
    };
    const timer = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      ++operation.current;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, []);
  const commit = async (
    next: Ledger,
    message?: string,
    allowRecovery = false,
  ) => {
    if (cloud) {
      if (saving.current) return false;
      saving.current = true;
      setBusy(true);
      ++operation.current;
      try {
        const saved = await writeCloud(next, revision.current, token);
        revision.current = saved.revision;
        setLedger(saved.ledger);
        setCloudError("");
        setFailedSave(null);
        if (message) setToast(message);
        return true;
      } catch (e) {
        setFailedSave(next);
        setCloudError(
          e instanceof Error ? e.message : "云端保存失败，本次修改尚未保存。",
        );
        return false;
      } finally {
        saving.current = false;
        setBusy(false);
      }
    }
    if (storageError && !allowRecovery) {
      setToast("请先导出原始数据，再通过导入备份或清空账本恢复");
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setLedger(next);
      setStorageError("");
      if (message) setToast(message);
      return true;
    } catch {
      setStorageError(
        "保存失败：浏览器存储不可用或空间不足。请导出备份，或允许此网站使用本地存储。",
      );
      return false;
    }
  };
  const updateItem = (item: Item, message: string) =>
    commit(
      {
        ...ledger,
        items: ledger.items.map((i) => (i.id === item.id ? item : i)),
      },
      message,
    );
  const catFor = (item: Item) =>
    ledger.categories.find((c) => c.id === item.categoryId) ||
    ledger.categories[0];
  const active = ledger.items.filter((i) => isIncluded(i, now));
  const totalDaily = active.reduce((n, i) => n + dailyCost(i, now), 0);
  const subDaily = active
    .filter((i) => i.kind === "subscription")
    .reduce((n, i) => n + dailyCost(i, now), 0);
  const assetDaily = totalDaily - subDaily;
  const upcoming = dueItems(ledger.items);
  const overdue = upcoming.filter((i) => occurrence(i) < now);
  const next30 = calendarEvents(ledger.items, now, addDays(now, 29));
  const next30Amount = next30.reduce((n, e) => n + e.item.amount, 0);
  const categoryStats = ledger.categories
    .map((c) => ({
      ...c,
      cost: active
        .filter((i) => i.categoryId === c.id)
        .reduce((n, i) => n + dailyCost(i, now), 0),
      count: ledger.items.filter((i) => i.categoryId === c.id).length,
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.cost - a.cost);
  let filtered = ledger.items.filter(
    (i) =>
      (categoryFilter === "all" || i.categoryId === categoryFilter) &&
      (kindFilter === "all" || i.kind === kindFilter) &&
      (statusFilter === "all" ||
        (statusFilter === "active"
          ? isIncluded(i, now)
          : i.status === "paused")) &&
      `${i.name} ${i.note} ${i.channel}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  if (sort === "daily")
    filtered = [...filtered].sort((a, b) => dailyCost(b) - dailyCost(a));
  if (sort === "amount")
    filtered = [...filtered].sort((a, b) => b.amount - a.amount);
  if (sort === "due")
    filtered = [...filtered].sort((a, b) =>
      (a.kind === "subscription" ? occurrence(a) : "9999").localeCompare(
        b.kind === "subscription" ? occurrence(b) : "9999",
      ),
    );
  const changeView = (next: string) => {
    setView(next);
    setCategoryFilter("all");
    setQuery("");
    setKindFilter("all");
    setStatusFilter("all");
  };
  const exportBackup = () => {
    download(JSON.stringify(ledger, null, 2), `日有所值-备份-${now}.json`);
    setToast("备份已导出");
  };
  const newItem = () => {
    if (storageError) {
      setToast("请先在设置中恢复账本或导出原始数据");
      return;
    }
    setEditor(freshItem());
  };
  const deleteItem = (item: Item) =>
    setConfirm({
      title: `删除「${item.name}」？`,
      body: "该项目和它的付款记录将一并移除。删除前可以在设置中导出完整备份。",
      label: "删除项目",
      danger: true,
      run: async () => {
        if (
          await commit(
            { ...ledger, items: ledger.items.filter((i) => i.id !== item.id) },
            "项目已删除",
          )
        )
          setDetail(null);
      },
    });
  const togglePause = (item: Item) => {
    if (item.status === "active")
      setConfirm({
        title: `暂停「${item.name}」？`,
        body: "暂停后将不再计入每日成本和待付计划，原有日期保留。此操作只修改账本；如需停止扣款，请到原支付平台取消续费。恢复时可在编辑中调整付费日期。",
        label: "暂停项目",
        run: () =>
          updateItem({ ...item, status: "paused" }, "已暂停，记录仍为你保留"),
      });
    else
      updateItem({ ...item, status: "active" }, "已恢复，请核对下次付费日期");
  };
  const payItem = (item: Item) =>
    setConfirm({
      title: `确认已支付 ¥${money(item.amount)}？`,
      body: `这会记录「${item.name}」在 ${formatDate(occurrence(item))} 到期的一笔付款，支付渠道为${item.channel}，并将下次付费推进至 ${formatDate(occurrence(item, item.cycle + 1))}。不会发起真实扣款。`,
      label: "确认已付款",
      run: () =>
        updateItem(
          {
            ...item,
            cycle: item.cycle + 1,
            payments: [
              ...item.payments,
              {
                id: crypto.randomUUID(),
                date: now,
                due: occurrence(item),
                amount: item.amount,
              },
            ],
          },
          "付款已记录，下次付费日期已更新",
        ),
    });
  const loadDemo = () => commit(demoLedger(), "已载入示例，你可以自由体验");
  const clearDemo = () =>
    setConfirm({
      title: "开始自己的账本",
      body: "这会清空当前示例账本。接下来可以添加你的第一个项目。",
      label: "清空示例，开始记录",
      run: async () => {
        if (await commit(emptyLedger(), "新账本已准备好")) setDetail(null);
      },
    });
  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 10_000_000)
        throw new Error("备份文件过大，请选择小于 10 MB 的 JSON 文件");
      const next = parseLedger(JSON.parse(await file.text()));
      setConfirm({
        title: "导入这份账本备份？",
        body: `包含 ${next.items.length} 个项目、${next.categories.length} 个分类。导入会替换当前账本，建议先导出当前备份。`,
        label: "替换并导入",
        run: async () => {
          if (await commit(next, "备份已成功导入", true)) {
            setDetail(null);
            setCategoryFilter("all");
          }
        },
      });
    } catch (e) {
      setToast(e instanceof Error ? e.message : "导入失败，请检查文件格式");
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const selected = ledger.items.find((i) => i.id === detail);
  const dateText = new Date(`${now}T12:00:00`).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="app-shell" inert={busy} aria-busy={busy}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            changeView("overview");
          }}
          aria-label="日有所值首页"
        >
          <span className="brand-mark">
            <img className="brand-logo" src="./icons/riyousuozhi-192-v1.png" alt="" />
          </span>
          <span>
            日有所值<small>DAILY COST</small>
          </span>
        </a>
        <div className="nav-caption">我的账本</div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? "selected" : ""}`}
              onClick={() => changeView(n.id)}
            >
              <n.icon size={20} weight={view === n.id ? "fill" : "regular"} />
              <span>{n.label}</span>
              {n.id === "items" && (
                <span className="nav-count">{ledger.items.length}</span>
              )}
              {n.id === "calendar" && overdue.length > 0 && (
                <span className="nav-alert" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-categories">
          <div className="nav-caption">
            支出分类
            <button
              aria-label="添加分类"
              onClick={() =>
                setCategoryEditor({
                  id: crypto.randomUUID(),
                  name: "",
                  color: COLORS[0],
                  icon: "other",
                })
              }
            >
              <Plus size={15} />
            </button>
          </div>
          {ledger.categories.map((c) => (
            <button
              key={c.id}
              className={`category-nav ${categoryFilter === c.id ? "chosen" : ""}`}
              onClick={() => {
                setView("items");
                setCategoryFilter(c.id);
                setKindFilter("all");
              }}
            >
              <span
                className="category-dot"
                style={{ background: categoryInk(c.color) }}
              />
              <span>{c.name}</span>
              <span>
                {ledger.items.filter((i) => i.categoryId === c.id).length}
              </span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="quiet-note">
            <Daisy tone="lilac" />
            <p>
              让花费看得见
              <br />
              <span>让生活更从容</span>
            </p>
          </div>
          <button
            className={`nav-item ${view === "settings" ? "selected" : ""}`}
            onClick={() => changeView("settings")}
          >
            <GearSix size={20} />
            <span>设置与备份</span>
          </button>
          <div className="local-status">
            <span />
            {cloud
              ? busy
                ? "正在保存到云端…"
                : cloudError
                  ? "云端需要检查"
                  : "私人云端账本"
              : "本地账本 · 自动保存"}
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            我的账本 <CaretRight size={12} />{" "}
            <span>{NAV.find((n) => n.id === view)?.label || "设置与备份"}</span>
          </div>
          <div className="topbar-right">
            <span className="today-label">{dateText}</span>
            <button
              className="help-button"
              aria-label="查看计算规则"
              onClick={() => changeView("settings")}
            >
              <Question size={20} />
            </button>
            <span className="profile">我</span>
          </div>
        </header>
        <div className="page-content">
          {cloud && (
            <div className="cloud-banner" role="status">
              <span>
                <ShieldCheck size={18} />
                {busy ? "正在保存到云端…" : "云端账本 · 所有设备共用一份数据"}
              </span>
              <button
                disabled={busy}
                onClick={() => {
                  if (editing) {
                    setToast(
                      "请先完成或关闭编辑；未保存的修改可下载副本后通过错误提示重新读取。",
                    );
                    return;
                  }
                  void refreshCloud(true);
                }}
              >
                读取最新账本
              </button>
            </div>
          )}
          {cloudError && (
            <div className="error-banner cloud-error" role="alert">
              <WarningCircle size={20} />
              <span>{cloudError}</span>
              {failedSave && (
                <button
                  onClick={() =>
                    download(
                      JSON.stringify(failedSave, null, 2),
                      `日有所值-未保存副本-${now}.json`,
                    )
                  }
                >
                  下载未保存副本
                </button>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  failedSave
                    ? setConfirm({
                        title: "读取最新云端账本？",
                        body: "这会关闭编辑表单并放弃本页尚未保存的修改。请先下载未保存副本，需要时可对照重新录入。",
                        label: "读取并放弃本页修改",
                        run: () => refreshCloud(true),
                      })
                    : void refreshCloud(true)
                }
              >
                重新读取
              </button>
            </div>
          )}
          {ledger.demo && (
            <div className="demo-banner">
              <span>
                <Info size={16} /> 当前是示例账本，所有金额仅用于演示。
              </span>
              <button onClick={clearDemo}>
                开始我的账本 <ArrowRight size={15} />
              </button>
            </div>
          )}
          {storageError && (
            <div className="error-banner" role="alert">
              <WarningCircle size={20} />
              <span>{storageError}</span>
              <button onClick={() => changeView("settings")}>恢复数据</button>
            </div>
          )}
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "overview"
                  ? "A LITTLE CLARITY, EVERY DAY"
                  : view === "calendar"
                    ? "PLAN AHEAD, LIVE AT EASE"
                    : view === "categories"
                      ? "A PLACE FOR EVERYTHING"
                      : view === "settings"
                        ? "YOUR LEDGER, YOUR WAY"
                        : "EVERY LITTLE THING COUNTS"}
              </div>
              <h1>
                {view === "overview"
                  ? "每一天，心中有数。"
                  : view === "calendar"
                    ? "付费日历"
                    : view === "categories"
                      ? "分类管理"
                      : view === "settings"
                        ? "设置与备份"
                        : categoryFilter === "all"
                          ? "我的项目"
                          : ledger.categories.find(
                              (c) => c.id === categoryFilter,
                            )?.name}
              </h1>
              <p>
                {view === "overview"
                  ? "从一份订阅到一辆汽车，看清生活的每日成本。"
                  : view === "calendar"
                    ? "把下一次付费，提前安排好。"
                    : view === "categories"
                      ? "把每笔支出，放进适合它的分类。"
                      : view === "settings"
                        ? "妥善保管记录，随时带走你的账本。"
                        : "认真记录拥有的，也看见每一份花费。"}
              </p>
            </div>
            {view !== "settings" && (
              <button
                className="btn btn-primary"
                onClick={
                  view === "categories"
                    ? () =>
                        setCategoryEditor({
                          id: crypto.randomUUID(),
                          name: "",
                          color: COLORS[0],
                          icon: "other",
                        })
                    : newItem
                }
              >
                <Plus size={18} />
                {view === "categories" ? "新建分类" : "添加项目"}
              </button>
            )}
          </section>

          {view === "overview" && (
            <>
              <div className="metrics-grid">
                <section className="daily-card">
                  <div className="daily-top">
                    <span>
                      <span className="live-dot" /> 每日固定成本
                    </span>
                    <span className="tiny-label">CNY / DAY</span>
                  </div>
                  <div className="daily-amount">
                    <span>¥</span>
                    {money(totalDaily)}
                    <small>/ 天</small>
                  </div>
                  <div className="daily-breakdown">
                    <span>
                      订阅 <b>¥{money(subDaily)}</b>
                    </span>
                    <span className="divider" />
                    <span>
                      资产均摊 <b>¥{money(assetDaily)}</b>
                    </span>
                  </div>
                  <div className="daily-bottom">
                    <span>来自 {active.length} 个使用中的项目</span>
                    <ChartBar size={19} />
                  </div>
                  <div className="hero-decoration" aria-hidden="true">
                    <span className="hero-sparkle sparkle-one">✦</span>
                    <Daisy tone="lilac" />
                    <span className="hero-sparkle sparkle-two">✧</span>
                  </div>
                </section>
                <section className="metric-card">
                  <div className="metric-title">
                    本月均摊成本
                    <span className="soft-icon">
                      <Wallet size={24} weight="duotone" />
                    </span>
                  </div>
                  <div className="metric-value">
                    <span>¥</span>
                    {money(
                      totalDaily *
                        daysBetween(
                          now.slice(0, 7) + "-01",
                          addMonths(now.slice(0, 7) + "-01", 1),
                        ),
                    )}
                  </div>
                  <p>按当前日均 × 本月天数估算</p>
                  <div className="metric-foot">
                    <span className="subtle-tag">
                      {Number(now.slice(5, 7))} 月
                    </span>
                    <span>含订阅与资产均摊</span>
                  </div>
                </section>
                <section className="metric-card">
                  <div className="metric-title">
                    未来 30 天待付
                    <span className="soft-icon">
                      <CalendarBlank size={24} weight="duotone" />
                    </span>
                  </div>
                  <div className="metric-value">
                    <span>¥</span>
                    {money(next30Amount)}
                  </div>
                  <p>
                    {next30.length
                      ? `${next30.length} 笔计划付费，提前留好预算`
                      : "暂无计划付费，轻松一点"}
                  </p>
                  <button
                    className="metric-link"
                    onClick={() => changeView("calendar")}
                  >
                    查看付费日历 <ArrowUpRight size={16} />
                  </button>
                </section>
              </div>
              <div className="insights-grid">
                <section className="panel upcoming-panel">
                  <div className="section-title">
                    <h2>
                      <span className="section-marker" />
                      即将付费{" "}
                      <span className="count-pill">
                        {
                          upcoming.filter(
                            (i) => daysBetween(now, occurrence(i)) <= 30,
                          ).length
                        }
                      </span>
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => changeView("calendar")}
                    >
                      查看全部 <ArrowRight size={15} />
                    </button>
                  </div>
                  {upcoming.length ? (
                    <div className="upcoming-list">
                      {upcoming.slice(0, 3).map((item) => (
                        <button
                          className="upcoming-row"
                          key={item.id}
                          onClick={() => setDetail(item.id)}
                        >
                          <ItemIcon item={item} category={catFor(item)} />
                          <span className="upcoming-name">
                            <strong>{item.name}</strong>
                            <small>
                              {formatDate(occurrence(item))}
                              <span>·</span>
                              {item.channel}
                            </small>
                          </span>
                          <span className="upcoming-price">
                            <strong>¥{money(item.amount)}</strong>
                            <small
                              className={
                                daysBetween(now, occurrence(item)) <= 7
                                  ? "due-soon"
                                  : ""
                              }
                            >
                              {dueLabel(occurrence(item))}
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="small-empty">
                      <CalendarBlank size={32} />
                      <p>付费计划，在这里一目了然</p>
                      <span>添加订阅后，会自动列出下次付费时间</span>
                    </div>
                  )}
                </section>
                <section className="panel category-panel">
                  <div className="section-title">
                    <h2>
                      <span className="section-marker" />
                      每日成本分布
                    </h2>
                    <span className="muted text-xs">按分类</span>
                  </div>
                  <div className="distribution">
                    <Donut stats={categoryStats} total={totalDaily} />
                    <div className="legend">
                      {categoryStats
                        .filter((c) => c.cost > 0)
                        .slice(0, 5)
                        .map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setView("items");
                              setCategoryFilter(c.id);
                            }}
                          >
                            <span
                              className="category-dot"
                              style={{ background: categoryInk(c.color) }}
                            />
                            <span>{c.name}</span>
                            <b>
                              {totalDaily
                                ? Math.round((c.cost / totalDaily) * 100)
                                : 0}
                              %
                            </b>
                          </button>
                        ))}
                      {!totalDaily && (
                        <p className="muted">
                          记录第一笔支出
                          <br />
                          看看钱花在哪里
                        </p>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}

          {(view === "overview" || view === "items") && (
            <section className="projects-section">
              <div className="section-title project-heading">
                <h2>
                  {view === "overview" ? "我的项目" : "项目清单"}
                  <span className="plain-count">{ledger.items.length}</span>
                </h2>
                <div className="display-toggle" aria-label="显示方式">
                  <button
                    aria-label="卡片视图"
                    className={layout === "grid" ? "active" : ""}
                    onClick={() => setLayout("grid")}
                  >
                    <SquaresFour size={17} />
                  </button>
                  <button
                    aria-label="列表视图"
                    className={layout === "list" ? "active" : ""}
                    onClick={() => setLayout("list")}
                  >
                    <ListBullets size={18} />
                  </button>
                </div>
              </div>
              <div className="filters">
                <div className="segment">
                  <button
                    className={kindFilter === "all" ? "active" : ""}
                    onClick={() => setKindFilter("all")}
                  >
                    全部项目
                  </button>
                  <button
                    className={kindFilter === "subscription" ? "active" : ""}
                    onClick={() => setKindFilter("subscription")}
                  >
                    订阅会员
                  </button>
                  <button
                    className={kindFilter === "asset" ? "active" : ""}
                    onClick={() => setKindFilter("asset")}
                  >
                    设备资产
                  </button>
                </div>
                <div className="filter-controls">
                  <label className="search">
                    <MagnifyingGlass size={17} />
                    <input
                      aria-label="搜索项目"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="搜索项目、渠道…"
                    />
                  </label>
                  <select
                    aria-label="项目状态"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">全部状态</option>
                    <option value="active">使用中</option>
                    <option value="paused">已暂停</option>
                  </select>
                  <select
                    aria-label="排序方式"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="default">默认排序</option>
                    <option value="daily">每日成本 ↓</option>
                    <option value="amount">金额 ↓</option>
                    <option value="due">付费日期 ↑</option>
                  </select>
                </div>
              </div>
              {categoryFilter !== "all" && (
                <button
                  className="filter-chip"
                  onClick={() => setCategoryFilter("all")}
                >
                  {ledger.categories.find((c) => c.id === categoryFilter)?.name}
                  <X size={12} />
                </button>
              )}
              {filtered.length ? (
                <div
                  className={`item-grid ${layout === "list" ? "list-layout" : ""}`}
                >
                  {filtered.map((item) => (
                    <ProjectCard
                      key={item.id}
                      item={item}
                      category={catFor(item)}
                      onOpen={() => setDetail(item.id)}
                      onEdit={() => setEditor({ ...item })}
                      onPause={() => togglePause(item)}
                    />
                  ))}
                  <button className="add-card" onClick={newItem}>
                    <span>
                      <Plus size={23} />
                    </span>
                    <strong>记录一份新的花费</strong>
                    <small>订阅、设备，或生活中的其他</small>
                  </button>
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-illustration">
                    <Receipt size={44} weight="duotone" />
                    <span>
                      <Plus size={18} />
                    </span>
                  </div>
                  <h3>
                    {ledger.items.length
                      ? "没有找到匹配的项目"
                      : "从第一份花费，开始了解每一天"}
                  </h3>
                  <p>
                    {ledger.items.length
                      ? "试试其他关键词、分类或筛选条件。"
                      : "记下你的会员订阅、电子设备或汽车，让每一笔拥有都有迹可循。"}
                  </p>
                  <div className="empty-actions">
                    <button className="btn btn-primary" onClick={newItem}>
                      <Plus size={17} />
                      添加第一个项目
                    </button>
                    {!ledger.items.length && (
                      <button className="btn btn-secondary" onClick={loadDemo}>
                        先看看示例 <ArrowRight size={16} />
                      </button>
                    )}
                    {!!ledger.items.length && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setKindFilter("all");
                          setCategoryFilter("all");
                          setStatusFilter("all");
                          setQuery("");
                        }}
                      >
                        重置筛选
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {view === "calendar" && (
            <>
              <div className="calendar-summary">
                <span>
                  <CalendarBlank size={21} />
                  未来 30 天
                </span>
                <strong>¥{money(next30Amount)}</strong>
                <span>{next30.length} 笔计划付费</span>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    download(
                      icsExport(ledger.items),
                      `日有所值-付费提醒-${now}.ics`,
                      "text/calendar;charset=utf-8",
                    );
                    setToast("已导出未来一年的日历提醒，提前 3 天提醒");
                  }}
                >
                  <DownloadSimple size={16} />
                  导出日历提醒
                </button>
              </div>
              {!!overdue.length && (
                <div className="overdue-panel">
                  <h3>
                    <WarningCircle size={19} />有 {overdue.length}{" "}
                    笔到期付款待核对
                  </h3>
                  <p>已付款请补记；已取消的订阅可以暂停，避免继续计入成本。</p>
                  {overdue.map((i) => (
                    <div key={i.id}>
                      <span>
                        {i.name}
                        <small>
                          {formatDate(occurrence(i))} ·{" "}
                          {dueLabel(occurrence(i))}
                        </small>
                      </span>
                      <b>¥{money(i.amount)}</b>
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => payItem(i)}
                      >
                        记已付款
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <CalendarView
                month={month}
                setMonth={setMonth}
                items={ledger.items}
                categories={ledger.categories}
                onSelect={(i) => setDetail(i.id)}
              />
              <p className="footnote">
                <Info size={15} />
                日历展示未确认付款的续费计划。暂停和到期不续费项目不列入。导出的提醒需导入手机或电脑日历，修改后请重新导出。
              </p>
            </>
          )}

          {view === "categories" && (
            <div className="category-manager">
              {ledger.categories.map((c) => {
                const IconComponent = ICONS[c.icon] || Cube;
                const items = ledger.items.filter((i) => i.categoryId === c.id);
                const cost = items.reduce((n, i) => n + dailyCost(i), 0);
                return (
                  <section className="category-manage-card" key={c.id}>
                    <div className="category-manage-top">
                      <span
                        className="item-icon"
                        style={{
                          background: `${categoryInk(c.color)}15`,
                          color: categoryInk(c.color),
                        }}
                      >
                        <IconComponent size={25} />
                      </span>
                      <div>
                        <h3>{c.name}</h3>
                        <span>{items.length} 个项目</span>
                      </div>
                      <button
                        className="icon-button"
                        aria-label={`编辑${c.name}`}
                        onClick={() => setCategoryEditor({ ...c })}
                      >
                        <PencilSimple size={18} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`删除${c.name}`}
                        onClick={() => {
                          if (items.length) {
                            setToast("请先把该分类中的项目移到其他分类");
                            return;
                          }
                          if (ledger.categories.length <= 1) {
                            setToast("请至少保留一个分类");
                            return;
                          }
                          setConfirm({
                            title: `删除「${c.name}」分类？`,
                            body: "该分类下没有项目，可以放心移除。",
                            label: "删除分类",
                            danger: true,
                            run: () =>
                              commit(
                                {
                                  ...ledger,
                                  categories: ledger.categories.filter(
                                    (x) => x.id !== c.id,
                                  ),
                                },
                                "分类已删除",
                              ),
                          });
                        }}
                      >
                        <Trash size={18} />
                      </button>
                    </div>
                    <div className="category-manage-bottom">
                      <span>
                        每日成本 <b>¥{money(cost)}</b>
                      </span>
                      <button
                        className="text-button"
                        onClick={() => {
                          setView("items");
                          setCategoryFilter(c.id);
                        }}
                      >
                        查看项目 <ArrowRight size={15} />
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {view === "settings" && (
            <div className="settings-stack">
              <GithubSyncSettings
                connected={Boolean(cloud)}
                onConnect={onConnect}
                onDisconnect={() => {
                  if (failedSave || editor || categoryEditor || confirm) {
                    setToast("请先保留未保存副本并关闭编辑，再断开同步");
                    return;
                  }
                  onDisconnect();
                }}
              />
              {cloud && (
                <section className="panel settings-panel">
                  <div className="settings-heading">
                    <span className="soft-icon">
                      <ShieldCheck size={23} />
                    </span>
                    <div>
                      <h2>我的云端账本</h2>
                      <p>GitHub 私有仓库 · 手机与电脑共用同一份记录</p>
                    </div>
                  </div>
                  {localBackup &&
                    (localBackup.error ||
                      localBackup.ledger.items.length > 0 ||
                      JSON.stringify(localBackup.ledger.categories) !==
                        JSON.stringify(emptyLedger().categories)) && (
                      <div className="setting-row">
                        <div>
                          <h3>迁移此浏览器的旧账本</h3>
                          <p>
                            原浏览器记录保留不变。迁移会替换云端账本，请先导出云端备份。
                          </p>
                        </div>
                        <button
                          className="btn btn-secondary"
                          disabled={busy || Boolean(localBackup.error)}
                          onClick={() =>
                            setConfirm({
                              title: "将旧账本迁移到云端？",
                              body: `本浏览器有 ${localBackup.ledger.items.length} 个项目。这会替换云端的 ${ledger.items.length} 个项目，不会合并；原浏览器记录保留。`,
                              label: "确认迁移到云端",
                              run: async () => {
                                if (
                                  await commit(
                                    localBackup.ledger,
                                    "旧账本已迁移到云端",
                                  )
                                )
                                  setLocalBackup(null);
                              },
                            })
                          }
                        >
                          迁移到云端
                        </button>
                      </div>
                    )}
                  {localBackup?.error && (
                    <div className="setting-row">
                      <div>
                        <h3>旧账本需要恢复</h3>
                        <p role="alert">{localBackup.error}</p>
                      </div>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          try {
                            download(
                              localStorage.getItem(STORAGE_KEY) || "{}",
                              `日有所值-旧账本原始数据-${now}.json`,
                            );
                          } catch {
                            setToast("浏览器禁止访问旧账本，请检查网站权限");
                          }
                        }}
                      >
                        导出旧账本原始数据
                      </button>
                    </div>
                  )}
                </section>
              )}

              <section className="panel settings-panel">
                <div className="settings-heading">
                  <span className="soft-icon">
                    <DownloadSimple size={23} />
                  </span>
                  <div>
                    <h2>数据与备份</h2>
                    <p>
                      当前有 {ledger.items.length} 个项目、
                      {ledger.categories.length} 个分类
                    </p>
                  </div>
                  <span className="saved-badge">
                    <CheckCircle size={15} />
                    {cloud
                      ? busy
                        ? "正在保存到云端"
                        : cloudError
                          ? "需要检查云端"
                          : "已保存在云端"
                      : storageError
                        ? "需要恢复"
                        : "已保存在此浏览器"}
                  </span>
                </div>
                <div className="setting-row">
                  <div>
                    <h3>导出账本</h3>
                    <p>下载完整 JSON 备份，包含项目、分类和付款记录。</p>
                  </div>
                  <button className="btn btn-secondary" onClick={exportBackup}>
                    <DownloadSimple size={17} />
                    导出备份
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <h3>导入备份</h3>
                    <p>
                      {cloud
                        ? "导入会替换所有设备共用的云端账本，导入前会请你确认。"
                        : "在另一台设备或浏览器中继续记录。导入前会请你确认替换。"}
                    </p>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => fileRef.current?.click()}
                  >
                    <UploadSimple size={17} />
                    导入备份
                  </button>
                </div>
                {storageError && (
                  <div className="setting-row">
                    <div>
                      <h3>导出原始数据</h3>
                      <p>保留当前浏览器中的原始记录，用于排查和恢复。</p>
                    </div>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        try {
                          download(
                            localStorage.getItem(STORAGE_KEY) || "{}",
                            `日有所值-原始数据-${now}.json`,
                          );
                        } catch {
                          setToast("当前浏览器禁止访问存储，请检查网站权限");
                        }
                      }}
                    >
                      导出原始数据
                    </button>
                  </div>
                )}
                <div className="storage-note">
                  <Info size={18} />
                  <p>
                    {cloud
                      ? "账本保存到 GitHub 私有仓库，所有已连接设备共用同一份数据。页面每 60 秒及重新回到前台时读取最新记录；离线时不能保存。多设备修改发生冲突时会阻止覆盖并提示重试。建议定期导出备份。"
                      : "账本只保存在当前浏览器，不会自动同步到其他设备。清除网站数据或使用无痕模式可能丢失记录，请定期导出备份。网站代码公开，个人账本不会随代码上传。"}
                  </p>
                </div>
              </section>
              <section className="panel settings-panel">
                <div className="settings-heading">
                  <span className="soft-icon">
                    <ChartBar size={23} />
                  </span>
                  <div>
                    <h2>每日成本是怎么算的？</h2>
                    <p>把长期的花费，换算成容易理解的每一天。</p>
                  </div>
                </div>
                <div className="formula-grid">
                  <div>
                    <span>01 / 订阅与会员</span>
                    <h3>每期金额 ÷ 本期实际天数</h3>
                    <p>
                      月付、季付和年付都按当前周期的实际日历天数计算，自动处理大小月和闰年。停用或尚未开始的项目不计入。
                    </p>
                  </div>
                  <div>
                    <span>02 / 设备与汽车</span>
                    <h3>（购买金额 − 预计残值）÷ 预计使用天数</h3>
                    <p>
                      按你设置的使用月数做计划均摊，到期后停止计入。详情中同时显示购买至今的日均持有成本。
                    </p>
                  </div>
                </div>
                <div className="storage-note">
                  <Info size={18} />
                  <p>
                    “每日固定成本”是计划均摊值，包含资产使用成本。“本月均摊”按当前日均乘本月天数估算，并非实际现金账单；“未来
                    30
                    天待付”按计划续费日统计，不含逾期未付。暂停只影响本账本，请自行到支付平台关闭自动续费。
                  </p>
                </div>
              </section>
              <section className="panel settings-panel">
                <div className="settings-heading">
                  <span className="soft-icon">
                    <Plant size={23} />
                  </span>
                  <div>
                    <h2>
                      日有所值 <span className="version">v1.0</span>
                    </h2>
                    <p>轻一点的账本，清楚一点的生活。</p>
                  </div>
                </div>
                <div className="setting-row">
                  <div>
                    <h3>体验示例账本</h3>
                    <p>在空账本中载入示例，了解各种项目的记录方式。</p>
                  </div>
                  <button
                    className="btn btn-secondary"
                    disabled={ledger.items.length > 0}
                    onClick={loadDemo}
                  >
                    载入示例
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <h3>重新开始</h3>
                    <p>
                      {ledger.demo
                        ? "移除示例内容，开始自己的记录。"
                        : "清空全部项目和分类。建议先导出一份备份。"}
                    </p>
                  </div>
                  <button
                    className="btn btn-danger-outline"
                    onClick={
                      ledger.demo
                        ? clearDemo
                        : () =>
                            setConfirm({
                              title: "确定清空整个账本？",
                              body: "所有项目、分类和付款记录都将被移除。此操作无法撤销，请先导出备份。",
                              label: "确认清空账本",
                              danger: true,
                              run: () =>
                                commit(emptyLedger(), "账本已清空", true),
                            })
                    }
                  >
                    {ledger.demo ? "清空示例" : "清空账本"}
                  </button>
                </div>
              </section>
            </div>
          )}
          <footer>
            <span className="footer-brand">
              日有所值<span>·</span>让每一份拥有，都值得。
            </span>
            <span>
              <CheckCircle size={13} />{" "}
              {cloud ? "云端记录，多设备共用" : "本地记录，随时备份"}
            </span>
          </footer>
        </div>
      </main>
      <nav className="mobile-nav">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => changeView(n.id)}
            className={view === n.id ? "active" : ""}
          >
            <n.icon size={22} weight={view === n.id ? "fill" : "regular"} />
            <span>{n.label}</span>
          </button>
        ))}
        <button
          className={view === "settings" ? "active" : ""}
          onClick={() => changeView("settings")}
        >
          <GearSix size={22} />
          <span>设置</span>
        </button>
      </nav>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="导入 JSON 备份"
        onChange={(e) => importBackup(e.target.files?.[0])}
      />
      {editor && (
        <ItemEditor
          key={editor.id}
          item={editor}
          categories={ledger.categories}
          isNew={!ledger.items.some((i) => i.id === editor.id)}
          onClose={() => setEditor(null)}
          onSave={async (item) => {
            const exists = ledger.items.some((i) => i.id === item.id);
            const next = exists
              ? ledger.items.map((i) => (i.id === item.id ? item : i))
              : [
                  ...ledger.items,
                  {
                    ...item,
                    payments: [
                      {
                        id: crypto.randomUUID(),
                        date: item.startDate,
                        due: item.startDate,
                        amount: item.amount,
                      },
                    ],
                  },
                ];
            if (
              await commit(
                { ...ledger, items: next },
                exists ? "项目已更新" : "新的花费，已认真记下",
              )
            )
              setEditor(null);
          }}
        />
      )}
      {selected && !editor && (
        <Modal title={selected.name} onClose={() => setDetail(null)}>
          <div className="detail-hero">
            <ItemIcon item={selected} category={catFor(selected)} />
            <div>
              <span>
                {catFor(selected).name} ·{" "}
                {selected.kind === "asset"
                  ? "设备资产"
                  : CADENCES[selected.cadence]}
              </span>
              <strong>
                ¥{money(dailyCost(selected))}
                <small> / 天</small>
              </strong>
            </div>
            <span
              className={`status-badge ${selected.status === "paused" ? "paused" : ""}`}
            >
              {selected.status === "paused"
                ? "已暂停"
                : isIncluded(selected)
                  ? "使用中"
                  : selected.startDate > now
                    ? "待开始"
                    : "已到期"}
            </span>
          </div>
          <dl className="detail-grid">
            <div>
              <dt>{selected.kind === "asset" ? "购买金额" : "每期金额"}</dt>
              <dd>¥{money(selected.amount)}</dd>
            </div>
            <div>
              <dt>支付渠道</dt>
              <dd>{selected.channel}</dd>
            </div>
            <div>
              <dt>开始日期</dt>
              <dd>{formatDate(selected.startDate)}</dd>
            </div>
            {selected.kind === "subscription" ? (
              <>
                <div>
                  <dt>下次付费</dt>
                  <dd>{formatDate(occurrence(selected))}</dd>
                </div>
                <div>
                  <dt>续费安排</dt>
                  <dd>{selected.autoRenew ? "持续续费" : "到期不续费"}</dd>
                </div>
                <div>
                  <dt>付费周期</dt>
                  <dd>
                    {selected.cadence === "custom"
                      ? `${selected.customDays} 天`
                      : CADENCES[selected.cadence]}
                  </dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt>预计使用</dt>
                  <dd>{selected.lifeMonths} 个月</dd>
                </div>
                <div>
                  <dt>预计残值</dt>
                  <dd>¥{money(selected.residual)}</dd>
                </div>
                <div>
                  <dt>购入至今日均</dt>
                  <dd>
                    ¥
                    {money(
                      (selected.amount - selected.residual) /
                        Math.max(1, daysBetween(selected.startDate, now) + 1),
                    )}
                    <small> / 天</small>
                  </dd>
                </div>
              </>
            )}
          </dl>
          {selected.note && (
            <div className="detail-note">
              <h3>备注</h3>
              <p>{selected.note}</p>
            </div>
          )}
          <div className="history">
            <h3>
              付款记录 <span>{selected.payments.length}</span>
            </h3>
            {selected.payments.length ? (
              [...selected.payments].reverse().map((p, idx) => (
                <div key={p.id}>
                  <span>
                    {formatDate(p.date)}
                    <small>
                      {idx === selected.payments.length - 1
                        ? "初始支出"
                        : `对应 ${formatDate(p.due)} 到期账单`}
                    </small>
                  </span>
                  <b>¥{money(p.amount)}</b>
                </div>
              ))
            ) : (
              <p className="muted">暂无记录，续费后点击“记已付款”即可添加。</p>
            )}
          </div>
          <div className="detail-actions">
            {selected.kind === "subscription" &&
              selected.status === "active" &&
              selected.autoRenew && (
                <button
                  className="btn btn-primary"
                  onClick={() => payItem(selected)}
                >
                  <Check size={17} />
                  记已付款
                </button>
              )}
            <button
              className="btn btn-secondary"
              onClick={() => setEditor({ ...selected })}
            >
              <PencilSimple size={17} />
              编辑
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => togglePause(selected)}
            >
              {selected.status === "active" ? (
                <Pause size={17} />
              ) : (
                <Play size={17} />
              )}
              {selected.status === "active" ? "暂停" : "恢复"}
            </button>
            <button
              className="icon-button danger ml-auto"
              aria-label="删除项目"
              onClick={() => deleteItem(selected)}
            >
              <Trash size={19} />
            </button>
          </div>
        </Modal>
      )}
      {categoryEditor && (
        <CategoryEditor
          category={categoryEditor}
          categories={ledger.categories}
          onClose={() => setCategoryEditor(null)}
          onSave={async (category) => {
            const exists = ledger.categories.some((c) => c.id === category.id);
            if (
              await commit(
                {
                  ...ledger,
                  categories: exists
                    ? ledger.categories.map((c) =>
                        c.id === category.id ? category : c,
                      )
                    : [...ledger.categories, category],
                },
                "分类已保存",
              )
            )
              setCategoryEditor(null);
          }}
        />
      )}
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)} compact>
          <div className={`confirm-icon ${confirm.danger ? "danger" : ""}`}>
            {confirm.danger ? <Trash size={27} /> : <Info size={27} />}
          </div>
          <p className="confirm-body">{confirm.body}</p>
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setConfirm(null)}
            >
              取消
            </button>
            <button
              className={`btn ${confirm.danger ? "btn-danger" : "btn-primary"}`}
              disabled={busy}
              onClick={async () => {
                const result = await confirm.run();
                if (result !== false) setConfirm(null);
              }}
            >
              {confirm.label}
            </button>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle size={19} />
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function ItemIcon({ item, category }: { item: Item; category: Category }) {
  const IconComponent = ICONS[category.icon] || Cube;
  return (
    <span
      className="item-icon"
      style={{
        background: `${categoryInk(category.color)}15`,
        color: categoryInk(category.color),
      }}
    >
      <IconComponent size={25} weight="duotone" />
    </span>
  );
}
function ProjectCard({
  item,
  category,
  onOpen,
  onEdit,
  onPause,
}: {
  item: Item;
  category: Category;
  onOpen: () => void;
  onEdit: () => void;
  onPause: () => void;
}) {
  const cost = dailyCost(item),
    included = isIncluded(item),
    end = item.kind === "asset" ? assetEnd(item) : occurrence(item);
  const total =
    item.kind === "asset"
      ? daysBetween(item.startDate, end)
      : daysBetween(occurrence(item, item.cycle - 1), end);
  const progress = Math.max(
    0,
    Math.min(100, (1 - daysBetween(today(), end) / Math.max(1, total)) * 100),
  );
  return (
    <article
      className={`project-card ${item.status === "paused" ? "is-paused" : ""}`}
    >
      <button className="project-main" onClick={onOpen}>
        <div className="project-top">
          <ItemIcon item={item} category={category} />
          <span className="project-name">
            <strong>{item.name}</strong>
            <small>{category.name}</small>
          </span>
          <span className={`status-badge ${!included ? "paused" : ""}`}>
            {item.status === "paused"
              ? "已暂停"
              : item.startDate > today()
                ? "待开始"
                : !included
                  ? "已到期"
                  : "使用中"}
          </span>
        </div>
        <div className="project-cost">
          <span>¥</span>
          {money(cost)}
          <small>/ 天</small>
        </div>
        <div className="project-meta">
          <span>
            ¥{money(item.amount)}
            <small>
              {" "}
              /{" "}
              {item.kind === "asset"
                ? "一次性购买"
                : item.cadence === "custom"
                  ? `${item.customDays} 天`
                  : CADENCES[item.cadence].slice(0, 1)}
            </small>
          </span>
          <span>{item.channel}</span>
        </div>
        <div className="progress-track">
          <span
            style={{
              width: `${progress}%`,
              background: categoryInk(category.color),
            }}
          />
        </div>
        <div className="project-bottom">
          <span>
            {item.kind === "asset"
              ? `计划使用 ${item.lifeMonths} 个月`
              : `${formatDate(occurrence(item))} ${item.autoRenew ? "续费" : "到期"}`}
          </span>
          <span
            className={
              item.kind === "subscription" &&
              daysBetween(today(), end) <= 7 &&
              included
                ? "due-soon"
                : ""
            }
          >
            {item.status === "paused"
              ? "暂停均摊"
              : item.kind === "asset"
                ? `已使用 ${Math.max(0, daysBetween(item.startDate, today()))} 天`
                : dueLabel(end)}
          </span>
        </div>
      </button>
      <div className="card-actions">
        <button onClick={onEdit} aria-label={`编辑${item.name}`}>
          <PencilSimple size={16} />
        </button>
        <button
          onClick={onPause}
          aria-label={`${item.status === "paused" ? "恢复" : "暂停"}${item.name}`}
        >
          {item.status === "paused" ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <button onClick={onOpen} aria-label={`查看${item.name}详情`}>
          <ArrowUpRight size={16} />
        </button>
      </div>
    </article>
  );
}
function Donut({
  stats,
  total,
}: {
  stats: (Category & { cost: number })[];
  total: number;
}) {
  let offset = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" aria-label="每日成本分类占比" role="img">
        <circle
          cx="70"
          cy="70"
          r="55"
          fill="none"
          stroke="#eef0eb"
          strokeWidth="16"
        />
        {stats
          .filter((c) => c.cost > 0)
          .map((c) => {
            const ratio = total ? c.cost / total : 0;
            const start = offset;
            offset += ratio;
            return (
              <circle
                key={c.id}
                cx="70"
                cy="70"
                r="55"
                fill="none"
                stroke={categoryInk(c.color)}
                strokeWidth="16"
                strokeDasharray={`${Math.max(0, ratio * 345.575 - 3)} ${345.575}`}
                strokeDashoffset={-start * 345.575}
                transform="rotate(-90 70 70)"
              />
            );
          })}
      </svg>
      <div>
        <small>每日总计</small>
        <strong>¥{money(total)}</strong>
      </div>
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
  compact = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const keydown = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const elements = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
          ) || [],
        );
        const first = elements[0],
          last = elements[elements.length - 1];
        if (!first) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        }
        if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", keydown, true);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${compact ? "compact" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="关闭弹窗"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function ItemEditor({
  item,
  categories,
  isNew,
  onClose,
  onSave,
}: {
  item: Item;
  categories: Category[];
  isNew: boolean;
  onClose: () => void;
  onSave: (item: Item) => void;
}) {
  const [draft, setDraft] = useState({
    ...item,
    categoryId: categories.some((c) => c.id === item.categoryId)
      ? item.categoryId
      : categories[0].id,
    anchor: item.kind === "subscription" ? occurrence(item) : item.anchor,
    cycle: 0,
  });
  const [error, setError] = useState("");
  const update = <K extends keyof Item>(key: K, value: Item[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));
  return (
    <Modal title={isNew ? "记下一份花费" : "编辑项目"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const keepAnchor =
            !isNew &&
            draft.kind === "subscription" &&
            item.kind === "subscription" &&
            draft.anchor === occurrence(item) &&
            draft.cadence === item.cadence &&
            draft.customDays === item.customDays;
          const clean = {
            ...draft,
            ...(keepAnchor ? { anchor: item.anchor, cycle: item.cycle } : {}),
            name: draft.name.trim(),
            channel: draft.channel.trim() || "其他",
            note: draft.note.trim(),
          };
          const err = validateItem(clean, categories);
          if (err) {
            setError(err);
            return;
          }
          onSave(clean);
        }}
      >
        <p className="modal-intro">每一份拥有，都从认真记录开始。</p>
        <div className="kind-selector">
          {(
            [
              {
                kind: "subscription",
                title: "订阅与会员",
                text: "按月、季、年持续付费",
                icon: CreditCard,
              },
              {
                kind: "asset",
                title: "设备与资产",
                text: "一次购买，长期使用",
                icon: Laptop,
              },
            ] as const
          ).map((k) => (
            <button
              type="button"
              key={k.kind}
              className={draft.kind === k.kind ? "active" : ""}
              onClick={() => {
                update("kind", k.kind);
                if (isNew)
                  update(
                    "categoryId",
                    categories.find(
                      (c) =>
                        c.id === (k.kind === "asset" ? "digital" : "software"),
                    )?.id || categories[0].id,
                  );
              }}
            >
              <k.icon size={24} />
              <span>
                <strong>{k.title}</strong>
                <small>{k.text}</small>
              </span>
              {draft.kind === k.kind && <CheckCircle size={17} weight="fill" />}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label className="full">
            项目名称 <span>*</span>
            <input
              required
              maxLength={80}
              value={draft.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder={
                draft.kind === "asset"
                  ? "例如：MacBook Air、我的汽车"
                  : "例如：iCloud+、网易云音乐"
              }
            />
          </label>
          <label>
            所属分类
            <select
              value={draft.categoryId}
              onChange={(e) => update("categoryId", e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            支付渠道
            <input
              list="payment-channels"
              maxLength={60}
              value={draft.channel}
              onChange={(e) => update("channel", e.target.value)}
              placeholder="选择或输入渠道"
            />
            <datalist id="payment-channels">
              {CHANNELS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label>
            {draft.kind === "asset" ? "购买金额" : "每期金额"}（元）
            <span>*</span>
            <input
              required
              inputMode="decimal"
              type="number"
              min="0.01"
              max="1000000000"
              step="0.01"
              value={draft.amount || ""}
              onChange={(e) => update("amount", Number(e.target.value))}
              placeholder="0.00"
            />
          </label>
          {draft.kind === "subscription" ? (
            <label>
              付费周期
              <select
                value={draft.cadence}
                onChange={(e) => update("cadence", e.target.value as Cadence)}
              >
                {Object.entries(CADENCES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              预计使用时长（月）<span>*</span>
              <input
                type="number"
                required
                min="1"
                max="1200"
                step="1"
                value={draft.lifeMonths || ""}
                onChange={(e) => update("lifeMonths", Number(e.target.value))}
              />
              <small>例如 3 年填 36，8 年填 96</small>
            </label>
          )}
          {draft.kind === "subscription" && draft.cadence === "custom" && (
            <label className="full">
              每多少天付费
              <input
                type="number"
                min="1"
                max="36500"
                required
                step="1"
                value={draft.customDays || ""}
                onChange={(e) => update("customDays", Number(e.target.value))}
              />
            </label>
          )}
          <label>
            {draft.kind === "asset" ? "购买日期" : "开始日期"}
            <input
              type="date"
              required
              min="1900-01-01"
              max="2200-12-31"
              value={draft.startDate}
              onChange={(e) => update("startDate", e.target.value)}
            />
          </label>
          {draft.kind === "subscription" ? (
            <label>
              下次付费日期
              <input
                type="date"
                required
                min="1900-01-01"
                max="2200-12-31"
                value={draft.anchor}
                onChange={(e) => update("anchor", e.target.value)}
              />
            </label>
          ) : (
            <label>
              预计残值（元）
              <input
                type="number"
                min="0"
                step="0.01"
                max={draft.amount || 0}
                value={draft.residual}
                onChange={(e) => update("residual", Number(e.target.value))}
              />
              <small>预计使用结束时的价值，不确定可填 0</small>
            </label>
          )}
          {draft.kind === "subscription" && (
            <label className="switch-row full">
              <span>
                <strong>持续续费</strong>
                <small>到期后仍会继续使用；关闭则到期停止均摊</small>
              </span>
              <input
                type="checkbox"
                checked={draft.autoRenew}
                onChange={(e) => update("autoRenew", e.target.checked)}
              />
              <i />
            </label>
          )}
          <label className="full">
            备注 <small className="inline">选填</small>
            <textarea
              rows={2}
              maxLength={1000}
              value={draft.note}
              onChange={(e) => update("note", e.target.value)}
              placeholder="套餐、用途，或其他想记住的事情…"
            />
          </label>
        </div>
        {error && (
          <div className="form-error" role="alert">
            <WarningCircle size={17} />
            {error}
          </div>
        )}
        <div className="form-preview">
          <Info size={18} />
          <span>
            {draft.status === "paused" ? (
              "项目已暂停，恢复后才会计入每日成本。"
            ) : draft.amount > 0 && !validateItem(draft, categories) ? (
              <>
                当前预计 <strong>¥{money(dailyCost(draft))} / 天</strong>
                ，保存后自动更新总览。
              </>
            ) : (
              "填好金额与周期，就能看见这份花费的每日成本。"
            )}
          </span>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" type="submit">
            <Check size={17} />
            {isNew ? "保存项目" : "保存修改"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function CategoryEditor({
  category,
  categories,
  onClose,
  onSave,
}: {
  category: Category;
  categories: Category[];
  onClose: () => void;
  onSave: (c: Category) => void;
}) {
  const [draft, setDraft] = useState(category),
    [error, setError] = useState("");
  return (
    <Modal
      title={category.name ? "编辑分类" : "新建分类"}
      onClose={onClose}
      compact
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.name.trim()) {
            setError("请输入分类名称");
            return;
          }
          if (
            categories.some(
              (c) => c.id !== draft.id && c.name === draft.name.trim(),
            )
          ) {
            setError("这个分类名称已存在");
            return;
          }
          if (
            categories.length >= 100 &&
            !categories.some((c) => c.id === draft.id)
          ) {
            setError("最多支持 100 个分类");
            return;
          }
          onSave({ ...draft, name: draft.name.trim() });
        }}
      >
        <div className="form-grid">
          <label className="full">
            分类名称
            <input
              required
              maxLength={40}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例如：学习成长"
            />
          </label>
          <div className="full">
            <label>分类颜色</label>
            <div className="color-picker">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`颜色 ${color}`}
                  style={{ background: color }}
                  onClick={() => setDraft({ ...draft, color })}
                >
                  {color === draft.color && <Check size={17} />}
                </button>
              ))}
            </div>
          </div>
          <div className="full">
            <label>分类图标</label>
            <div className="icon-picker">
              {Object.entries(ICONS).map(([key, IconComponent]) => (
                <button
                  aria-label={`图标 ${key}`}
                  className={draft.icon === key ? "selected" : ""}
                  key={key}
                  type="button"
                  onClick={() => setDraft({ ...draft, icon: key })}
                >
                  <IconComponent size={22} />
                </button>
              ))}
            </div>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" type="submit">
            保存分类
          </button>
        </div>
      </form>
    </Modal>
  );
}
function CalendarView({
  month,
  setMonth,
  items,
  categories,
  onSelect,
}: {
  month: string;
  setMonth: (s: string) => void;
  items: Item[];
  categories: Category[];
  onSelect: (i: Item) => void;
}) {
  const end = addDays(addMonths(month, 1), -1),
    events = calendarEvents(items, month, end),
    now = today();
  const weekday = (new Date(`${month}T00:00:00Z`).getUTCDay() + 6) % 7;
  const days = daysBetween(month, addMonths(month, 1));
  const amount = events.reduce((n, e) => n + e.item.amount, 0);
  return (
    <section className="panel calendar-panel">
      <div className="calendar-heading">
        <div>
          <h2>
            {Number(month.slice(0, 4))} 年 {Number(month.slice(5, 7))} 月
          </h2>
          <span>
            {events.length} 笔计划 · ¥{money(amount)}
          </span>
        </div>
        <div>
          <button
            className="icon-button"
            aria-label="上个月"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <CaretLeft size={19} />
          </button>
          <button
            className="text-button"
            onClick={() => setMonth(now.slice(0, 7) + "-01")}
          >
            本月
          </button>
          <button
            className="icon-button"
            aria-label="下个月"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <CaretRight size={19} />
          </button>
        </div>
      </div>
      <div className="calendar-week">
        {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
          <span key={w}>周{w}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {Array.from({ length: weekday }, (_, i) => (
          <div key={`blank-${i}`} className="calendar-day blank" />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = addDays(month, i),
            matches = events.filter((e) => e.date === date);
          return (
            <div
              key={date}
              className={`calendar-day ${date === now ? "is-today" : ""}`}
            >
              <span className="day-number">{i + 1}</span>
              {matches.map((e) => {
                const c = categories.find((c) => c.id === e.item.categoryId);
                return (
                  <button
                    key={`${e.item.id}-${e.offset}`}
                    onClick={() => onSelect(e.item)}
                    style={{
                      background: `${c?.color || "#49765e"}12`,
                      borderLeftColor: c?.color,
                    }}
                  >
                    <span>{e.item.name}</span>
                    <small>¥{money(e.item.amount)}</small>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="calendar-mobile-events">
        {events.length ? (
          events.map((e) => (
            <button
              key={`${e.item.id}-${e.offset}`}
              onClick={() => onSelect(e.item)}
            >
              <span className="mobile-event-date">
                {e.date.slice(8)}
                <small>日</small>
              </span>
              <span>
                {e.item.name}
                <small>{e.item.channel}</small>
              </span>
              <b>¥{money(e.item.amount)}</b>
            </button>
          ))
        ) : (
          <p>这个月暂无计划付费</p>
        )}
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CloudGate>
      {(cloud, token, connect, disconnect) => (
        <App
          key={token ? "cloud" : "local"}
          cloud={cloud}
          token={token}
          onConnect={connect}
          onDisconnect={disconnect}
        />
      )}
    </CloudGate>
  </React.StrictMode>,
);
