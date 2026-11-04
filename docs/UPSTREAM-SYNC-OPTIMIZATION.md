# 降低上游同步难度的优化方案

> 面向问题：每次 Firefly 上游更新（本次跨 318 个提交、6.13.3 → 6.16.9），
> 18 项定制需要人工重放，其中 30 个上游文件被改动，冲突面大、易漏。
> 目标：把"人工判断"变成"脚本可验证"，把"改上游文件"压到最少。

---

## 落地状态（2026-11-05）

P0 与 P1 四项已实施并验证，`pnpm verify` 25 项全绿：

| 项 | 状态 | 落地位置 | 用法 |
|---|---|---|---|
| P0-1 自检脚本 | ✅ 完成 | `scripts/verify-customizations.mjs` | `pnpm verify` / `pnpm verify:source` |
| P0-2 pagefind 输出改到 base 下 | ✅ 完成 | `scripts/run-pagefind.ts`（`--output-subdir`）、`scripts/site-root.ts`（`resolveBaseSegment`） | 无需手动操作；`Navbar.astro` / `search.astro` 已还原成上游原样 |
| P1-1 `root-redirect` 抽独立文件 | ✅ 完成 | `src/integrations/root-redirect.mjs`，`astro.config.mjs` 里只剩 `rootRedirect({ title: siteConfig.title })` 一行 | 无需手动操作 |
| P1-2 个人配置外置 | ✅ 完成 | `scripts/personal/*.snapshot` + `scripts/restore-personal-config.mjs` | `pnpm restore:personal` / `pnpm snapshot:personal` |
| P2 壁纸轮播收敛 | ⬜ 未做 | 仍涉及 5 个文件 | 见下文 §P2 |
| P3 patch 集 | ⬜ 不做 | — | 见末节结论 |

**同步上游的标准动作**（比之前少 4 个手工步骤）：

```bash
git fetch upstream && git merge upstream/master
pnpm restore:personal     # 个人配置一键恢复
pnpm build
pnpm verify               # 25 项断言，红了看提示
```

下面保留的是当初的评估过程，思路和取舍仍有参考价值。

---

## 现状盘点

| 类别 | 数量 | 同步上游时的处理方式 | 风险 |
|---|---|---|---|
| 新增文件（路由、插件、脚本、组件） | 47 | 上游不会碰，**零成本** | 无 |
| 纯数据配置（`src/config/*.ts` 等） | 9 | 逐行对值重抄 | 中（漏抄、抄错） |
| 构建/部署配置 | 5 | 对照文档重写 | 中 |
| **源码级改动** | **16** | 逐文件 diff 后重放 | **高（结构变了就冲突）** |

16 个源码级文件清单：

```
astro.config.mjs                     ← 内联了 ~70 行 integration
src/components/layout/Navbar.astro   ← pagefind 路径硬编码
src/pages/search.astro               ← pagefind 路径硬编码
src/components/layout/PostCard.astro ← pinned 类型放宽
src/components/layout/PostMeta.astro ← 相对时间 + pinned 类型
src/components/layout/WallpaperSection.astro
src/components/widget/SiteInfo.astro ← 版本号注入
src/components/widget/SiteStats.astro← 自然日计算
src/content.config.ts                ← alias / pinned schema
src/constants/lqips.json             ← 生成物
src/i18n/languages/zh_CN.ts          ← 1 行文案
src/pages/api/allPostMeta.json.ts
src/styles/layout-styles.css
src/styles/tags.css
src/types/backgroundWallpaper.ts
src/utils/banner-visibility-utils.ts
src/utils/content-utils.ts
src/utils/date-utils.ts
```

---

## 优先级建议

| 优先级 | 方案 | 减少的量 | 工作量 | 建议 |
|---|---|---|---|---|
| **P0** | 自检脚本 `pnpm verify` | 把"人工核对 18 项"变成"看哪条红" | 1h | **强烈建议，先做这个** |
| **P0** | pagefind 输出改到 base 下 | 源码改动 **-2 个文件** | 15min | 强烈建议 |
| **P1** | `root-redirect` 抽成独立文件 | `astro.config.mjs` 定制行 70 → 2 | 20min | 建议 |
| **P1** | 个人配置外置 + 幂等回写 | 9 个 config 文件同步成本归零 | 2h | 建议 |
| **P2** | 壁纸轮播改动收敛到 1 个文件 | 源码改动 -3 个文件 | 30min | 可选 |
| **P3** | patch 集 + `git apply -3` | 冲突显式化 | 3h | 暂不建议（见末节） |

---

## P0-1｜自检脚本：把核对变成一条命令

**为什么最重要**：本次迁移最大的坑不是"改错代码"，而是**改错了却没人发现**。
`root-redirect` 钩子把首页覆盖成自我跳转页，构建照样 exit 0。
靠肉眼和"模拟钩子"都没发现，最后是真实构建 + 检查产物才暴露。

**做法**：新增 `scripts/verify-customizations.mjs`，硬断言 18 项特征。

```js
// scripts/verify-customizations.mjs（骨架）
import { existsSync, readFileSync } from "node:fs";

const checks = [];
const add = (name, fn) => checks.push({ name, fn });
const fileHas = (p, re) => existsSync(p) && re.test(readFileSync(p, "utf-8"));

// —— 文件存在性 ——
for (const f of [
  "src/pages/[...alias].astro", "src/pages/go.astro", "src/pages/game.astro",
  "src/pages/tools.astro", "src/pages/tools/steamid.astro",
  "src/plugins/remark-mark.mjs", "src/plugins/rehype-component-api-button.mjs",
  "scripts/fix-frontmatter.ts", "scripts/sync-updated.ts",
]) add(`文件存在: ${f}`, () => existsSync(f));

// —— 配置值 ——
add("子路径 base=/blog/", () => fileHas("astro.config.mjs", /base:\s*["']\/blog\/["']/));
add("版本号注入", () => fileHas("astro.config.mjs", /__BLOG_VERSION__/));
add("alias schema", () => fileHas("src/content.config.ts", /alias:/));
add("pinned 支持数字", () => fileHas("src/content.config.ts", /union\(\[z\.boolean\(\),\s*z\.number\(\)\]\)/));
add("pagefind 路径", () => fileHas("src/pages/search.astro", /'\/pagefind\/pagefind\.js'/));
add("Umami", () => fileHas("src/config/analyticsConfig.ts", /u\.cn3\.top/));
add("备案号", () => fileHas("src/config/FooterConfig.html", /萌ICP备/));

// —— 构建产物（仅在有 dist 时检查）——
if (existsSync("dist/client")) {
  add("根跳转页存在", () => existsSync("dist/client/index.html"));
  add("首页未被覆盖", () => !readFileSync("dist/client/blog/index.html", "utf-8").includes("Redirecting"));
  for (const d of ["yuanshen", "q", "vndb", "bangumi", "myanimelist", "game"])
    add(`根别名 /${d}/`, () => existsSync(`dist/client/${d}/index.html`));
}

// —— 执行 ——
let fail = 0;
for (const c of checks) {
  const ok = (() => { try { return c.fn(); } catch { return false; } })();
  console.log(`${ok ? "✅" : "❌"} ${c.name}`);
  if (!ok) fail++;
}
console.log(`\n${checks.length - fail}/${checks.length} 通过`);
process.exit(fail ? 1 : 0);
```

`package.json` 加一条：

```json
"verify": "npx tsx scripts/verify-customizations.mjs"
```

**收益**：下次同步上游后，先跑 `pnpm verify`，红的条目就是要适配的地方；CI 里也能拦住"静默丢功能"。

---

## P0-2｜pagefind 改到 base 下，删掉 2 个上游文件改动

**现状问题**

```bash
pagefind --site dist/client        # 输出到 dist/client/pagefind
```

上游代码用 `url('/pagefind/pagefind.js')`，`base=/blog/` 时拼成 `/blog/pagefind/pagefind.js` → 404。
所以我们在 `Navbar.astro` 和 `search.astro` 里硬编码成 `'/pagefind/pagefind.js'`，还在注释里写了"不要改"。

**改法**：让索引输出到 `dist/client/blog/pagefind`，与上游 `url()` 的拼接结果**完全一致**，然后把两个上游文件还原。

```ts
// scripts/run-pagefind.ts
const result = spawnSync("pagefind", [
  "--site", siteRoot,
  "--output-subdir", "blog/pagefind",   // ← 新增：跟随 base
], { stdio: "inherit" });
```

```bash
# 还原上游文件
git checkout upstream/master -- src/components/layout/Navbar.astro src/pages/search.astro
```

**收益**：源码改动 **-2 个文件**；以后上游改搜索逻辑完全不用跟。
**验证**：`dist/client/blog/pagefind/pagefind.js` 存在；构建后访问 `/blog/search/` 能搜到结果。
**风险**：低。pagefind 运行时的索引路径是相对脚本自身 URL 解析的，挪目录不影响。

---

## P1-1｜`root-redirect` 抽成独立文件

**现状问题**：`astro.config.mjs` 里内联一个约 70 行的 integration 对象。
上游每次改 config（这次就改了不少）都要小心不要碰坏这段，review 也难。

**改法**：抽到 `src/integrations/root-redirect.mjs`，导出 integration：

```js
// src/integrations/root-redirect.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export default function rootRedirect() {
  let config;
  return {
    name: "root-redirect",
    hooks: {
      "astro:config:done": ({ config: c }) => { config = c; },
      "astro:build:done": ({ dir }) => { /* 现有逻辑原样搬过来 */ },
    },
  };
}
```

```diff
// astro.config.mjs
+ import rootRedirect from "./src/integrations/root-redirect.mjs";
  integrations: [
+   rootRedirect(),
-   { name: "root-redirect", hooks: { /* 70 行 */ } },
    swup({ ... }),
```

**收益**：`astro.config.mjs` 的定制行数 **70 → 2**；逻辑从上游文件的合并风险里彻底隔离；
以后这段逻辑要改也只动自己的文件。
**顺带**：逻辑搬出去后可以做单元测试（构造一个假的 `dir` + `config` 断言产物路径），
彻底避免本次那种"改错了但构建不报错"的问题。

---

## P1-2｜个人配置外置 + 幂等回写

**现状问题**：9 个 `src/config/*.ts` 被直接改值。上游每版都会动这些文件
（6.16.9 就删掉了 `footerConfig.ts`、给 `sidebarConfig.ts` 加了字段），
每次都要逐行对值重抄，容易漏。

**改法**：个人值抽到 `config.local.json`，写一个幂等回写脚本。

```json
// config.local.json
{
  "siteConfig": { "title": "CC 的 Blog", "subtitle": "嘻嘻", "site_url": "https://blog.cn3.top/blog/" },
  "profileConfig": { "avatar": "/assets/images/doro01.avif", "name": "CC", "bio": "嘻嘻." },
  "analyticsConfig": { "websiteId": "117d7413-…", "scriptUrl": "https://u.cn3.top/script.js" },
  "commentConfig": { "envId": "https://twikoo.vercel.app", "visitorCount": true },
  "sponsorConfig": { "enabled": false }
}
```

```ts
// scripts/sync-config.ts（思路）
// 对每个 key，在对应 .ts 里用正则定位 `key: <旧值>,` 并替换成 json 里的值；
// 找不到 key 就告警（说明上游改了结构，需要人工处理）
```

**同步上游的标准流程变成**：

```bash
git checkout upstream/master -- src/config/    # 1. 全量还原，冲突面归零
pnpm sync-config                               # 2. 自动重放个人值
pnpm verify                                    # 3. 确认没有漏项
```

**收益**：9 个 config 文件的"人工对值"成本归零；上游加字段时也不会因为手抄漏掉。
**局限**：只能处理**值级覆盖**；上游做结构级重命名（如 `footerConfig.ts` 被删）时，
脚本会告警"key 找不到"，仍需人工决策 —— 这正是我们想要的：把静默失败变成显式告警。

---

## P2｜壁纸轮播改动收敛

**现状**：改动了 5 个文件才让过渡时长可配
（`config/backgroundWallpaper.ts`、`types/backgroundWallpaper.ts`、`utils/banner-visibility-utils.ts`、
`WallpaperSection.astro`、`styles/layout-styles.css`）。

**可简化**：只在 `WallpaperSection.astro` 里注入内联 CSS 变量：

```astro
<div id="wallpaper-wrapper" style={`--carousel-transition-duration:${wallpaperConfig.carousel?.transitionDuration ?? 1000}ms`}>
```

CSS 侧用 `var(--carousel-transition-duration, 1000ms)`。
这样 `types/`、`utils/` 两个文件可以还原，源码改动 **-3**。
代价：类型定义要写在自己文件里（`as any` 或局部 interface），略脏。
**权衡**：如果只是想要"可配"，这样够用；如果想要"类型安全"，保持现状也可以。

---

## P3｜为什么暂不建议上 patch 集

`patches/*.patch` + `git apply -3` 看起来很美（冲突显式、可回滚），但对这个项目不合适：

1. 上游改动密度高（本次 318 提交），16 个源码 patch 大概率**逐个 apply 失败**，
   还是要人工介入，只是把"读 diff"换成了"读 apply 失败信息"，没省事。
2. 本项目多数改动是**值级/单行**（`-2`、`+3` 这种），用 patch 反而比直接改更繁琐。
3. 维护 patch 文件本身也是成本，且容易和实际代码不同步。

**什么时候可以考虑**：如果未来某类改动连续 3 个月不再变化、且体量较大（>50 行），
再把那一项单独抽成 patch。

---

## 建议的执行顺序

1. **P0-1 自检脚本**（1h）—— 先有"探针"，后面所有改动都能被它保护
2. **P0-2 pagefind**（15min）—— 立刻能删 2 个上游文件改动
3. **P1-1 抽 integration**（20min）—— config 合并从此无痛
4. 跑一次完整构建 + `pnpm verify`，确认全绿后再提交
5. P1-2 配置外置（2h）—— 可以留到下次同步上游前再做

做完 1~3，源码级冲突面可从 16 个文件降到约 11 个，且每一项都有脚本兜底。
