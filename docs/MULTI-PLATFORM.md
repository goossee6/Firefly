# 多平台部署

同一份代码部署到四个平台：Cloudflare Workers（主站）、Cloudflare Pages、Vercel、GitHub Pages。

差别只有三处，全部通过环境变量控制，不改代码：

| 变量 | 含义 | 默认值 |
|---|---|---|
| `SITE_BASE` | 站点挂载路径，Astro 的 `base` | `/`（独立域名根路径） |
| `SITE_URL` | 绝对站点地址，决定 canonical / sitemap / RSS / OG 里的域名 | `https://blog.cn3.top/` |
| `STATIC_BUILD` | 设为 `1` 时关闭 Cloudflare 适配器，产出纯静态 `dist` | 未设置（适配器启用） |

---

## 一、四平台对照

| 平台 | 构建命令 | SITE_BASE | 产物目录 | 适配器 |
|---|---|---|---|---|
| Cloudflare Workers（主站） | `pnpm build` | `/` | `dist/client` | 启用 |
| Cloudflare Pages | `pnpm build` | `/` | `dist/client` | 启用 |
| Vercel | `pnpm build` | `/` | `dist/client` | 启用 |
| GitHub Pages | `pnpm build:platform github-pages` | `/` | `dist` | 关闭 |

前三者的产物**完全相同**，一套构建通吃。GitHub Pages 因为不能跑适配器，单独一套。

四个平台都挂在各自域名的**根路径**。GitHub Pages 若没绑自定义域名（走 `github.io/<repo>/` 项目站点），
`SITE_BASE` 必须是 `/<repo>/`，否则页面引用的 `/<repo>/_astro/...` 会全部 404 ——
判断依据只看「站点实际挂在哪个 URL 前缀下」，与用哪个平台无关。

> 站点已从 `https://cn3.top/blog/` 迁到 `https://blog.cn3.top/`：独立子域名 + 根路径。
> 选根路径而不是 `blog.cn3.top/blog/`，是为了让上游 Firefly 的默认假设成立（`base = "/"`），
> 资源路径、Pagefind、swup、PWA scope 都不需要额外补丁，后续同步上游时这块不再产生冲突。

## 二、为什么 GitHub Pages 必须单独构建

两层原因叠加：

**1. 适配器的产物目录不对**

启用适配器时产物是 `dist/client/...`，站点已在其中按 `base` 组织。GitHub Pages 上传的是整个产物目录，多出来的 `client/` 层级会让所有路径错位。

**2. `root-redirect` 钩子会覆盖首页**

钩子的逻辑是「在产物根写一个跳到 `/<base>/` 的页面」。适配器模式下这个行为是对的（产物根 ≠ 站点根）；但 GitHub Pages 的产物根**就是**站点根，写了跳转页就等于把首页换成了「跳到 /<base>/」，而那个地址正是首页本身 —— 死循环。

钩子里有 `existsSync(<root>/<base>/index.html)` 守卫：纯静态构建时这个目录不存在，于是整体跳过，首页不受影响。所以 GitHub Pages 必须走 `STATIC_BUILD=1`。

**3. pagefind 索引要跟着页面层级走**

| 构建方式 | 页面位置 | 索引位置 |
|---|---|---|
| 适配器 + `base = "/"` | `dist/client/index.html` | `dist/client/pagefind/` |
| 适配器 + `base = "/blog/"` | `dist/client/blog/index.html` | `dist/client/blog/pagefind/` |
| 纯静态 | `dist/index.html` | `dist/pagefind/` |

`scripts/run-pagefind.ts` 用 `<root>/<base>/index.html` 是否存在来判断页面在哪一层，而不是「有没有配 base」——
项目站点的 base 是 `/<repo>/`，但页面在产物根，多加一层反而 404。

## 三、各平台配置

### Cloudflare Workers（当前主站）

仓库根的 `wrangler.jsonc` 已配好，平台侧只需：

| 项 | 值 |
|---|---|
| 构建命令 | `pnpm build`（平台默认值即可） |
| 部署命令 | `npx wrangler deploy` |
| 环境变量 | 不需要 |

`assets.directory` 指向 `./dist/client`。

**自定义域名（当前：`blog.cn3.top`）**

在 Workers 项目 → Settings → Domains & Routes 添加 `blog.cn3.top`。因为 `base = "/"`，
域名根路径就是首页，不需要任何子路径前缀，也不需要 `root-redirect` 生成跳转页（钩子会自动跳过）。

### 旧地址 `cn3.top/blog/*` 的 301

站点换域名后，旧链接（外链、搜索引擎收录）仍指向 `cn3.top/blog/xxx/`。推荐在**主域 cn3.top 那侧**做整段跳转，而不是在新站里兼容：

Cloudflare 控制台 → 该域名 → Rules → Redirect Rules，新建：

| 项 | 值 |
|---|---|
| When incoming requests match | `URI Path` `starts with` `/blog/` |
| Then | Type = **Dynamic**，Expression = `concat("https://blog.cn3.top", substring(http.request.uri.path, 5))` |
| Status code | `301` |

`substring(path, 5)` 去掉开头的 `/blog`，于是 `/blog/post/foo/` → `https://blog.cn3.top/post/foo/`。
用 301 而不是 302，搜索引擎才会把权重迁到新域名。

> 检查点：现在 `cn3.top/blog/` 返回 302 且跳转目标还带 `/blog/`，会落到新站的 404。
> 改成上面这条规则后，`cn3.top/blog/xxx` 应一跳直达 `blog.cn3.top/xxx`。

### Cloudflare Pages

| 项 | 值 |
|---|---|
| Framework preset | None |
| Build command | `pnpm build` |
| Build output directory | `dist/client` |
| 环境变量 | `SITE_URL` = `https://<项目名>.pages.dev/`（可选，见下） |

部署后站点入口就是 `https://<项目名>.pages.dev/`。

### Vercel

`vercel.json` 已包含全部配置（输出目录、redirect、缓存头），平台侧只需确认：

| 项 | 值 |
|---|---|
| Framework Preset | Other（**不要选 Astro**，预设会接管输出目录） |
| Output Directory | `dist/client` |
| 环境变量 | `SITE_URL` = `https://<项目名>.vercel.app/`（可选） |

### GitHub Pages

`.github/workflows/deploy.yml` 已改好，push 到 `master` 或手动 `workflow_dispatch` 即自动构建部署。

仓库侧需要一次性设置：

1. Settings → Pages → Source 选 **GitHub Actions**
2. 仓库改名，或增删自定义域名后，改 workflow 顶部的 `SITE_BASE` / `SITE_URL`
3. 用自定义域名时：`SITE_BASE` 改成 `/`，`SITE_URL` 改成 `https://你的域名/`，并在 Pages 设置里填 CNAME

访问地址：`https://blog4.cn3.top/`

> **最常见的 404 原因**：Pages 里绑了自定义域名，但 `SITE_BASE` 还留 `/<repo>/`。
> 此时 `github.io/<repo>/` 已 301 到自定义域名根，页面里却仍引用 `/<repo>/_astro/...`，
> 于是所有 CSS / JS / 图片全部 404，首页 HTML 本身却正常。判断方法：
> `curl -s https://你的域名/ | grep -oE '/[^"]*_astro/[^"]*\.css' | head -1`
> 输出必须是 `/_astro/...`，不能带任何前缀。

产物自带 `.nojekyll`（构建脚本写入），否则 GitHub Pages 会忽略 `_astro` 目录，样式全丢。

## 四、关于 SITE_URL

你选择了「各平台用自己的域名」，所以不同平台构建时 canonical / sitemap 应当指向自己的地址。

`SITE_URL` 没设时回落到主站 `https://blog.cn3.top/`。如果 Cloudflare Pages / Vercel 上也想让搜索引擎认它们的域名，在平台控制台加环境变量即可：

```
SITE_URL = https://xxx.pages.dev/
SITE_URL = https://xxx.vercel.app/
```

> 注意：多个域名提供同样的内容，搜索引擎可能判定重复。即便各平台用自己的 canonical，主站之外的建议加 `X-Robots-Tag: noindex` 或 `robots.txt` 屏蔽，只留一个被索引的入口。

## 五、本地验证

```bash
# 主站形态（/、适配器、产物 dist/client）
pnpm build && pnpm verify

# 项目站点形态（/Firefly/）—— 只在没绑自定义域名时用
SITE_BASE=/Firefly/ SITE_URL=https://goossee6.github.io/Firefly/ pnpm build:platform github-pages

# GitHub Pages 形态（/、纯静态、产物 dist）
pnpm build:platform github-pages && STATIC_BUILD=1 pnpm verify

# 只查源码，不构建
pnpm verify:source
```

> **Windows Git Bash 注意**：`SITE_BASE=/blog/` 作为命令前缀会被 MSYS 当成 POSIX 路径，转换成
> `E:/Program Files/Git/blog` 之类，构建会报 `mkdir 'dist\client\E:\...\blog\_astro\fonts'` 这种荒唐路径。
> 前面加 `MSYS_NO_PATHCONV=1`，或直接用 `pnpm build:platform cf-workers`（脚本内传 env，不经过 shell 转换）。
> PowerShell / Linux CI 没有这个问题。

`pnpm verify` 会按当前构建形态自动切换断言：`base` 非空时检查根跳转页与别名镜像，
`base = "/"` 或纯静态时只检查首页与索引层级。

## 六、常见故障

| 现象 | 原因 |
|---|---|
| `assets.directory ... does not exist` | 适配器没启用（`STATIC_BUILD` 被误设，或误改回 `CF_WORKERS` 条件加载） |
| 首页能开，但 CSS/JS/图片全 404 | 页面在域名根、资源却引用 `/<base>/_astro/...`。要么 `base` 与部署位置不一致，要么 `assets.directory` 指到了 `dist/client/blog` 这类子目录 —— 后者会让 `/` 出首页、`/blog/*` 全 404，正是把 `blog.cn3.top` 指到子目录时踩的坑 |
| 整站 404、链接都带 `/blog/` 但文件在根 | 用了纯静态构建却按子路径部署，或反之 |
| GitHub Pages 样式全丢 | 缺 `.nojekyll`，`_astro` 被 Jekyll 忽略 |
| GitHub Pages 打开是「正在跳转」 | 误用适配器构建，`root-redirect` 覆盖了首页 |
| 搜索无结果 | 索引层级与页面层级不一致，看 `run-pagefind.ts` 的「页面层」日志 |
