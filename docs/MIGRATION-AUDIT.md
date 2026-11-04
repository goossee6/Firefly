# 迁移完整性核对报告

> 核对时间：2026-11-05
> 分支：`tmp/upstream-base`（工作区改动未提交）
> 核对对象：原博客分支 `master`（基于 Firefly 6.13.3 深度定制）→ 当前工作区（基于 6.16.9 重放定制）
> 上游远端：`upstream` = `CuteLeaf/Firefly`

---

## 结论速览

| 项 | 结论 |
|---|---|
| **是否基于最新上游** | ✅ 是。`HEAD` 与 `upstream/master` 的 sha 完全相同（`af8e98fd`），落后 **0** 个提交 |
| **功能面是否同步完整** | ✅ 18 项定制全部在位，无功能性遗漏 |
| **类型检查** | ✅ `astro check`：271 文件 / **0 error / 0 warning** / 4 hint |
| **构建** | ✅ `CF_WORKERS=true pnpm build` exit 0，68 页，根跳转 + 7 别名镜像正常 |
| **需你确认** | ⚠️ **4 项**（见第四节），其中 1 项是配置被改回默认值 |
| **文档需更新** | ⚠️ 1 处：`site_url` 实际值与你改后的不一致 |

---

## 一、上游基线确认

```
upstream/master : af8e98fd  fix(utils): 统一全站日期格式化与归档分组遵循 siteConfig 时区配置 (#700)
本地 HEAD        : af8e98fd  （同一个提交）
落后上游提交数    : 0
```

`git fetch upstream` 后确认无新提交，基线成立。

---

## 二、功能面核对（18 项）

全部**在位**。逐项如下：

| # | 定制项 | 关键文件 | 状态 | 验证方式 |
|---|---|---|---|---|
| 1 | 子路径部署 `/blog/` | `astro.config.mjs`、`vercel.json`、`wrangler.jsonc` | ✅ | 产物为 `dist/client/blog/**` |
| 2 | 根跳转 + 别名镜像 | `src/integrations/root-redirect.mjs` | ✅ | `dist/client/index.html`；根下 7 个别名目录 |
| 3 | 版本号构建时注入 | `astro.config.mjs`、`SiteInfo.astro` | ✅ | `__BLOG_VERSION__` 已 define |
| 4 | 文章别名 301 | `src/pages/[...alias].astro`、`content.config.ts` | ✅ | `/blog/yuanshen/` → `/blog/posts/好想玩原神/` |
| 5 | 置顶数字权重 | `content.config.ts`、`content-utils.ts` | ✅ | schema 为 `union(boolean, number)` |
| 6 | 站外中转 `/go/` | `src/pages/go.astro` | ✅ | 文件存在，路由产出 |
| 7 | `/game/` 跳转页 | `src/pages/game.astro` | ✅ | 静态跳转页 + 根层镜像 |
| 8 | 工具集合 `/tools/`、SteamID | `tools.astro`、`tools/steamid.astro` | ✅ | 两页均产出 |
| 9 | `==高亮==` | `remark-mark.mjs`、`tags.css` | ✅ | 插件已注册 |
| 10 | `::api{}` 按钮 | `rehype-component-api-button.mjs` | ✅ | 已挂 `rehypeComponents` |
| 11 | frontmatter 统一 | `scripts/fix-frontmatter.ts` | ✅ | build 链第一步 |
| 12 | 正文哈希维护 `updated` | `scripts/sync-updated.ts` | ✅ | build 链第二步 |
| 13 | 「N 天前」相对时间 | `date-utils.ts`、`PostMeta.astro` | ✅ | `formatRelativeTime()` 存在 |
| 14 | 壁纸轮播时长可配 | 5 个文件透传 CSS 变量 | ✅ | `transitionDuration: 1000` |
| 15 | pagefind 索引跟随 base | `scripts/run-pagefind.ts` | ✅ | 输出到 `dist/client/blog/pagefind`，搜索组件用上游 `url()` |
| 16 | 「最后活动」按自然日 | `SiteStats.astro` | ✅ | — |
| 17 | `PostCover` 组件 | `src/components/misc/PostCover.astro` | ⚠️ | **文件在，未接入**（有意保留） |
| 18 | 个人配置 | 见下 | ✅ | — |

### 个人配置实际值（已逐项抽查）

| 文件 | 当前值 |
|---|---|
| `siteConfig.ts` | 标题「CC 的 Blog」/ 副标题「嘻嘻」/ `site_url: https://blog.cn3.top/blog/` |
| `profileConfig.ts` | `avatar: /assets/images/doro01.avif`、名字 CC、bio「嘻嘻.」 |
| `navBarConfig.ts` | 「工具」一级菜单、`/game/` 入口、bilibili/bangumi/myanimelist 页（**无失效的 `/anime/`**） |
| `analyticsConfig.ts` | Umami `117d7413-…`、`https://u.cn3.top/script.js` |
| `FooterConfig.html` | 萌ICP备20260766号 |
| `backgroundWallpaper.ts` | `carousel.transitionDuration: 1000` |

### 改动构成

```
新增文件 47 个（零冲突风险）
修改上游文件 30 个（下次同步的冲突面）
```

30 个被修改的上游文件里，**纯数据配置 9 个**（`src/config/*.ts`、`FooterConfig.html`、`lqips.json`），
**构建/部署配置 4 个**（`astro.config.mjs`、`package.json`、`vercel.json`、`wrangler.jsonc`、`.gitignore`），
其余 17 个是源码级改动 —— 这部分是后续优化的重点（见第六节）。

---

## 三、原分支 131 个文件 → 当前 77 个，差额去哪了

原分支相对共同基线（`7409e2f7` 6.13.3）改过 **131** 个文件。当前只动了 **77** 个。
差额 54 个，逐类定性如下，**均不属于功能遗漏**：

### 3.1 上游已原生实现，无需再迁移（4 类）

| 原定制 | 上游 6.16.9 现状 |
|---|---|
| `sidebarConfig.ts` 新增 `hideSidebarOnPostPage` | 上游已有同名字段（`sidebarConfig.ts:22`） |
| `FloatingTOC.astro` 加 `data-hide-sidebar-on-post` + 强制显示悬浮目录 | 上游已原生实现（`FloatingTOC.astro:21-26`） |
| `Layout.astro` / `MainGridLayout.astro` 网格改写 | 上游已重构，`MainGridLayout.astro:86,119,156` 原生透传该字段，另有 `SidebarColumn.astro` |
| `og/[...slug].png.ts` → `og/[...slug].ts` 重命名 | 上游实现完全一致 |
| `src/utils/build-platform.ts` | 当前文件与 master 版本 **逐字节相同** |

### 3.2 纯格式噪声，无实际差异（已用 `git diff --ignore-all-space` 验证）

| 文件 | 表观差异 | 实际 |
|---|---|---|
| `public/assets/css/twikoo-custom.css` | 76/76 行 | 仅 tab→空格缩进，样式内容一致 |
| `public/assets/js/highlight.min.js` | 8422/1208 | 同为 v11.9.0，压缩产物格式不同 |
| `public/assets/js/marked.min.js` | 2217/59 | 同为 16.2.1 |
| `public/pio/models/spine/firefly/1310.json` | 10638/10638 | 忽略空白后 **0/0** |
| `scripts/subset-fonts.ts` | 14/16 | 全为 biome 格式化 |
| `scripts/quarantine-bad-posts.mjs` | 15/17 | 全为引号/缩进格式化 |
| `scripts/new-post.js` | 25/23 | 格式化 + 一行 `crypto` 导入（用于 uid，已放弃） |
| `_frontmatter.json` / `public/anime-list.json` / `guestbook.md` | 65/65 等 | 空白差异 |
| `biome.json` / `postcss.config.mjs` / `svelte.config.js` | 少量 | 工具链格式 |

### 3.3 上游结构变更（不是遗漏，是上游删了）

| 项 | 说明 |
|---|---|
| `src/config/footerConfig.ts` | **上游 6.16.9 已删除该文件**，只剩 `src/config/FooterConfig.html`，Footer HTML 注入改为默认开启。原分支的 `enable: true` 已无意义，备案号仍然生效 |
| `src/pages/anime.astro` | 上游拆成 `bilibili.astro` / `bangumi.astro` / `myanimelist.astro`，导航已随之更新 |

### 3.4 主动放弃（此前已决策，非遗漏）

| 项 | 原因 |
|---|---|
| `scripts/backfill-uid.ts` + 文章 `uid` 字段 | 自建统计（D1 PV）已整体移除，`uid` 无消费方 |
| `PostCover` 接入 `PostCard` | 上游重写无封面布局，强行接回会破坏新版栅格 |
| `SakuraEffect.astro` 的 `baseUrl` 补丁 | 上游 6.16.9 已无 `sakuraConfig`，该特效不存在 |
| 广告位 `ad1.webp` | 广告组件 `enable: false`，图片已删，不影响渲染 |
| `src/pages/posts/[...slug].astro` 的 `?? ""` 空值兜底 | 上游已修好类型（`astro check` 0 error 即可证明） |

### 3.5 上游演示内容（保持上游原样，属内容决策）

15 篇演示文章（`markdown-tutorial.md`、`code-examples.md`、`firefly*.md` 等）、
`src/content/spec/about.md`、`guestbook.md` 目前都是上游文案，会被发布到站点。

---

## 四、需要你确认的 4 项

### ① `site_url` 已被你改过，文档需同步

```diff
- site_url: "https://cn3.top/blog/"      ← docs/CUSTOMIZATIONS.md 里记的还是这个
+ site_url: "https://blog.cn3.top/blog/" ← 当前实际值
```

`docs/CUSTOMIZATIONS.md` §9 需要更新为 `blog.cn3.top`。
**这个值决定 sitemap、RSS、OG 图、canonical 里的绝对域名**，必须与实际部署域名一致。

### ② 有 4 处配置在核对期间被改回了上游默认值

| 文件 | 提交时的值 | 当前值 |
|---|---|---|
| `commentConfig.ts` | `envId: http://twikoo.vercel.app`、`visitorCount: false` | `https://…`、`visitorCount: true` |
| `pioConfig.ts` | `spineModelConfig.enable: true` | `false` |
| `sponsorConfig.ts` | 爱发电 `enabled: true` | `false` |
| `siteConfig.ts` | `site_url: cn3.top` | `blog.cn3.top` |

前三条看着像**你有意在回收**（关看板娘、关打赏、开评论计数），第四项是域名修正。
请确认这是最终值 —— 如果不是，需要改回来；如果确认，我按当前值写进文档。

> 注：`visitorCount: true` 是 **Twikoo 自带的文章 PV**，与已删除的 D1 自建统计不是一回事，不冲突。

### ③ `about.md` / `guestbook.md` 还是上游演示文案

当前 `src/content/spec/about.md` 内容是「我是 **夏叶**」，并链接到 `blog.cuteleaf.cn`。
原分支只改过标题层级（`#` → `##`），内容本来也是上游的。若「关于」页要放个人内容，需要另写。

### ④ `public/pio/static/spine-player.min.js` 版本不一致

旧分支与当前相差 13552 行，属于**不同版本的 spine-player 构建**（不是格式差异）。
看板娘目前 `enable: false`，暂时无影响；若以后重新开启，需要确认用哪一版。

---

## 五、复核命令

```bash
# 上游基线
git fetch upstream && git rev-parse HEAD upstream/master   # 两个 sha 应相同

# 功能面
CF_WORKERS=true npx astro check                            # 期望 0 error

# 完整构建 + 产物验收
CODEBUDDY_SAFE_DELETE_ENABLED=0 CF_WORKERS=true pnpm build
ls dist/client/index.html                                  # 根跳转页
ls -d dist/client/{yuanshen,q,vndb,bangumi,myanimelist,game,target-iscsi-server}
grep -c Redirecting dist/client/blog/index.html            # 期望 0（首页未被覆盖）
```
