// 在 astro build 之后运行 Pagefind。
//
// 两个坑：
// 1. 直接写 `pagefind --site dist`，在 Cloudflare Pages（产物在 dist/client）上会索引出
//    /client/... 的假路径，索引输出到 dist/pagefind 也不会随站点部署 —— 线上搜索 404。
//    所以这里先用 resolveSiteRoot() 对准真正的站点根目录。
// 2. 索引默认输出到 <root>/pagefind，但站点部署在 /blog/ 子路径下，浏览器请求的是
//    /blog/pagefind/pagefind.js。这里用 --output-subdir 把索引放进 base 目录，
//    于是组件里可以照常用 url('/pagefind/pagefind.js')，不必为了迁就索引位置去改上游文件。

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveBaseSegment, resolveSiteRoot } from "./site-root";

const siteRoot = resolveSiteRoot();
const baseSegment = resolveBaseSegment();

const args = ["--site", siteRoot];
if (baseSegment) {
	// 清掉旧位置（<root>/pagefind）的残留索引，避免升级后产物里同时存在两份
	const legacyDir = join(siteRoot, "pagefind");
	if (existsSync(legacyDir)) rmSync(legacyDir, { recursive: true, force: true });
	args.push("--output-subdir", `${baseSegment}/pagefind`);
}

const result = spawnSync("pagefind", args, {
	stdio: "inherit",
	// Windows 下 .bin 里是 .cmd 包装，需要 shell 才能解析到
	shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
