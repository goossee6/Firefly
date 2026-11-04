import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 子路径部署（base = "/blog/"）时的产物整理。
 *
 * 做三件事：
 * 1. 在产物根写一个跳转页，让 `/` 跳到 `/blog/`
 * 2. 清理 @astrojs/cloudflare 产物里 wrangler.json 已不支持的 legacy_env 字段
 * 3. 把 /blog/xxx/ 下的文章别名页（Astro.redirect 产物）镜像到产物根，让 /xxx/ 也能用
 *
 * ⚠️ 关键陷阱：Astro 7 的 `astro:build:done` 传入的 `dir` **已经拼好了 base**
 * （实测 `...\dist\client\blog\\`，末尾还带两个反斜杠）。直接当产物根用会导致：
 * - 跳转页写进 `dist/client/blog/index.html`，首页被覆盖成跳转到自己 → 死循环
 * - 别名镜像去 `dist/client/blog/blog` 找源目录，静默失败
 * - wrangler.json 清理路径错一级，被 catch 吞掉
 * 这三处都不会让构建失败（exit 0），只能靠检查产物发现。所以这里先归一化分隔符再剥 base。
 *
 * @param {{ title?: string }} options
 * @returns {import("astro").AstroIntegration}
 */
export function rootRedirect({ title = "Blog" } = {}) {
	/** @type {string} astro:config:done 阶段留存的 base，用于校正 build:done 的 dir */
	let baseSegment = "";

	return {
		name: "root-redirect",
		hooks: {
			"astro:config:done": ({ config }) => {
				baseSegment = (config.base ?? "/").replace(/^\/+|\/+$/g, "");
			},

			"astro:build:done": ({ dir }) => {
				const normalizedDir = fileURLToPath(dir).replace(/[\\/]+$/, "");

				let rootDir = normalizedDir;
				if (baseSegment && (rootDir.endsWith(`/${baseSegment}`) || rootDir.endsWith(`\\${baseSegment}`))) {
					rootDir = rootDir.slice(0, -(baseSegment.length + 1)) || rootDir;
				}

				// 站点本体所在目录（= 产物根 + base）；base 为空时二者相同
				const siteDir = baseSegment ? join(rootDir, baseSegment) : rootDir;
				const hasRootLayer = siteDir !== rootDir;

				// 站点直接部署在根路径，或页面尚未生成时不做任何处理，否则会覆盖首页
				if (!hasRootLayer || !existsSync(join(siteDir, "index.html"))) {
					console.log("[root-redirect] 跳过：未检测到 base 子目录或首页", {
						dir: normalizedDir,
						base: baseSegment || "/",
						siteDir,
					});
					return;
				}

				// 1. 产物根跳转页：/ -> /blog/
				const target = `/${baseSegment}/`;
				const rootIndex = join(rootDir, "index.html");
				writeFileSync(
					rootIndex,
					`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta http-equiv="refresh" content="0;url=${target}" />
  <script>window.location.replace(${JSON.stringify(target)});</script>
</head>
<body>
  <p>正在跳转... <a href="${target}">点击进入 ${title}</a></p>
</body>
</html>`,
					"utf-8",
				);
				console.log("✓ Root redirect: written to", rootIndex);

				// 2. 清理 wrangler.json 的 legacy_env（仅 Cloudflare 产物存在）
				const wranglerPath = join(rootDir, "..", "server", "wrangler.json");
				try {
					const raw = readFileSync(wranglerPath, "utf-8");
					if (raw.includes("legacy_env")) {
						const cleaned = raw.replace(/"legacy_env":(true|false),?\s*/, "");
						writeFileSync(wranglerPath, cleaned, "utf-8");
						console.log("✓ Removed legacy_env from wrangler.json");
					}
				} catch {
					// 非 Cloudflare 构建，无 wrangler.json，跳过
				}

				// 3. 文章别名页镜像到产物根：/blog/yuanshen/ -> /yuanshen/
				let mirrored = 0;
				for (const entry of readdirSync(siteDir, { withFileTypes: true })) {
					if (!entry.isDirectory() || entry.name === baseSegment) continue;
					const source = join(siteDir, entry.name, "index.html");
					if (!existsSync(source)) continue;
					const content = readFileSync(source, "utf-8");
					// 只镜像 Astro.redirect 生成的跳转页
					if (!content.includes("Redirecting")) continue;

					const destDir = join(rootDir, entry.name);
					const dest = join(destDir, "index.html");
					// 根目录已有同名真实页面时不覆盖
					if (existsSync(dest) && !readFileSync(dest, "utf-8").includes("Redirecting")) continue;

					mkdirSync(destDir, { recursive: true });
					writeFileSync(dest, content, "utf-8");
					mirrored++;
				}
				if (mirrored > 0) console.log(`✓ Root alias mirror: ${mirrored} 个别名页`);
			},
		},
	};
}
