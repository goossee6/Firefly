// 在 astro build 之后运行 Pagefind。
//
// 三个坑：
// 1. 直接写 `pagefind --site dist`，在 Cloudflare Workers（产物在 dist/client）上会索引出
//    /client/... 的假路径，索引输出到 dist/pagefind 也不会随站点部署 —— 线上搜索 404。
//    所以这里先用 resolveSiteRoot() 对准真正的站点根目录。
// 2. 索引输出位置必须**和页面同层**：
//    - 适配器构建：页面在 <root>/<base>/（如 dist/client/blog/index.html），
//      浏览器请求 /blog/pagefind/pagefind.js，索引要落在 <root>/<base>/pagefind。
//    - 纯静态构建：页面直接在 <root>/（如 GitHub Pages 的 dist/index.html），
//      索引要落在 <root>/pagefind，此时不能再加 base 层。
//    判断依据是 <root>/<base>/index.html 是否存在，而不是「有没有配 base」——
//    GitHub Pages 的 base 是 /Firefly/，但产物根就是站点根，多加一层反而 404。
// 3. 换布局后旧位置的索引可能残留，一并清掉，避免产物里同时存在两份。

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveBaseSegment, resolveSiteRoot } from "./site-root";

const siteRoot = resolveSiteRoot();
const baseSegment = resolveBaseSegment();

// 页面是否被放在 base 子目录里（适配器构建为 true，纯静态构建为 false）
const pagesUnderBase =
	baseSegment !== "" &&
	existsSync(join(siteRoot, baseSegment, "index.html"));

const outputSubdir = pagesUnderBase ? `${baseSegment}/pagefind` : "pagefind";

// 清掉另一种布局遗留的索引目录
const staleSubdir = pagesUnderBase
	? "pagefind"
	: baseSegment
		? `${baseSegment}/pagefind`
		: "";
if (staleSubdir) {
	const staleDir = join(siteRoot, staleSubdir);
	if (existsSync(staleDir)) rmSync(staleDir, { recursive: true, force: true });
}

console.log(
	`[pagefind] 页面层：${pagesUnderBase ? `<${baseSegment}> 子目录` : "站点根"} → 索引 ${join(siteRoot, outputSubdir)}`,
);

const result = spawnSync(
	"pagefind",
	["--site", siteRoot, "--output-subdir", outputSubdir],
	{
		stdio: "inherit",
		// Windows 下 .bin 里是 .cmd 包装，需要 shell 才能解析到
		shell: process.platform === "win32",
	},
);
process.exit(result.status ?? 1);
