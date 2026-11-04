#!/usr/bin/env node
/**
 * 定制项自检。
 *
 * 存在的理由：2026-11 迁移到上游 6.16.9 时，root-redirect 钩子的路径算错了，
 * 把首页覆盖成"跳转到自己"的死循环页，但构建照样 exit 0。靠肉眼看日志、靠模拟钩子
 * 都没发现，最后是真实构建后逐项检查产物才抓到的。
 *
 * 所以把这些"改错了也不会报错"的点写成硬断言：
 *   - 源码层：配置、schema、路由、插件、平台配置、个人配置值是否还在
 *   - 产物层：钩子是否真的写对了位置、页面有没有被覆盖、pagefind 在哪
 *
 * 用法：
 *   node scripts/verify-customizations.mjs          # 源码 + 产物（存在才检查）
 *   node scripts/verify-customizations.mjs --source # 只查源码（CI 里快）
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SOURCE_ONLY = process.argv.includes("--source");

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const failures = [];
let passed = 0;

const read = (relPath) => readFileSync(join(ROOT, relPath), "utf-8");
const exists = (relPath) => existsSync(join(ROOT, relPath));

function check(label, predicate, hint) {
	try {
		if (predicate()) {
			passed++;
			console.log(`  ${GREEN}✓${RESET} ${label}`);
			return;
		}
	} catch (error) {
		failures.push({ label, hint: `${hint ?? ""}（读取失败：${error.message}）` });
		console.log(`  ${RED}✗${RESET} ${label}`);
		return;
	}
	failures.push({ label, hint });
	console.log(`  ${RED}✗${RESET} ${label}`);
}

function section(title) {
	console.log(`\n${BOLD}${title}${RESET}`);
}

// ── 从 astro.config 读出 base，后面所有产物路径都基于它推导 ────────────────
const configSource = exists("astro.config.mjs") ? read("astro.config.mjs") : "";
// base 现在来自 SITE_BASE 环境变量（默认值写在 astro.config.mjs 里），不再是字面量
const baseSegment = (() => {
	if (process.env.SITE_BASE) return process.env.SITE_BASE.replace(/^\/+|\/+$/g, "");
	const envDefault = configSource.match(
		/process\.env\.SITE_BASE\s*\|\|\s*["']([^"']*)["']/,
	);
	if (envDefault) return envDefault[1].replace(/^\/+|\/+$/g, "");
	const literal = configSource.match(/\bbase:\s*["']([^"']*)["']/);
	return literal ? literal[1].replace(/^\/+|\/+$/g, "") : "";
})();

const staticBuild = process.env.STATIC_BUILD === "1";

const siteRoot = exists("dist/client") ? "dist/client" : "dist";
// 适配器构建把站点放进 <root>/<base>；纯静态构建直接放在 <root>
const siteDir = !staticBuild && baseSegment ? join(siteRoot, baseSegment) : siteRoot;

console.log(`${BOLD}定制项自检${RESET} ${DIM}(base=${baseSegment ? `/${baseSegment}/` : "/"})${RESET}`);

// ── 源码层 ────────────────────────────────────────────────────────────────
section("源码");

check(
	"astro.config 声明 base 子路径",
	() => baseSegment.length > 0,
	`astro.config.mjs 的 base 解析为空（SITE_BASE 未生效），站点会部署到根路径`,
);

check(
	"root-redirect 已抽成独立 integration 并注册",
	() =>
		exists("src/integrations/root-redirect.mjs") &&
		configSource.includes('from "./src/integrations/root-redirect.mjs"') &&
		configSource.includes("rootRedirect("),
	"检查 astro.config.mjs 的 import 与 integrations 数组",
);

check(
	"root-redirect 保留了 dir 尾部分隔符归一化",
	() => read("src/integrations/root-redirect.mjs").includes('.replace(/[\\\\/]+$/, "")'),
	"Astro 传入的 dir 末尾带反斜杠，少了这步会把跳转页写进首页",
);

check(
	"content schema 支持 alias（字符串归一化为数组）",
	() => /\.union\(\[\s*z\.string\(\),\s*z\.array\(z\.string\(\)\)\s*\]\)/.test(read("src/content.config.ts")),
	"src/content.config.ts 的 posts schema",
);

check(
	"content schema 支持 pinned 数字权重",
	() => /\.union\(\[\s*z\.boolean\(\),\s*z\.number\(\)\s*\]\)/.test(read("src/content.config.ts")),
	"src/content.config.ts 的 posts schema",
);

check(
	"自定义路由齐全（别名 / 中转 / 工具 / game）",
	() =>
		["src/pages/[...alias].astro", "src/pages/go.astro", "src/pages/tools.astro", "src/pages/tools/steamid.astro", "src/pages/game.astro"].every(
			exists,
		),
	"缺文件说明迁移时漏拷了页面",
);

check(
	"Markdown 扩展插件齐全并已注册",
	() =>
		exists("src/plugins/remark-mark.mjs") &&
		exists("src/plugins/rehype-component-api-button.mjs") &&
		configSource.includes("remarkMark") &&
		configSource.includes("ApiButtonComponent"),
	"remark-mark.mjs（==高亮==）与 rehype-component-api-button.mjs（::api{}）",
);

check(
	"build 链包含本地前置脚本与收尾脚本",
	() => {
		const build = JSON.parse(read("package.json")).scripts.build ?? "";
		const order = ["fix-frontmatter", "sync-updated", "astro build", "run-pagefind"];
		let cursor = -1;
		return order.every((step) => {
			const at = build.indexOf(step, cursor + 1);
			if (at < 0) return false;
			cursor = at;
			return true;
		});
	},
	"package.json 的 build 顺序应为 fix-frontmatter → sync-updated → astro build → … → run-pagefind",
);

check(
	"pagefind 索引输出到 base 子目录",
	() =>
		read("scripts/run-pagefind.ts").includes("--output-subdir") &&
		read("scripts/site-root.ts").includes("resolveBaseSegment"),
	"scripts/run-pagefind.ts：少了 --output-subdir，浏览器会请求 /blog/pagefind/pagefind.js 而 404",
);

check(
	"搜索组件使用 url() 而非硬编码路径（上游文件未被改动）",
	() =>
		read("src/components/layout/Navbar.astro").includes("url('/pagefind/pagefind.js')") &&
		read("src/pages/search.astro").includes("url('/pagefind/pagefind.js')"),
	"这两个文件应当保持上游原样；改回硬编码等于放弃 --output-subdir 的收益",
);

check(
	"Vercel 产物目录指向 dist/client",
	() => {
		const vercel = JSON.parse(read("vercel.json"));
		return vercel.outputDirectory === "dist/client" && vercel.framework === null;
	},
	"vercel.json：outputDirectory 必须是 dist/client，framework 必须是 null（框架预设会覆盖输出目录）",
);

check(
	"Cloudflare 适配器默认启用（不依赖 CF_WORKERS 环境变量）",
	() => {
		const cfg = read("astro.config.mjs");
		// 平台默认构建命令是 `pnpm build`，不会传任何环境变量；
		// 适配器一旦回到条件加载，Cloudflare 上就没有 dist/client，wrangler deploy 直接失败。
		return cfg.includes("STATIC_BUILD") && !/process\.env\.CF_WORKERS\s*\?/.test(cfg);
	},
	"astro.config.mjs：适配器应为默认启用，仅 STATIC_BUILD=1 时关闭",
);

check(
	"Cloudflare assets 目录指向 dist/client",
	() => read("wrangler.jsonc").replace(/\s/g, "").includes('"directory":"./dist/client"'),
	"wrangler.jsonc 的 assets.directory",
);

check(
	"自建统计接口已移除（统一走 Umami）",
	() =>
		!exists("src/pages/api/view.ts") &&
		!exists("src/pages/api/stats.ts") &&
		!exists("src/pages/stats.astro") &&
		!exists("src/pages/api/view/index.ts"),
	"删掉 D1/KV 统计后不应再有浏览计数接口",
);

check(
	"个人站点配置在位",
	() => {
		const site = read("src/config/siteConfig.ts");
		const profile = read("src/config/profileConfig.ts");
		return site.includes("site_url:") && site.includes("blog.cn3.top") && profile.includes("doro01.avif") && profile.includes("goossee6");
	},
	"siteConfig.site_url / profileConfig.avatar、GitHub 链接",
);

check(
	"统计与评论配置在位",
	() => read("src/config/analyticsConfig.ts").includes("umami") && read("src/config/commentConfig.ts").includes("twikoo"),
	"analyticsConfig（Umami）、commentConfig（Twikoo）",
);

check(
	"个人配置快照齐全（pnpm restore:personal 可用）",
	() => {
		const names = [
			"siteConfig.ts",
			"profileConfig.ts",
			"navBarConfig.ts",
			"analyticsConfig.ts",
			"commentConfig.ts",
			"sponsorConfig.ts",
			"pioConfig.ts",
			"FooterConfig.html",
		];
		return names.every((name) => exists(`scripts/personal/${name}.snapshot`)) && exists("scripts/personal/baseline.json");
	},
	"sync 上游前缺快照，个人值只能靠手抄：先跑 pnpm snapshot:personal",
);

check(
	"页脚备案号未被上游覆盖",
	() => read("src/config/FooterConfig.html").includes("萌ICP"),
	"同步上游时 FooterConfig.html 容易被整体覆盖",
);

check(
	"轮播过渡时长配置透传为 CSS 变量",
	() =>
		read("src/config/backgroundWallpaper.ts").includes("transitionDuration") &&
		read("src/types/backgroundWallpaper.ts").includes("transitionDuration"),
	"carousel.transitionDuration → --carousel-transition-duration",
);

check(
	"相对时间格式化函数在位",
	() => read("src/utils/date-utils.ts").includes("formatRelativeTime"),
	"src/utils/date-utils.ts",
);

// ── 产物层 ────────────────────────────────────────────────────────────────
if (SOURCE_ONLY) {
	console.log(`\n${DIM}已跳过产物检查（--source）${RESET}`);
} else if (!exists(siteDir)) {
	console.log(`\n${BOLD}产物${RESET}`);
	console.log(`  ${DIM}跳过：${siteDir} 不存在，先跑一次构建${RESET}`);
} else {
	section("产物");

	check(
		`首页存在且未被跳转页覆盖（${siteDir}/index.html）`,
		() => {
			const html = read(`${siteDir}/index.html`);
			return html.length > 50_000 && !html.includes("Redirecting") && html.includes("<title>");
		},
		"首页被写成了跳转页 —— root-redirect 的路径计算又错了",
	);

	// 纯静态构建（GitHub Pages）时产物根就是站点根，根跳转页与别名镜像都不该生成
	if (!staticBuild) {
		check(
			`根跳转页指向 /${baseSegment}/`,
			() => read(`${siteRoot}/index.html`).includes(`url=/${baseSegment}/`),
			"根路径访问不会跳到博客首页",
		);

		check(
			"别名页已镜像到产物根",
			() => {
				const aliases = readdirSync(join(ROOT, siteDir), { withFileTypes: true })
					.filter((entry) => entry.isDirectory() && entry.name !== baseSegment)
					.filter((entry) => {
						const idx = join(ROOT, siteDir, entry.name, "index.html");
						return existsSync(idx) && readFileSync(idx, "utf-8").includes("Redirecting");
					})
					.map((entry) => entry.name);
				if (aliases.length === 0) return false;
				return aliases.every((name) => existsSync(join(ROOT, siteRoot, name, "index.html")));
			},
			"根路径的 /yuanshen/ 这类别名地址会 404",
		);
	}

	check(
		staticBuild ? "pagefind 索引位于产物根（纯静态构建）" : "pagefind 索引位于 base 子目录",
		() =>
			staticBuild
				? exists(`${siteRoot}/pagefind/pagefind.js`)
				: exists(`${siteDir}/pagefind/pagefind.js`) && !exists(`${siteRoot}/pagefind/pagefind.js`),
		staticBuild
			? `索引应在 ${siteRoot}/pagefind（页面就在产物根，不能再加 base 层）`
			: `索引应在 ${siteDir}/pagefind，且旧位置不应残留`,
	);

	check(
		"Cloudflare wrangler.json 已清理 legacy_env",
		() => !exists("dist/server/wrangler.json") || !read("dist/server/wrangler.json").includes("legacy_env"),
		"@astrojs/cloudflare 的旧字段会让部署报错",
	);

	check(
		"页面数量正常（>= 50）",
		() => {
			const count = (dir) =>
				readdirSync(join(ROOT, dir), { withFileTypes: true }).reduce(
					(sum, entry) => sum + (entry.isDirectory() ? count(join(dir, entry.name)) : entry.name === "index.html" ? 1 : 0),
					0,
				);
			return count(siteDir) >= 50;
		},
		"页面数显著偏少，可能是 collection 构建中断",
	);
}

// ── 汇总 ──────────────────────────────────────────────────────────────────
console.log("");
if (failures.length === 0) {
	console.log(`${GREEN}${BOLD}全部通过${RESET} ${DIM}(${passed} 项)${RESET}`);
	process.exit(0);
}

console.log(`${RED}${BOLD}${failures.length} 项失败${RESET} ${DIM}（通过 ${passed} 项）${RESET}`);
for (const { label, hint } of failures) {
	console.log(`\n  ${RED}✗${RESET} ${label}`);
	if (hint) console.log(`    ${DIM}→ ${hint}${RESET}`);
}
process.exit(1);
