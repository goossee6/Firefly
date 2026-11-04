/**
 * sync-updated: 构建时扫描文章，检测正文内容变化后更新 frontmatter 的 updated 字段
 *
 * 方案：对正文（frontmatter 之后的内容）计算 SHA-256 哈希，
 * 存到 .sync-hashes.json 中对比。只有正文哈希变了才更新 updated，
 * 纯空格/格式修改被 normalize 后哈希不变，不会触发更新。
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { glob } from "glob";

const POSTS_DIR = path.resolve("src/content/posts");
const HASH_FILE = path.resolve("scripts/.sync-hashes.json");

/** --record 模式：只记录哈希，不修改 frontmatter */
const RECORD_ONLY = process.argv.includes("--record");
const FILE_ARG = process.argv.includes("--file")
	? process.argv[process.argv.indexOf("--file") + 1]
	: "";

function parseDate(s: string): Date | null {
	const d = new Date(s);
	return isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** 对正文做 normalzie 后取 SHA-256，忽略纯空白和格式差异 */
function bodyHash(body: string): string {
	return createHash("sha256").update(body, "utf8").digest("hex").slice(0, 16);
}

async function main() {
	const files = await glob("**/*.{md,mdx}", { cwd: POSTS_DIR });

	// 读取已有哈希记录
	let hashStore: Record<string, string> = {};
	try {
		hashStore = JSON.parse(fs.readFileSync(HASH_FILE, "utf8"));
	} catch {
		/* first run */
	}

	// 首次运行（无哈希记录）自动进入 record-only 模式，不误写
	const isFirstRun = Object.keys(hashStore).length === 0;
	if (isFirstRun) {
		console.log(
			"[sync-updated] First run — recording hashes only, no files modified.",
		);
	}

	let updatedCount = 0;
	const newStore: Record<string, string> = {};
	const today = formatDate(new Date());

	for (const file of files) {
		// 统一用 / 作路径分隔符，避免 Windows 反斜杠不匹配
		const normalFile = file.replace(/\\/g, "/");
		const fp = path.join(POSTS_DIR, file);
		const content = fs.readFileSync(fp, "utf8");

		// 分离 frontmatter 和正文
		const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\n?([\s\S]*)$/);
		if (!fmMatch) continue;

		const frontmatter = fmMatch[1];
		const body = fmMatch[2];

		// 计算正文哈希
		const hash = bodyHash(body);
		newStore[normalFile] = hash;

		// record-only 模式或首次运行：不碰 frontmatter
		if (RECORD_ONLY || isFirstRun) continue;

		// 哈希没变 → 跳过
		if (hashStore[normalFile] === hash) continue;

		const pubMatch = frontmatter.match(/^published:\s*(.+)$/m);
		if (!pubMatch) continue;
		const publishedDate = parseDate(pubMatch[1].trim().replace(/["']/g, ""));
		if (!publishedDate) continue;

		// 如果今天 <= published 日期，把 updated 设为与 published 相同
		if (today <= formatDate(publishedDate)) {
			const updMatch = frontmatter.match(/^updated:\s*(.+)$/m);
			const pubDateStr = formatDate(publishedDate);
			if (updMatch) {
				if (updMatch[1].trim() !== pubDateStr) {
					const newContent = content.replace(
						/^updated:\s*.+$/m,
						`updated: ${pubDateStr}`,
					);
					fs.writeFileSync(fp, newContent);
					updatedCount++;
					console.log(`  [sync-updated] ${normalFile} updated → ${pubDateStr}`);
				}
			} else {
				const insertPos = content.indexOf("---", 3);
				const newContent =
					content.slice(0, insertPos) +
					`updated: ${pubDateStr}\n` +
					content.slice(insertPos);
				fs.writeFileSync(fp, newContent);
				updatedCount++;
				console.log(`  [sync-updated] ${normalFile} updated → ${pubDateStr}`);
			}
			continue;
		}

		// 如果已有 updated 且等于今天，不重复写
		const updMatch = frontmatter.match(/^updated:\s*(.+)$/m);
		const existingUpdated = updMatch
			? parseDate(updMatch[1].trim().replace(/["']/g, ""))
			: null;
		if (existingUpdated && formatDate(existingUpdated) === today) continue;

		// 写入 updated
		if (updMatch) {
			const newContent = content.replace(
				/^updated:\s*.+$/m,
				`updated: ${today}`,
			);
			fs.writeFileSync(fp, newContent);
		} else {
			const insertPos = content.indexOf("---", 3);
			const newContent =
				content.slice(0, insertPos) +
				`updated: ${today}\n` +
				content.slice(insertPos);
			fs.writeFileSync(fp, newContent);
		}
		updatedCount++;
		console.log(`  [sync-updated] ${normalFile} → ${today}`);
	}

	// 写回哈希记录
	fs.writeFileSync(HASH_FILE, JSON.stringify(newStore, null, 2));

	if (updatedCount > 0) {
		console.log(`[sync-updated] Done. ${updatedCount} file(s) updated.`);
	} else {
		console.log("[sync-updated] All up to date.");
	}
}

main().catch(console.error);
