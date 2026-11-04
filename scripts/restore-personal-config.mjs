#!/usr/bin/env node
/**
 * 个人配置快照：把 src/config 里带个人值的文件存一份，同步上游后一键恢复。
 *
 * 背景：同步上游最常见的返工不是代码冲突，而是 `src/config/*.ts` 被上游默认值整体覆盖 ——
 * 站点标题、头像、Umami ID、Twikoo 地址、备案号全变回模板内容，而且构建不会报错。
 *
 * 用法：
 *   node scripts/restore-personal-config.mjs            # 用快照恢复（同步上游后跑）
 *   node scripts/restore-personal-config.mjs --check    # 只检查差异，不写文件
 *   node scripts/restore-personal-config.mjs --record   # 改了个人值后，重新生成快照
 *
 * 恢复时会对比「快照录制时上游该文件的 blob sha」与当前上游版本：
 * 若上游改过这个文件，会列出来提醒复查 —— 快照可能缺少上游新增的字段。
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const ROOT = process.cwd();
const SNAPSHOT_DIR = "scripts/personal";
const BASELINE_FILE = join(SNAPSHOT_DIR, "baseline.json");

/** 带个人值、会被上游整体覆盖的文件 */
const TARGETS = [
	"src/config/siteConfig.ts",
	"src/config/profileConfig.ts",
	"src/config/navBarConfig.ts",
	"src/config/analyticsConfig.ts",
	"src/config/commentConfig.ts",
	"src/config/sponsorConfig.ts",
	"src/config/pioConfig.ts",
	"src/config/FooterConfig.html",
];

const REFS = ["upstream/master", "origin/master", "HEAD"];
const MODE = process.argv.includes("--record") ? "record" : process.argv.includes("--check") ? "check" : "restore";

const snapshotPath = (target) => join(SNAPSHOT_DIR, `${basename(target)}.snapshot`);

/** 比较时忽略行尾差异：Windows 工作区是 CRLF、git 存储按 .gitattributes 归一化成 LF */
const normalizeEol = (text) => text.replace(/\r\n/g, "\n");

const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

/** 取某个 ref 下文件的 blob sha，用来判断上游是否动过这个文件 */
function upstreamBlobSha(target) {
	for (const ref of REFS) {
		const result = spawnSync("git", ["rev-parse", `${ref}:${target}`], { cwd: ROOT, encoding: "utf-8" });
		if (result.status === 0) return { ref, sha: result.stdout.trim() };
	}
	return null;
}

function readBaseline() {
	if (!existsSync(join(ROOT, BASELINE_FILE))) return { targets: {} };
	try {
		return JSON.parse(readFileSync(join(ROOT, BASELINE_FILE), "utf-8"));
	} catch {
		return { targets: {} };
	}
}

// ── record：从工作区当前内容生成快照 ────────────────────────────────────────
if (MODE === "record") {
	mkdirSync(join(ROOT, SNAPSHOT_DIR), { recursive: true });
	const baseline = { recordedAt: new Date().toISOString().slice(0, 10), targets: {} };

	for (const target of TARGETS) {
		const source = join(ROOT, target);
		if (!existsSync(source)) {
			console.log(`${YELLOW}!${RESET} ${target} ${DIM}不存在，跳过${RESET}`);
			continue;
		}
		writeFileSync(join(ROOT, snapshotPath(target)), readFileSync(source, "utf-8"), "utf-8");
		const upstream = upstreamBlobSha(target);
		baseline.targets[target] = { upstreamSha: upstream?.sha ?? null, ref: upstream?.ref ?? null };
		console.log(`${GREEN}✓${RESET} ${target} ${DIM}→ ${snapshotPath(target)}${RESET}`);
	}

	writeFileSync(join(ROOT, BASELINE_FILE), `${JSON.stringify(baseline, null, "\t")}\n`, "utf-8");
	console.log(`\n快照已更新（${Object.keys(baseline.targets).length} 个文件）`);
	process.exit(0);
}

// ── restore / check ────────────────────────────────────────────────────────
const baseline = readBaseline();
const restored = [];
const unchanged = [];
const upstreamChanged = [];
const missing = [];

for (const target of TARGETS) {
	const snap = join(ROOT, snapshotPath(target));
	if (!existsSync(snap)) {
		missing.push(target);
		continue;
	}

	const snapshotContent = readFileSync(snap, "utf-8");
	const currentPath = join(ROOT, target);
	const currentContent = existsSync(currentPath) ? readFileSync(currentPath, "utf-8") : null;

	if (normalizeEol(currentContent ?? "") === normalizeEol(snapshotContent)) {
		unchanged.push(target);
	} else {
		restored.push(target);
		if (MODE === "restore") writeFileSync(currentPath, snapshotContent, "utf-8");
	}

	const recordedSha = baseline.targets?.[target]?.upstreamSha;
	const upstream = upstreamBlobSha(target);
	if (recordedSha && upstream && upstream.sha !== recordedSha) {
		upstreamChanged.push({ target, ref: upstream.ref });
	}
}

const verb = MODE === "check" ? "需要恢复" : "已恢复";
console.log(`\n个人配置快照（${MODE === "check" ? "仅检查" : "写入"}）`);
if (restored.length) {
	console.log(`${GREEN}${verb}：${restored.length} 个${RESET}`);
	for (const target of restored) console.log(`  ${GREEN}•${RESET} ${target}`);
}
if (unchanged.length) console.log(`${DIM}未变化：${unchanged.length} 个${RESET}`);

if (upstreamChanged.length) {
	console.log(`\n${YELLOW}上游改动过这些文件，恢复后请复查是否缺了新字段：${RESET}`);
	for (const { target, ref } of upstreamChanged) {
		console.log(`  ${YELLOW}!${RESET} ${target} ${DIM}(对比：git diff ${ref} -- ${target})${RESET}`);
	}
}

if (missing.length) {
	console.log(`\n${RED}缺少快照，请先跑一次 --record：${RESET}`);
	for (const target of missing) console.log(`  ${RED}•${RESET} ${target} ${DIM}(期望 ${snapshotPath(target)})${RESET}`);
}

if (MODE === "check" && restored.length > 0) process.exit(1);
process.exit(missing.length > 0 ? 1 : 0);
