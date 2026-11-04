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
 * 这里直接从 astro.config.mjs 的源码里取字面量，而不是 import 它 —— 配置文件依赖
 * Astro 的 ESM 解析和一堆插件，脚本内部 require 会连带拉起整套构建环境。
 * 配置里只有一个 `base: "..."` 字面量，正则取第一个即可。
 */
export function resolveBasePath(): string {
	try {
		const source = readFileSync("astro.config.mjs", "utf-8");
		const matched = source.match(/\bbase:\s*["']([^"']*)["']/);
		if (matched) return matched[1] || "/";
	} catch {
		// 配置文件不存在时按根路径处理
	}
	return "/";
}

/** 归一化后的 base 段（无前后斜杠）；部署在根路径时返回空字符串 */
export function resolveBaseSegment(): string {
	return resolveBasePath().replace(/^\/+|\/+$/g, "");
}
