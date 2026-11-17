# 日有数 · Daily Cost

一个轻盈的个人支出管理 Web App，把软件会员、订阅、电子设备、汽车与保险，换算成每天看得见的成本。纯静态网页，使用 GitHub Pages 部署，无需注册应用账号或部署后端。可通过 GitHub API 将唯一一份私人账本保存在私有仓库，跨设备使用。

在线使用：[youshu.ootoday.top](https://youshu.ootoday.top/)。

## 使用

- **总览**：每日固定成本、订阅与资产均摊、本月估算、未来 30 天待付、分类占比。
- **项目**：新增、编辑、删除、暂停和恢复。支持搜索、分类筛选、状态筛选、排序及卡片/列表视图。
- **订阅**：月付、季付、年付、自定义天数；记录下次付费日期与自定义支付渠道（预置支付宝、微信支付、Apple Store、信用卡等）。
- **设备资产**：购买金额、购买日期、预计使用月数、预计残值；同时查看购入至今的日均持有成本。
- **付款管理**：确认“记已付款”后保存付款历史，并推进一个付费周期；逾期账单不会自动当作已付款。
- **付费日历**：按月查看续费计划；可导出未来一年 `.ics` 日历文件，导入系统日历后提前 3 天提醒。修改计划后需要重新导出、更新系统日历，网页关闭时不会自行推送通知。
- **分类**：新增、改名、自选图标与颜色；空分类可以删除，有项目的分类需先迁移项目。
- **数据**：支持 GitHub 私有仓库单账本同步；未连接时使用当前浏览器的本地账本。保留 JSON 备份与恢复，以及本地模式的多窗口同步。
- **手机**：响应式布局、底部导航。
- 首次打开为空账本，可点击“先看看示例”。示例始终带提示，可清空后开始自己的记录。

### 数据保存方式

#### 推荐：所有设备共用一份 GitHub 私有账本

网页继续由 GitHub Pages 托管；数据保存在独立私有仓库 [`daily-cost-data`](https://github.com/ivanclaw126-design/daily-cost-data) 的 `main` 分支 `ledger.json`，不会进入公开的网站仓库。无需 Supabase、应用登录账号或自建服务。

1. 在“设置与备份 → GitHub 云端同步”点击创建令牌。使用 GitHub **fine-grained personal access token**，选择 **Only select repositories → daily-cost-data**，仅授予 **Contents: Read and write**（Metadata 默认只读）。不要选择所有仓库。
2. 将令牌粘贴到网页并连接。私人设备可选择记住令牌，令牌只保存在该浏览器中；取消勾选则仅用于本次页面。每台设备首次连接一次，令牌到期或浏览器存储被清除后需要重新配置。
3. 原有数据在原浏览器连接后，可在设置中选择“迁移此浏览器的旧账本”。迁移需要确认，会替换云端账本，原浏览器记录保留。其他设备连接后使用同一份云端记录。

连接后，每次保存直接通过 GitHub Contents API 更新文件。页面在可见时每 60 秒及重新回到前台时读取最新记录，也可手动刷新；编辑时暂停后台刷新。保存附带文件 SHA，另一设备已修改时会拒绝覆盖，保留编辑内容并提供未保存副本下载。离线时不能保存；网络故障后先读取最新账本确认保存结果。

断开同步仅清除此设备的连接，云端文件保留。请定期导出 JSON 备份。账本文件支持最大 900 KB；令牌和账本内容不写入公开代码。GitHub 的私有仓库提交历史会保留旧版本，页面中的删除项目或清空账本不会清除这些历史。

参考：[GitHub Pages 的静态托管范围](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)、[Contents API](https://docs.github.com/en/rest/repos/contents)、[细粒度令牌](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)。

#### 本地模式

未连接云端时，账本只保存在当前浏览器的 `localStorage`。更换设备可导出 JSON 后导入。清除网站数据、换浏览器或使用无痕模式可能丢失本地记录。导入前校验完整数据并要求确认覆盖；无效文件不会替换现有账本。存储读取异常时保留原始内容，可在设置中下载恢复。

暂停项目只改变此账本的统计，不会取消支付宝、微信、Apple Store 等平台的真实扣款。初次录入会生成一笔对应开始日期的初始支出；如果日期为未来，表示计划中的初始支出。

## 计算规则

| 指标             | 规则                                                   |
| ---------------- | ------------------------------------------------------ |
| 订阅每日成本     | 每期金额 ÷ 当前付费周期的实际日历天数                  |
| 资产计划每日成本 | （购买金额 − 预计残值）÷ 预计使用天数                  |
| 资产购入至今日均 | （购买金额 − 预计残值）÷ 持有天数（含今天）            |
| 每日固定成本     | 所有正在使用的订阅日均与资产计划日均之和               |
| 本月均摊成本     | 当前日均 × 本月天数，是估算值，不是本月实际扣款        |
| 未来 30 天待付   | 从今天起 30 天内的待续费计划之和，不含逾期与资产购置款 |

暂停、尚未开始、资产使用期限已结束的项目不计入日均。关闭“持续续费”的订阅在已填写的到期日停止计入，也不显示续费计划。所有金额为人民币；可记录海外服务的人民币实际支出，不内置汇率换算。

月末和闰年按原始付费日期计算：1 月 31 日 → 2 月末 → 3 月 31 日；年付闰日也保留原始锚点，避免连续推进时日期漂移。日期运算使用 UTC 日历天，避免夏令时误差；界面“今天”使用设备本地日期。非日期/周期类编辑会保留原锚点。

## 本地开发

需要 Node.js 22.18+，推荐 Node.js 24 或更新版本。

```bash
npm ci
npm run dev
```

```bash
npm test           # 账本计算、校验、日历及 GitHub 编解码、冲突和错误处理测试
npm run build     # TypeScript 检查，生成 docs/ 静态站点
npx playwright install chromium
npm run test:e2e   # 本地账本操作、移动端及模拟两设备同步、冲突、断网和迁移检查
```

也可以使用已安装的 Chrome：`PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`。

技术栈：React、TypeScript、Vite、Tailwind CSS、Phosphor Icons。未连接云端时无第三方 API 请求；连接后仅直接请求 GitHub API。无外部字体或图片请求。

## GitHub Pages 部署

仓库公开，Pages 使用 `main` 分支下的 `/docs` 目录，`docs/.nojekyll` 禁用 Jekyll。Vite 使用相对资源路径，可直接部署到项目子路径。

自定义域名为 `youshu.ootoday.top`。阿里云 DNS 的 `youshu` CNAME 指向 `ivanclaw126-design.github.io`；`public/CNAME` 在每次构建时复制到 `docs/CNAME`，保留域名配置。账本按浏览器来源隔离，如果旧 GitHub Pages 地址中已有记录，请从原页面导出备份，再在新域名导入。

更新网页后执行 `npm run build`，提交源文件与 `docs/` 并推送 `main`。GitHub Pages 会自动发布新的静态文件。不要只提交源文件而漏掉 `docs/`。

## 参考与许可

每日成本与个人资产管理思路参考 [有数的小米应用商店介绍](https://app.mi.com/details?id=com.zhumeng.assets)，网页界面和实现独立设计，没有使用其品牌、截图或代码。

MIT License。
