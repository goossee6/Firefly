# 本站魔改清单（相对上游 Firefly）

> 用途：**每次同步上游时按本文档逐节核对**，确认这些改动在新版本上还需要、还能落位。
> 上游仓库：`upstream`（`CuteLeaf/Firefly`）　本地仓库：`origin`（`goossee6/Firefly`）
> 最近一次同步的上游版本：**6.16.9**（`af8e98fd`）

## 速查表

| # | 功能 | 涉及文件 | 上游是否已有 |
|---|---|---|---|
| 1 | 站点挂载在 `/blog/` 子路径（`SITE_BASE` 可切换） | `astro.config.mjs`、`vercel.json`、`wrangler.jsonc`、`src/pages/game.astro` | ❌ 无 |
| 2 | 根路径跳转 + 文章别名镜像 | `src/integrations/root-redirect.mjs` | ❌ 无 |
| 3 | 版本号构建时注入 | `astro.config.mjs`、`SiteInfo.astro` | ❌ 上游用 `fs` 读取 |
| 4 | 文章别名 301 | `src/pages/[...alias].astro`、`content.config.ts` 的 `alias` | ❌ 无 |
| 5 | 置顶支持数字权重 | `content.config.ts`、`content-utils.ts`、`PostCard/PostMeta` props | ❌ 上游仅布尔 |
| 6 | 站外链接中转页 `/go/` | `src/pages/go.astro` | ❌ 无 |
| 7 | `/game/` → 文章页跳转 | `src/pages/game.astro` + `vercel.json` | ❌ 无 |
| 8 | 工具集合页 `/tools/`、SteamID 工具 | `src/pages/tools.astro`、`src/pages/tools/steamid.astro` | ❌ 无 |
| 9 | Markdown `==高亮==` | `src/plugins/remark-mark.mjs`、`styles/tags.css` | ❌ 无 |
| 10 | Markdown `::api{url=}` 按钮 | `src/plugins/rehype-component-api-button.mjs` | ❌ 无 |
| 11 | 文章 frontmatter 统一格式 | `scripts/fix-frontmatter.ts` | ❌ 无 |
| 12 | 正文哈希自动维护 `updated` | `scripts/sync-updated.ts`、`.sync-hashes.json` | ❌ 无 |
| 13 | 文章更新时间显示为「N天前」 | `utils/date-utils.ts`、`PostMeta.astro` | ❌ 上游显示绝对日期 |
| 14 | 壁纸轮播过渡时长可配 | `config/backgroundWallpaper.ts`、`types/backgroundWallpaper.ts`、`utils/banner-visibility-utils.ts`、`WallpaperSection.astro`、`styles/layout-styles.css` | ❌ 上游写死 1000ms |
| 15 | 搜索索引输出到 `/blog/pagefind/` | `scripts/run-pagefind.ts`、`scripts/site-root.ts` | ✅ 上游 `url()` 现在可直接用 |
| 16 | 统计页「最后活动」按自然日计算 | `SiteStats.astro` | ⚠️ 上游直接减毫秒 |
| 17 | 面包屑/卡片封面组件 `PostCover` | `src/components/misc/PostCover.astro` | ⚠️ 已保留但**未接入** |
| 18 | 个人配置（站点名/头像/导航/统计/评论/页脚） | 见 §9 | — |
| 19 | 四平台部署（Workers / Pages / Vercel / GitHub Pages） | `scripts/build-platform.ts`、`.github/workflows/deploy.yml`、`docs/MULTI-PLATFORM.md` | ❌ 无 |
| 20 | `site_url` 支持 `SITE_URL` 覆盖 | `src/config/siteConfig.ts` | ❌ 上游写死 |

---

## 1. 子路径部署（`base: /blog/`）

**作用**：站点挂载在 `https://blog.cn3.top/blog/` 下，根路径需要跳转。

**改动点**

| 文件 | 内容 |
|---|---|
| `astro.config.mjs` | `base` 取自 `SITE_BASE`（默认 `/blog/`）；`site` 取自 `SITE_URL`（默认主站）；`trailingSlash: "always"`；**适配器默认启用**（仅 `STATIC_BUILD=1` 关闭） |
| `vercel.json` | `outputDirectory: "dist/client"`、`framework: null`、`trailingSlash: true`、`buildCommand: "pnpm build"`、`/` → `/blog/` 302、`/blog/game` → `/blog/posts/game/` 301、`/blog/_astro/(.*)` 长缓存 |
| `wrangler.jsonc` | `assets.directory: "./dist/client"` |
| `src/pages/game.astro` | 目标用 `import.meta.env.BASE_URL` 拼接，不写死 `/blog/` |
| `src/config/siteConfig.ts` | `site_url` 可用 `SITE_URL` 覆盖 |

**三处环境变量**（多平台部署用，默认值与现有线上一致）

| 变量 | 默认 | 说明 |
|---|---|---|
| `SITE_BASE` | `/blog/` | Astro 的 `base` |
| `SITE_URL` | `https://blog.cn3.top/blog/` | canonical / sitemap / RSS / OG 的绝对域名 |
| `STATIC_BUILD` | 未设置 | `1` 时关闭适配器，产出纯静态 `dist`（GitHub Pages 用） |

四个平台的完整配置见 **`docs/MULTI-PLATFORM.md`**。构建入口：

```bash
pnpm build                          # 主站形态（/blog/ + 适配器 → dist/client）
pnpm build:platform github-pages    # GitHub Pages（/Firefly/ + 纯静态 → dist）
```

**为什么适配器改成默认启用**
上游是条件加载（`process.env.CF_WORKERS ? cloudflare() : undefined`）。实测 Astro 7.3.2 下：
**没有适配器时 `base` 只作用于 URL，不作用于产物目录**（页面落在 `dist/` 根，链接却是 `/blog/...`，全站错位）。

偏偏 Cloudflare Workers Builds 用的是平台默认命令 `pnpm run build`，**不会传任何环境变量**，
于是适配器没启用 → 没有 `dist/client` → `wrangler deploy` 报
`The directory specified by the "assets.directory" field ... does not exist`。

所以本站不再依赖 `CF_WORKERS`：适配器默认启用，只有设 `STATIC_BUILD=1` 才构建纯静态产物。
两个平台都跑同一条 `pnpm build`，不需要在控制台配任何变量。

**升级时怎么核对**
1. `astro.config.mjs` 的适配器是否仍为默认启用（`pnpm verify` 会断言，退回条件加载会红）
2. `scripts/site-root.ts` 的 `resolveSiteRoot()` 是否还在（pagefind 依赖它找产物根目录）
3. `base` 行为是否变化（用 `ls dist/client/blog` 验证一次）

---

## 2. 根路径跳转 + 文章别名镜像

**作用**
- 访问 `/` 时跳到 `/blog/`
- 把 `/blog/<alias>/` 的 301 页复制一份到 `<产物根>/<alias>/`，让 `/yuanshen/` 这类老地址在根路径也生效

**改动点**：独立文件 `src/integrations/root-redirect.mjs`（`rootRedirect()` 由 `astro.config.mjs` 引入，只占一行）。
逻辑留在 config 里会跟上游的 config 改动反复打架，抽出来之后上游改 `astro.config.mjs` 基本不用管这块。

关键实现约束（升级时别改错）：

- ⚠️ **`dir` 不是产物根**。Astro 7 传进来的 `dir` 已经拼好了 `base`，实测值是
  `...\dist\client\blog\\`（末尾还带**两个**反斜杠）。直接 `join(dir, "index.html")` 会把跳转页写进
  **站点首页** `dist/client/blog/index.html`，导致 `/blog/` 跳到自己的死循环。
- 正确做法：先 `fileURLToPath(dir).replace(/[\\/]+$/, "")` 归一化去掉尾部分隔符，
  再判断是否以 `` `/${base}` `` 或 `` `\${base}` `` 结尾并剥掉 base 段，得到真正的产物根 `rootDir`；
  站点目录 `siteDir = join(rootDir, base)`。
- 只有 `existsSync(join(siteDir, "index.html"))` 为真才写根跳转页，否则（纯静态无适配器构建）
  页面就落在产物根，写进去会覆盖首页 —— 直接跳过。
- 别名镜像只处理包含 `Redirecting` 字样的 HTML（`Astro.redirect` 的产物特征），源目录是 `siteDir`，目标是 `rootDir`。
- 清理 `dist/server/wrangler.json` 的 `legacy_env` 字段用 `join(rootDir, "..", "server", "wrangler.json")`，
  同样不能拿 `dir` 去拼；try/catch 包裹，无该文件则跳过。

**验证方式（别再用"模拟钩子"代替真实构建）**

真实构建后跑 `pnpm verify`，产物层这几条已经内建断言：根跳转页存在且指向 `/blog/`、
首页不含 `Redirecting`、每个别名目录在产物根都有镜像。单项手查：

```bash
ls dist/client/index.html                              # 根跳转页存在
grep -o 'url=[^"]*' dist/client/yuanshen/index.html    # 指向 /blog/posts/好想玩原神/
ls -l dist/client/blog/index.html                      # 应为 ~400KB 首页，不是跳转页
grep -c Redirecting dist/client/blog/index.html        # 应为 0
```

---

## 3. 版本号构建时注入

**作用**：侧栏「站点信息」显示的版本号不依赖运行时读文件系统（Cloudflare Workers 没有 fs）。

**改动点**
- `astro.config.mjs`：`import pkg from "./package.json"` + `vite.define.__BLOG_VERSION__`
- `src/components/widget/SiteInfo.astro`：`declare var __BLOG_VERSION__: string`，删掉 `node:fs` 读取

---

## 4. 文章别名 301

**作用**：frontmatter 写 `alias: xxx` 或 `alias: [a, b]`，即可让 `/xxx/` 301 到正文。

**改动点**
- `src/pages/[...alias].astro`（新增）
- `src/content.config.ts`：`PostData.alias: string[]` + schema
  ```ts
  alias: z.union([z.string(), z.array(z.string())]).optional().default([])
          .transform((v) => (Array.isArray(v) ? v : v ? [v] : [])),
  ```
  必须 `transform` 成数组，页面里直接 `.length` / `.map`

**升级时**：上游若新增同名的 `[...alias]` 或修改 `content.config.ts` 的 posts schema，需重新合并这两段。

---

## 5. 置顶支持数字权重

**作用**：`pinned: 999` 置顶到最前，`pinned: 0` 不置顶，`true` 等价 100。上游只支持布尔。

**改动点**
- `content.config.ts`：`pinned` 用 `z.union([z.boolean(), z.number()])` + transform 成数字，类型 `pinned: number`
- `src/utils/content-utils.ts`：排序改成 `return b.data.pinned - a.data.pinned`
- `PostCard.astro` / `PostMeta.astro`：props 类型放宽为 `boolean | number`

> 注意：文章里大量使用 `pinned: 0`，若哪天改回布尔 schema，构建会直接报 `Expected boolean, received number`。

---

## 6. 路由扩展

| 路由 | 文件 | 说明 |
|---|---|---|
| `/tools/` | `src/pages/tools.astro` | 工具集合页，卡片列表写死在文件里 |
| `/tools/steamid/` | `src/pages/tools/steamid.astro` | SteamID 三格式互转，纯前端 |
| `/go/?url=` | `src/pages/go.astro` | 站外链接中转，带域名提示和黑名单 |
| `/game/` | `src/pages/game.astro` | `prerender = true` + `Astro.redirect`，产出 meta refresh 跳转页 |

导航入口在 `src/config/navBarConfig.ts`：「工具」一级菜单 + 「我的 → 游戏」。

**升级时**：这几个页面依赖 `MainGridLayout` 的 props（`title`），上游若改了布局组件的签名需要同步。

---

## 7. Markdown 扩展

### 7.1 `==高亮==`
- `src/plugins/remark-mark.mjs`（新增）
- `astro.config.mjs`：`remarkPlugins` 里注册 `remarkMark`（放在 `remarkDirective` 之后）
- `src/styles/tags.css`：`mark` 样式

### 7.2 `::api{url="..." label="..."}`
- `src/plugins/rehype-component-api-button.mjs`（新增）
- `astro.config.mjs`：`rehypeComponents` 的 `components` 里加 `api: ApiButtonComponent`

**升级时**：确认 `unist-util-visit`、`hastscript` 仍在依赖里（上游自带，无需新增）。

---

## 8. 文章工具链

| 脚本 | 作用 | 是否在 build 链里 |
|---|---|---|
| `scripts/fix-frontmatter.ts` | 统一 frontmatter 格式（空字段补 `""`、uid 加引号） | ✅ 第一步 |
| `scripts/sync-updated.ts` | 正文 SHA-256 变化才更新 `updated`，哈希存 `scripts/.sync-hashes.json` | ✅ 第二步 |
| `scripts/check-frontmatter.ts` | 只检查不修改，`pnpm check-frontmatter` | ❌ 手动 |
| `scripts/find-orphan-images.ts` | 找出没被引用的图片，`pnpm find-orphan-images` | ❌ 手动 |
| `scripts/build-local.ts` / `.sh` | 本地构建临时关闭字体子集 | ❌ 手动 |

`package.json` 的 `build` = **上游原链** 前面加这两个脚本：

```
npx tsx scripts/fix-frontmatter.ts && npx tsx scripts/sync-updated.ts && <上游原本的一长串>
```

**升级时**：如果上游改了 `build` 链（例如新增 `prune-pio-assets`、`run-pagefind`），把新链整段复制过来，只保留开头这两个前置脚本。

> ⚠️ `sync-updated` 会给「正文变过」的文章自动写 `updated`，从上游拿新版本演示文章时会顺带改它们的日期。
> 若不想污染上游文件，同步后对 `src/content/posts/` 下的上游演示文章执行 `git checkout --` 还原即可（哈希已记录，不会再次写入）。

---

## 9. 个人配置（纯数据，非逻辑）

| 文件 | 定制内容 |
|---|---|
| `config/siteConfig.ts` | 标题「CC 的 Blog」、副标题「嘻嘻」、`site_url: https://blog.cn3.top/blog/`、建站日 2026-06-01、`bilibili.uid: 33430087`、`pages.bilibili: true` |
| `config/profileConfig.ts` | 头像 `/assets/images/doro01.avif`（放 public，见下）、名字 CC、bio「嘻嘻.」、GitHub `goossee6`、`mailto:i@cn3.top` |
| `config/navBarConfig.ts` | 「工具」一级菜单、`/game/` 入口、外链改个人仓库 |
| `config/analyticsConfig.ts` | Umami `websiteId` + 自建 `u.cn3.top` |
| `config/commentConfig.ts` | Twikoo `envId`、`visitorCount: true`（Twikoo 自带 PV，与已删的 D1 统计无关） |
| `config/sponsorConfig.ts` | 关闭赞助者列表、关闭支付宝/微信，爱发电 `ccooo` 但 `enabled: false` |
| `config/pioConfig.ts` | `enable: false`（看板娘暂时关闭） |
| `config/FooterConfig.html` | 萌ICP备20260766号 |
| `config/backgroundWallpaper.ts` | `carousel.transitionDuration: 1000` |

**头像为什么放 `public/`**
`doro01.avif` 是 AVIF **image sequence**（文件头 `ftypavis`），sharp 无法解码，放 `src/assets` 会导致
`astro build` 的 LQIP/图片优化报 `Input file contains unsupported image format`。
放到 `public/assets/images/` 并写绝对路径 `/assets/images/doro01.avif` 即绕过构建期处理。

> 副作用：`src/pages/og/[...slug].ts` 的 OG 图渲染器同样解不了它，构建会刷 32 条告警，
> 表现只是 OG 卡片上没有头像。要消掉就转成 WebP 再改 `profileConfig.avatar`。

### 个人配置快照（同步上游后一键恢复）

这 8 个文件会被上游整份覆盖成模板默认值，且**构建不会报错**，只能在页面上看出不对。
所以它们各存了一份快照在 `scripts/personal/`：

```bash
pnpm snapshot:personal   # 改过个人值之后，重新录制快照（含上游 blob sha 基线）
pnpm restore:personal    # 同步上游后，一把恢复（只写有差异的文件）
node scripts/restore-personal-config.mjs --check   # 只检查，CI 可用
```

恢复时会拿「录制时的上游 blob sha」和当前上游版本比对；上游改过这个文件就会列出来提醒，
因为快照可能缺少上游新增的字段 —— 这时候手工 `git diff upstream/master -- <文件>` 看一眼。

---

## 10. 视觉与交互微调

| 改动 | 文件 | 上游情况 |
|---|---|---|
| 更新时间显示「N天前」+ hover 显示完整日期 | `utils/date-utils.ts`、`PostMeta.astro` | 上游显示绝对日期，无相对时间函数 |
| 壁纸轮播过渡时长可配置 | 见速查表 #14 | 上游 `layout-styles.css` 写死 `1000ms` |
| 站点统计「N 天未更新」按自然日计算 | `SiteStats.astro` | 上游直接减毫秒，跨时区会差一天 |
| 搜索索引输出到 `/blog/pagefind/` | `scripts/run-pagefind.ts`、`scripts/site-root.ts` | ✅ 上游 `url()` 现在天然正确，两个组件保持原样 |
| 「上次更新」文案 | `i18n/languages/zh_CN.ts` | 上游为「最后活动」 |

**pagefind 的坑（已用输出路径解决，不要再改组件）**

索引默认输出到 `<产物根>/pagefind`，而站点在 `/blog/` 下，浏览器请求的是 `/blog/pagefind/pagefind.js`。
早期做法是硬改 `Navbar.astro` / `search.astro` 的路径，等于每次同步都要维护两个上游文件。

现在改由 `scripts/run-pagefind.ts` 传 `--output-subdir blog/pagefind`（子路径名从 `astro.config.mjs` 的 `base` 解析），
索引直接落在 `dist/client/blog/pagefind`，上游组件里的 `url('/pagefind/pagefind.js')` 拼出来就是对的。
**这两个文件应当保持与上游完全一致**，`pnpm verify` 会断言这一点。

`<root>/pagefind` 的残留索引会在每次构建时清掉，避免产物里同时存在两份。

---

## 11. 已知未接入 / 已放弃

| 项 | 状态 | 原因 |
|---|---|---|
| `src/components/misc/PostCover.astro`（无封面文章生成随机装饰图） | **保留但未接入** | 上游 6.15+ 重写了 `PostCard` 的无封面布局（改用紧凑的「进入」按钮 + `no-cover` 类），强行接回会破坏新版栅格 |
| 文章 `uid` 字段 / `backfill-uid.ts` | **已放弃** | 自建统计（D1 浏览量）已整体移除，`uid` 无消费方。文章里残留的 `uid:` 会被 zod 自动忽略 |
| 阴影/网格列相关的 JS 补丁 | **已放弃** | 上游已原生实现 `hideSidebarOnPostPage` 并抽出 `grid-layout-utils.ts`、`sidebar-effective-utils.ts` |
| `og/[...slug].ts` 的重命名与路径后缀 | **已放弃** | 上游实现完全一致（`params: { slug: \`${slug}.png\` }`） |
| 追番旧页 `anime.astro` | **已放弃** | 上游拆成 `bilibili.astro` / `bangumi.astro` / `myanimelist.astro`，配置迁移到 `siteConfig.bilibili.uid` |

---

## 12. 自检脚本 `pnpm verify`

**为什么需要**：这套定制里最危险的不是"改错了报错"，而是"改错了不报错"。
`root-redirect` 把首页覆盖成自我跳转页、pagefind 索引写错目录、个人配置被上游覆盖 —— 三种情况
`astro build` 全是 exit 0。所以把每一条都写成硬断言。

```bash
pnpm verify           # 源码 19 项 + 产物 6 项（dist 不存在时只查源码）
pnpm verify:source    # 只查源码，不依赖构建
```

覆盖范围：

| 层 | 断言内容 |
|---|---|
| 源码 | `base` 存在、`root-redirect` 已注册且保留尾分隔符归一化、`alias`/`pinned` schema、5 个定制路由、2 个 Markdown 插件、build 链顺序、pagefind 输出参数、两个搜索组件保持上游原样、Vercel/Cloudflare 产物目录、统计接口已删、个人配置值、快照齐全、备案号、轮播变量、相对时间函数 |
| 产物 | 首页未被覆盖、根跳转指向 `/blog/`、别名页全部镜像、pagefind 位于 `blog/pagefind`、`wrangler.json` 无 `legacy_env`、页面数 ≥ 50 |

失败会打印具体修复提示。下次同步上游时，建议流程固定为：

```bash
git fetch upstream && git merge upstream/master   # 或重放式迁移
pnpm restore:personal                             # 恢复个人配置
pnpm build                                        # 构建
pnpm verify                                       # 25 项断言
```

新增定制项时，顺手在 `scripts/verify-customizations.mjs` 里加一条 `check()`，这比写在文档里靠人记要可靠。
