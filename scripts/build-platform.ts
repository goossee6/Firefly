// 多平台构建入口。
//
// 四个平台共用同一份代码，差异只有三处：站点挂载路径（SITE_BASE）、绝对域名（SITE_URL）、
// 以及是否需要纯静态产物（STATIC_BUILD —— GitHub Pages 不能跑适配器）。
//
// 用法：
//   pnpm build:platform cf-workers      # Cloudflare Workers，产物 dist/client
//   pnpm build:platform cf-pages        # Cloudflare Pages，产物 dist/client
//   pnpm build:platform vercel          # Vercel，产物 dist/client
//   pnpm build:platform github-pages    # GitHub Pages 项目站点，产物 dist（纯静态）
//
// 任何一项都可以用环境变量覆盖，例如仓库改名后：
//   SITE_BASE=/NewRepo/ SITE_URL=https://user.github.io/NewRepo/ pnpm build:platform github-pages

import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Preset = {
	base: string;
	url: string;
	static: boolean;
	output: string;
	note: string;
};

const PRESETS: Record<string, Preset> = {
	"cf-workers": {
		base: "/blog/",
		url: "https://blog.cn3.top/blog/",
		static: false,
		output: "dist/client",
		note: "Cloudflare Workers（wrangler.jsonc: assets = ./dist/client）",
	},
	"cf-pages": {
		base: "/blog/",
		url: "https://blog.cn3.top/blog/",
		static: false,
		output: "dist/client",
		note: "Cloudflare Pages（构建输出目录填 dist/client）",
	},
	vercel: {
		base: "/blog/",
		url: "https://blog.cn3.top/blog/",
		static: false,
		output: "dist/client",
		note: "Vercel（Output Directory 填 dist/client，见 vercel.json）",
	},
	"github-pages": {
		base: "/Firefly/",
		url: "https://goossee6.github.io/Firefly/",
		static: true,
		output: "dist",
		note: "GitHub Pages 项目站点（纯静态，输出目录 dist）",
	},
};

const name = process.argv[2] || "cf-workers";
const preset = PRESETS[name];

if (!preset) {
	console.error(`未知平台：${name}`);
	console.error(`可选：${Object.keys(PRESETS).join(" | ")}`);
	process.exit(1);
}

const env: Record<string, string | undefined> = { ...process.env };
env.SITE_BASE = process.env.SITE_BASE || preset.base;
env.SITE_URL = process.env.SITE_URL || preset.url;
if (preset.static) {
	env.STATIC_BUILD = "1";
} else {
	delete env.STATIC_BUILD;
}

console.log(`\n▶ 平台：${name}`);
console.log(`  ${preset.note}`);
console.log(`  SITE_BASE = ${env.SITE_BASE}`);
console.log(`  SITE_URL  = ${env.SITE_URL}`);
console.log(`  STATIC_BUILD = ${env.STATIC_BUILD ?? "(未设置，启用适配器)"}`);
console.log(`  产物目录  = ${preset.output}\n`);

// 上一次构建可能是另一种布局（dist/client vs dist），先清掉产物根避免混淆。
// 交给 Astro 自己清理 outDir 也行，但 dist/client 残留会让 resolveSiteRoot() 判断错层。
if (existsSync("dist")) {
	try {
		rmSync("dist", { recursive: true, force: true });
	} catch {
		console.warn(
			"⚠ 无法清空 dist（文件被占用或被沙箱拦截），继续构建；若产物布局异常请手动删掉 dist",
		);
	}
}

const result = spawnSync("pnpm", ["build"], {
	stdio: "inherit",
	env,
	// Windows 下 pnpm 是 .cmd 包装，需要 shell 才能解析到
	shell: process.platform === "win32",
});

if ((result.status ?? 1) !== 0) {
	console.error(`\n✘ 构建失败（exit ${result.status}）`);
	process.exit(result.status ?? 1);
}

if (!existsSync(preset.output)) {
	console.error(`\n✘ 构建完成但产物目录不存在：${preset.output}`);
	console.error("  检查 astro.config.mjs 里的适配器条件与 base 设置。");
	process.exit(1);
}

// GitHub Pages 会忽略下划线开头的目录（_astro），必须禁用 Jekyll
if (preset.static) {
	writeFileSync(join(preset.output, ".nojekyll"), "");
	console.log("\n✓ 已写入 .nojekyll（避免 GitHub Pages 忽略 _astro 目录）");
}

console.log(`\n✓ 完成：${name} → ${preset.output}`);
