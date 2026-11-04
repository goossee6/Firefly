# 多平台部署

同一份代码部署到四个平台：Cloudflare Workers（主站）、Cloudflare Pages、Vercel、GitHub Pages。

差别只有三处，全部通过环境变量控制，不改代码：

| 变量 | 含义 | 默认值 |
|---|---|---|
| `SITE_BASE` | 站点挂载路径，Astro 的 `base` | `/blog/` |
| `SITE_URL` | 绝对站点地址，决定 canonical / sitemap / RSS / OG 里的域名 | `https://blog.cn3.top/blog/` |
| `STATIC_BUILD` | 设为 `1` 时关闭 Cloudflare 适配器，产出纯静态 `dist` | 未设置（适配器启用） |

---

## 一、四平台对照

| 平台 | 构建命令 | SITE_BASE | 产物目录 | 适配器 |
|---|---|---|---|---|
| Cloudflare Workers（主站） | `pnpm build` | `/blog/` | `dist/client` | 启用 |
| Cloudflare Pages | `pnpm build` | `/blog/` | `dist/client` | 启用 |
| Vercel | `pnpm build` | `/blog/` | `dist/client` | 启用 |
| GitHub Pages | `pnpm build:platform github-pages` | `/Firefly/` | `dist` | 关闭 |

前三者的产物**完全相同**，一套构建通吃。GitHub Pages 因为不能跑适配器、且站点挂在 `/<repo>/` 下，单独一套。

## 二、为什么 GitHub Pages 必须单独构建

两层原因叠加：

**1. 适配器的产物目录不对**

启用适配器时产物是 `dist/client/blog/...`。GitHub Pages 上传的是整个产物目录，站点根映射到 `/Firefly/`，多出来的 `client/` 层级会让所有路径错位。

**2. `root-redirect` 钩子会覆盖首页**

钩子的逻辑是「在产物根写一个跳到 `/<base>/` 的页面」。适配器模式下这个行为是对的（产物根 ≠ 站点根）；但 GitHub Pages 的产物根**就是**站点根，写了跳转页就等于把首页换成了「跳到 /Firefly/」，而 `/Firefly/` 正是首页本身 —— 死循环。

钩子里有 `existsSync(<root>/<base>/index.html)` 守卫：纯静态构建时这个目录不存在，于是整体跳过，首页不受影响。所以 GitHub Pages 必须走 `STATIC_BUILD=1`。

**3. pagefind 索引要跟着页面层级走**

| 构建方式 | 页面位置 | 索引位置 |
|---|---|---|
| 适配器 | `dist/client/blog/index.html` | `dist/client/blog/pagefind/` |
| 纯静态 | `dist/index.html` | `dist/pagefind/` |

`scripts/run-pagefind.ts` 用 `<root>/<base>/index.html` 是否存在来判断页面在哪一层，而不是「有没有配 base」——
GitHub Pages 的 base 是 `/Firefly/`，但页面在产物根，多加一层反而 404。

## 三、各平台配置

### Cloudflare Workers（当前主站）

仓库根的 `wrangler.jsonc` 已配好，平台侧只需：

| 项 | 值 |
|---|---|
| 构建命令 | `pnpm build`（平台默认值即可） |
| 部署命令 | `npx wrangler deploy` |
| 环境变量 | 不需要 |

`assets.directory` 指向 `./dist/client`。

### Cloudflare Pages

| 项 | 值 |
|---|---|
| Framework preset | None |
| Build command | `pnpm build` |
| Build output directory | `dist/client` |
| 环境变量 | `SITE_URL` = `https://<项目名>.pages.dev/blog/`（可选，见下） |

部署后根路径 `/` 会 302 到 `/blog/`，站点实际入口是 `https://<项目名>.pages.dev/blog/`。

### Vercel

`vercel.json` 已包含全部配置（输出目录、redirect、缓存头），平台侧只需确认：

| 项 | 值 |
|---|---|
| Framework Preset | Other（**不要选 Astro**，预设会接管输出目录） |
| Output Directory | `dist/client` |
| 环境变量 | `SITE_URL` = `https://<项目名>.vercel.app/blog/`（可选） |

### GitHub Pages

`.github/workflows/deploy.yml` 已改好，push 到 `master` 或手动 `workflow_dispatch` 即自动构建部署。

仓库侧需要一次性设置：

1. Settings → Pages → Source 选 **GitHub Actions**
2. 仓库名变了，改 workflow 顶部的 `SITE_BASE` / `SITE_URL`
3. 用自定义域名时：`SITE_BASE` 改成 `/`，`SITE_URL` 改成 `https://你的域名/`，并在 Pages 设置里填 CNAME

访问地址：`https://goossee6.github.io/Firefly/`

产物自带 `.nojekyll`（构建脚本写入），否则 GitHub Pages 会忽略 `_astro` 目录，样式全丢。

## 四、关于 SITE_URL

你选择了「各平台用自己的域名」，所以不同平台构建时 canonical / sitemap 应当指向自己的地址。

`SITE_URL` 没设时回落到主站 `https://blog.cn3.top/blog/`。如果 Cloudflare Pages / Vercel 上也想让搜索引擎认它们的域名，在平台控制台加环境变量即可：

```
SITE_URL = https://xxx.pages.dev/blog/
SITE_URL = https://xxx.vercel.app/blog/
```

> 注意：多个域名提供同样的内容，搜索引擎可能判定重复。即便各平台用自己的 canonical，主站之外的建议加 `X-Robots-Tag: noindex` 或 `robots.txt` 屏蔽，只留一个被索引的入口。

## 五、本地验证

```bash
# 主站形态（/blog/、适配器、产物 dist/client）
pnpm build && pnpm verify

# GitHub Pages 形态（/Firefly/、纯静态、产物 dist）
pnpm build:platform github-pages && STATIC_BUILD=1 pnpm verify

# 只查源码，不构建
pnpm verify:source
```

`pnpm verify` 会按当前构建形态自动切换断言：适配器模式检查根跳转页与别名镜像，
纯静态模式检查首页未被覆盖、索引在产物根。

## 六、常见故障

| 现象 | 原因 |
|---|---|
| `assets.directory ... does not exist` | 适配器没启用（`STATIC_BUILD` 被误设，或误改回 `CF_WORKERS` 条件加载） |
| 整站 404、链接都带 `/blog/` 但文件在根 | 用了纯静态构建却按子路径部署，或反之 |
| GitHub Pages 样式全丢 | 缺 `.nojekyll`，`_astro` 被 Jekyll 忽略 |
| GitHub Pages 打开是「正在跳转」 | 误用适配器构建，`root-redirect` 覆盖了首页 |
| 搜索无结果 | 索引层级与页面层级不一致，看 `run-pagefind.ts` 的「页面层」日志 |
