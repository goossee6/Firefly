// 统一 frontmatter 格式：空字段 → ""，布尔值确保 true/false，uid 加引号
import fs from "fs";
import { glob } from "glob";

const FIELDS_TO_QUOTE = [
	"image",
	"description",
	"lang",
	"author",
	"sourceLink",
	"licenseName",
	"licenseUrl",
	"password",
	"passwordHint",
	"category",
	"alias",
];

async function main() {
	const files = await glob("src/content/posts/**/*.{md,mdx}");
	let fixed = 0;

	for (const file of files) {
		let content = fs.readFileSync(file, "utf8");
		const fm = content.match(/^---\n([\s\S]*?)\n---/);
		if (!fm) continue;

		let raw = fm[1];
		let changed = false;

		for (const field of FIELDS_TO_QUOTE) {
			// field: (空或null) → field: ""
			const regex = new RegExp(`^${field}:\\s*(null|~)?\\s*$`, "m");
			if (regex.test(raw)) {
				raw = raw.replace(regex, `${field}: ""`);
				changed = true;
			}
		}

		// uid 纯数字没引号 → 加引号（YAML 会把纯数字解析为 number）
		const uidLine = raw.match(/^uid:\s*(\d+)\s*$/m);
		if (uidLine) {
			raw = raw.replace(/^uid:\s*\d+\s*$/m, `uid: "${uidLine[1]}"`);
			changed = true;
		}

		if (changed) {
			content = content.replace(fm[1], raw);
			fs.writeFileSync(file, content, "utf8");
			fixed++;
		}
	}

	console.log(`Fixed ${fixed} file(s)`);
}

main().catch(console.error);
