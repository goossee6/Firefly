import { glob } from "glob";
import fs from "fs/promises";
import path from "path";
import readline from "readline";

const POSTS_DIR = "src/content/posts";
const IMAGE_DIRS = ["src/content/posts/images", "src/content/public/assets"];

// 从 markdown 中提取所有图片引用路径（正文 + frontmatter）
function extractImageRefs(content: string, filePath: string): Set<string> {
	const refs = new Set<string>();
	const mdDir = path.dirname(filePath);

	const addPath = (imgPath: string) => {
		if (imgPath.startsWith("/")) {
			// 绝对路径 /images/xxx → public/images/xxx
			refs.add(path.resolve("public", imgPath.slice(1)));
		} else if (imgPath.startsWith("./") || imgPath.startsWith("../")) {
			// 相对路径 → 相对于 .md 文件目录
			refs.add(path.resolve(mdDir, imgPath));
		}
	};

	// 1. frontmatter 中的 image 字段（文章封面图）
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
	if (fmMatch) {
		const fmImgMatch = fmMatch[1].match(/^image:\s*(.+)$/m);
		if (fmImgMatch) {
			const val = fmImgMatch[1].trim().replace(/^["']|["']$/g, "");
			if (val && !val.startsWith("http") && !val.startsWith("data:")) {
				addPath(val);
			}
		}
	}

	// 2. 正文中的 ![](path) 和 ![](path "title")
	const mdImgRegex = /!\[.*?\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g;
	let match: RegExpExecArray | null;
	while ((match = mdImgRegex.exec(content)) !== null) {
		const imgPath = match[1];
		if (!imgPath.startsWith("http") && !imgPath.startsWith("data:")) {
			addPath(imgPath);
		}
	}

	return refs;
}

async function main() {
	// 1. 收集所有 markdown 文件中的图片引用
	const mdFiles = await glob(`${POSTS_DIR}/**/*.{md,mdx}`);
	const referencedPaths = new Set<string>();

	for (const mdFile of mdFiles) {
		const content = await fs.readFile(mdFile, "utf-8");
		const refs = extractImageRefs(content, mdFile);
		for (const ref of refs) {
			referencedPaths.add(ref);
		}
	}

	console.log(`Scanning ${mdFiles.length} markdown files...`);
	console.log(`Found ${referencedPaths.size} unique image references.\n`);

	// 2. 扫描图片目录中的所有文件
	const allImageFiles = await glob(
		IMAGE_DIRS.map((d) => `${d}/**/*.{png,jpg,jpeg,webp,avif,gif,svg}`),
	);

	// 3. 找出未被引用的图片
	const orphanFiles: string[] = [];
	for (const file of allImageFiles) {
		const absPath = path.resolve(file);
		if (!referencedPaths.has(absPath)) {
			orphanFiles.push(file);
		}
	}

	if (orphanFiles.length === 0) {
		console.log("No orphan images found. Clean! ✨");
		return;
	}

	console.log(`Found ${orphanFiles.length} orphan image(s):\n`);
	for (const file of orphanFiles.sort()) {
		console.log(`  ${file}`);
	}

	console.log("\n---");
	console.log(`To delete them, run: pnpm find-orphan-images --delete`);

	// 4. 可选：删除（需确认）
	if (process.argv.includes("--delete")) {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});
		const answer = await new Promise<string>((resolve) =>
			rl.question(`确定删除以上 ${orphanFiles.length} 个文件？(y/N) `, resolve),
		);
		rl.close();
		if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
			console.log("已取消删除。");
			return;
		}
		for (const file of orphanFiles) {
			await fs.unlink(file);
			console.log(`Deleted: ${file}`);
		}
		console.log(`\nDeleted ${orphanFiles.length} file(s).`);
	}
}

main().catch(console.error);
