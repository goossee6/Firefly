import { existsSync, readFileSync } from "node:fs";

/**
 * 构建产物根目录。
 *
 * 适配器默认启用（见 astro.config.mjs），Astro 把静态站点输出到 dist/client；
 * 设了 STATIC_BUILD=1 的纯静态构建才落在 dist。
 */
export function resolveSiteRoot(): string {
	return existsSync("dist/client") ? "dist/client" : "dist";
}

/**
 * Astro 的 base 配置（形如 "/blog/"）。
 *
 * 优先取构建时的 SITE_BASE 环境变量（与 astro.config.mjs 同一来源），
 * 否则从配置源码里读默认值 —— 不 import 配置文件是因为它会连带拉起整套构建环境。
 */
export function resolveBasePath(): string {
	const normalize = (value: string) => {
		const raw = (value || "/").trim();
		const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
		const withTrailing = withLeading.endsWith("/")
			? withLeading
			: `${withLeading}/`;
		return withTrailing.replace(/\/{2,}/g, "/");
	};

	if (process.env.SITE_BASE) return normalize(process.env.SITE_BASE);

	try {
		const source = readFileSync("astro.config.mjs", "utf-8");
		// astro.config.mjs 里的 `process.env.SITE_BASE || "<默认值>"`
		const envDefault = source.match(
			/process\.env\.SITE_BASE\s*\|\|\s*["']([^"']*)["']/,
		);
		if (envDefault) return normalize(envDefault[1]);
		// 兼容直接写字面量的写法
		const literal = source.match(/\bbase:\s*["']([^"']*)["']/);
		if (literal) return normalize(literal[1]);
	} catch {
		// 配置文件不存在时按根路径处理
	}
	return "/";
}

/** 归一化后的 base 段（无前后斜杠）；部署在根路径时返回空字符串 */
export function resolveBaseSegment(): string {
	return resolveBasePath().replace(/^\/+|\/+$/g, "");
}
