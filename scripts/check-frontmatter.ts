import fs from "fs";
import { glob } from "glob";
import path from "path";

interface Issue {
	file: string;
	field: string;
	issue: string;
	suggestion: string;
}

async function main() {
	const files = await glob("src/content/posts/**/*.{md,mdx}");
	const issues: Issue[] = [];

	for (const file of files.sort()) {
		const content = fs.readFileSync(file, "utf8");
		const fm = content.match(/^---\n([\s\S]*?)\n---/);
		if (!fm) {
			issues.push({
				file,
				field: "frontmatter",
				issue: "缺少 frontmatter",
				suggestion: "添加 frontmatter",
			});
			continue;
		}
		const raw = fm[1];
		const rel = path.relative("src/content/posts", file).replace(/\\/g, "/");

		// --- 逐字段检查 ---

		// title: 不能为空
		const titleMatch = raw.match(/^title:\s*(.*)$/m);
		if (!titleMatch || !titleMatch[1] || titleMatch[1].trim() === "") {
			issues.push({
				file: rel,
				field: "title",
				issue: "为空",
				suggestion: "填写标题",
			});
		}

		// published: 必须有日期
		const pubMatch = raw.match(/^published:\s*(.*)$/m);
		if (!pubMatch || !pubMatch[1]) {
			issues.push({
				file: rel,
				field: "published",
				issue: "缺失",
				suggestion: "添加日期 YYYY-MM-DD",
			});
		}

		// uid: 是否缺失
		const uidMatch = raw.match(/^uid:\s*(.*)$/m);
		if (!uidMatch || !uidMatch[1]) {
			issues.push({
				file: rel,
				field: "uid",
				issue: "缺失",
				suggestion: "将自动由 backfill-uid 补上",
			});
		} else if (
			!uidMatch[1].startsWith('"') &&
			!uidMatch[1].startsWith("'") &&
			!isNaN(Number(uidMatch[1]))
		) {
			// uid 是纯数字但没引号
			issues.push({
				file: rel,
				field: "uid",
				issue: "uid 是数字类型，需要加引号",
				suggestion: `uid: ${uidMatch[1].trim()}`,
			});
		}

		// tags: 空数组 = OK, 非数组 = 有问题
		const tagsMatch = raw.match(/^tags:\s*(.*)$/m);
		if (!tagsMatch) {
			issues.push({
				file: rel,
				field: "tags",
				issue: "缺失",
				suggestion: "添加 tags: []",
			});
		}

		// category: 空 = OK, 但 null 可能导致问题
		const catMatch = raw.match(/^category:\s*(.*)$/m);
		if (catMatch && (catMatch[1] === "null" || catMatch[1] === "~")) {
			issues.push({
				file: rel,
				field: "category",
				issue: "值为 null",
				suggestion: "改为空字符串或具体分类",
			});
		}

		// draft: 必须是布尔值
		const draftMatch = raw.match(/^draft:\s*(.*)$/m);
		if (draftMatch && !["true", "false", ""].includes(draftMatch[1].trim())) {
			issues.push({
				file: rel,
				field: "draft",
				issue: `值为 "${draftMatch[1].trim()}"，应为 true/false`,
				suggestion: "改为 true 或 false",
			});
		}

		// pinned: 必须是布尔值
		const pinnedMatch = raw.match(/^pinned:\s*(.*)$/m);
		if (pinnedMatch && !["true", "false", ""].includes(pinnedMatch[1].trim())) {
			issues.push({
				file: rel,
				field: "pinned",
				issue: `值为 "${pinnedMatch[1].trim()}"，应为 true/false`,
				suggestion: "改为 true 或 false",
			});
		}

		// alias: 空行没问题，null 可能有问题
		const aliasMatch = raw.match(/^alias:\s*(.*)$/m);
		if (aliasMatch && (aliasMatch[1] === "null" || aliasMatch[1] === "~")) {
			issues.push({
				file: rel,
				field: "alias",
				issue: "值为 null",
				suggestion: "留空即可",
			});
		}

		// password: 空 = 正常
		const pwdMatch = raw.match(/^password:\s*(.*)$/m);
		if (
			pwdMatch &&
			pwdMatch[1].trim() !== "" &&
			pwdMatch[1].trim() !== '""' &&
			pwdMatch[1].trim() !== "''"
		) {
			// 有密码，没问题，只是提醒
		}
	}

	// --- 输出 ---
	if (issues.length === 0) {
		console.log("✅ 所有文章 frontmatter 检查通过，没有问题。");
		return;
	}

	console.log(`📋 共发现 ${issues.length} 个问题：\n`);
	for (const iss of issues) {
		console.log(`  [${iss.field}] ${iss.file}`);
		console.log(`      问题: ${iss.issue}`);
		console.log(`      建议: ${iss.suggestion}`);
		console.log();
	}
}

main().catch(console.error);
