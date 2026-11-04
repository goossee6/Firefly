// 本地构建脚本：临时禁用字体 → 构建 → 恢复字体
import fs from "fs";
import { execSync } from "child_process";

const CONFIG = "src/config/fontConfig.ts";

// 读原始内容
const original = fs.readFileSync(CONFIG, "utf8");

// 禁用字体
if (original.includes("enable: true,")) {
	fs.writeFileSync(CONFIG, original.replace("enable: true,", "enable: false,"));
	console.log("Fonts disabled, starting build...");
} else {
	console.log("Fonts already disabled, starting build...");
}

try {
	execSync("pnpm build", { stdio: "inherit" });
} finally {
	// 确保无论如何都恢复字体
	const current = fs.readFileSync(CONFIG, "utf8");
	if (current.includes("enable: false,")) {
		fs.writeFileSync(
			CONFIG,
			current.replace("enable: false,", "enable: true,"),
		);
		console.log("Fonts re-enabled.");
	}
}
