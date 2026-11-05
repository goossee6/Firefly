#!/usr/bin/env node
// 多源延迟与可用性探测（境内视角）。
//
// 为什么不在 Worker 里测：Worker 的 fetch 从 Cloudflare 边缘发出，测到的是「CF 机房 → 源站」，
// 反映不了「本机网络 → 平台」的真实体验。判断「境内慢」必须从境内出口发请求。
//
// 记录的是完整时间线而不是单个总耗时，用来区分三类问题：
//   dns 大    → 解析慢 / 被污染，换 DNS 或换域名策略
//   tcp+tls 大 → 绕路或丢包，线路问题，和平台无关
//   ttfb 大    → 源站本身处理慢（静态站点通常是 CDN 未命中或回源）
//
// 用法：
//   node scripts/monitor-sources.mjs            # 探测一轮并追加记录
//   node scripts/monitor-sources.mjs --rounds 5 # 每个源测 5 次取中位数
//   node scripts/monitor-sources.mjs --report   # 只出报告，不发请求
//   node scripts/monitor-sources.mjs --report --days 7
//
// 数据落在 .monitor/YYYY-MM-DD.jsonl（已被 .gitignore 忽略），报告落在 .monitor/report.md。

import { lookup as dnsLookup } from "node:dns";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const ROOT = process.cwd();
const DIR = join(ROOT, ".monitor");
const CONFIG_PATH = join(ROOT, "monitor.config.json");
const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
	const i = argv.indexOf(`--${name}`);
	return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

// 默认按浏览器的方式协商压缩：真实访客拿到的是 gzip/br，用 identity 测出来的传输耗时会严重高估。
// 需要看「未压缩裸链路」时加 --identity。
const ACCEPT_ENCODING = flag("identity") ? "identity" : "gzip, deflate, br";

function loadConfig() {
	if (!existsSync(CONFIG_PATH)) {
		console.error(`找不到 ${CONFIG_PATH}`);
		process.exit(1);
	}
	const cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
	return {
		timeoutMs: Number(cfg.timeoutMs) || 10000,
		rounds: Number(value("rounds", cfg.rounds)) || 3,
		sources: (cfg.sources ?? []).filter(
			(s) =>
				s.enabled !== false &&
				typeof s.url === "string" &&
				s.url.startsWith("http"),
		),
	};
}

/**
 * 单次探测。返回各阶段**独立耗时**（不是累计到该时刻），便于直接看出瓶颈在哪一段。
 * 强制 agent:false，避免 keep-alive 复用连接导致 lookup/connect 事件不触发、时间线缺段。
 */
function probeOnce(url, timeoutMs, family = null) {
	return new Promise((resolve) => {
		const lib = url.startsWith("https:") ? httpsRequest : httpRequest;
		// 指定 family 时强制走 IPv4 / IPv6：部分线路两者差异能到十倍，必须分开看
		const lookup = family
			? (hostname, options, callback) =>
					dnsLookup(hostname, { ...options, family }, callback)
			: undefined;
		const t0 = performance.now();
		const at = {};
		const stamp = () => performance.now() - t0;
		let settled = false;

		// 把绝对时间点换算成逐段增量：dns → tcp → tls → ttfb → transfer
		const toDeltas = (extra) => {
			const connectAt = at.connect ?? null;
			const secureAt = at.secure ?? at.connect ?? null;
			const firstByteAt = at.firstByte ?? null;
			const endAt = at.end ?? null;
			return {
				dns: at.lookup == null ? null : Math.round(at.lookup),
				tcp:
					connectAt == null ? null : Math.round(connectAt - (at.lookup ?? 0)),
				tls:
					at.secure == null || connectAt == null
						? null
						: Math.round(at.secure - connectAt),
				ttfb:
					firstByteAt == null || secureAt == null
						? null
						: Math.round(firstByteAt - secureAt),
				transfer:
					endAt == null || firstByteAt == null
						? null
						: Math.round(endAt - firstByteAt),
				...extra,
			};
		};

		const done = (extra) => {
			if (settled) return;
			settled = true;
			resolve(toDeltas(extra));
		};

		let req;
		try {
			req = lib(
				url,
				{
					method: "GET",
					agent: false,
					lookup,
					headers: {
						"user-agent": UA,
						accept: "text/html,application/xhtml+xml",
						"accept-encoding": ACCEPT_ENCODING,
						"cache-control": "no-cache",
						connection: "close",
					},
					timeout: timeoutMs,
				},
				(res) => {
					at.firstByte = stamp();
					let bytes = 0;
					const encoding = res.headers["content-encoding"] ?? "identity";
					res.on("data", (chunk) => {
						bytes += chunk.length;
					});
					res.on("end", () => {
						at.end = stamp();
						done({
							ok: res.statusCode >= 200 && res.statusCode < 400,
							status: res.statusCode,
							bytes,
							encoding,
							family: normalizeFamily(res.socket?.remoteFamily) ?? family,
							total: Math.round(at.end),
						});
					});
					res.on("error", (err) => {
						at.end = stamp();
						done({
							ok: false,
							error: err.code || err.message,
							total: Math.round(at.end),
						});
					});
				},
			);
		} catch (err) {
			at.end = stamp();
			done({
				ok: false,
				error: err.code || err.message,
				total: Math.round(at.end),
			});
			return;
		}

		req.on("socket", (socket) => {
			socket.once("lookup", () => {
				at.lookup = stamp();
			});
			socket.once("connect", () => {
				at.connect = stamp();
			});
			socket.once("secureConnect", () => {
				at.secure = stamp();
			});
		});

		req.on("timeout", () =>
			req.destroy(Object.assign(new Error("timeout"), { code: "TIMEOUT" })),
		);
		req.on("error", (err) => {
			at.end = stamp();
			done({
				ok: false,
				error: err.code || err.message,
				total: Math.round(at.end),
			});
		});
		req.end();
	});
}

const median = (nums) => {
	const arr = nums.filter((n) => typeof n === "number").sort((a, b) => a - b);
	if (!arr.length) return null;
	return arr[Math.floor(arr.length / 2)];
};

// socket.remoteFamily 返回的是 "IPv4" / "IPv6" 字符串，统一成 4 / 6
const normalizeFamily = (v) => {
	if (v === 4 || v === 6) return v;
	if (typeof v === "string") {
		const m = v.match(/[46]/);
		return m ? Number(m[0]) : null;
	}
	return null;
};

async function probeSource(source, { timeoutMs, rounds }) {
	// families 为空时按系统默认解析（自动选 v4/v6），指定后分别强制测试
	const families =
		Array.isArray(source.families) && source.families.length
			? source.families
			: [null];
	const out = [];

	for (const family of families) {
		const attempts = [];
		for (let i = 0; i < rounds; i++) {
			attempts.push(await probeOnce(source.url, timeoutMs, family));
			// 单源内部留一点间隔，避免连续请求把瞬时抖动当成稳定值
			if (i < rounds - 1) await new Promise((r) => setTimeout(r, 300));
		}

		const successes = attempts.filter((a) => a.ok);
		const sample = successes.length
			? successes
			: [attempts[attempts.length - 1]];
		const bytes = median(sample.map((a) => a.bytes));
		const transfer = median(sample.map((a) => a.transfer));

		out.push({
			ts: new Date().toISOString(),
			source: source.name,
			label: source.label ?? source.name,
			url: source.url,
			family: family ?? sample[sample.length - 1].family ?? null,
			ok: successes.length > 0,
			successRate: Number((successes.length / attempts.length).toFixed(2)),
			status: sample[sample.length - 1].status ?? null,
			error: successes.length
				? null
				: (attempts.find((a) => a.error)?.error ?? null),
			dns: median(sample.map((a) => a.dns)),
			tcp: median(sample.map((a) => a.tcp)),
			tls: median(sample.map((a) => a.tls)),
			ttfb: median(sample.map((a) => a.ttfb)),
			transfer,
			total: median(sample.map((a) => a.total)),
			bytes,
			encoding: sample[sample.length - 1].encoding ?? "identity",
			// 有效吞吐（KB/s）。跨境链路被限速时这个值会低到几十 KB/s，比总耗时更直观
			kbps:
				bytes && transfer ? Math.round(bytes / 1024 / (transfer / 1000)) : null,
		});
	}

	return out;
}

function ensureDir() {
	if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function localDate(d = new Date()) {
	const pad = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function appendRecords(records) {
	ensureDir();
	const file = join(DIR, `${localDate()}.jsonl`);
	appendFileSync(
		file,
		`${records.map((r) => JSON.stringify(r)).join("\n")}\n`,
		"utf-8",
	);
	return file;
}

function readRecords(days) {
	if (!existsSync(DIR)) return [];
	const cutoff = Date.now() - days * 86400_000;
	const rows = [];
	for (const name of readdirSync(DIR)
		.filter((n) => n.endsWith(".jsonl"))
		.sort()) {
		for (const line of readFileSync(join(DIR, name), "utf-8").split("\n")) {
			if (!line.trim()) continue;
			try {
				const row = JSON.parse(line);
				if (new Date(row.ts).getTime() >= cutoff) rows.push(row);
			} catch {
				// 半行写入（进程被中断）忽略
			}
		}
	}
	return rows;
}

function buildReport(rows, days) {
	const bySource = new Map();
	for (const row of rows) {
		const key = `${row.source}|${row.family ?? "auto"}`;
		if (!bySource.has(key)) bySource.set(key, []);
		bySource.get(key).push(row);
	}

	const lines = [];
	lines.push("# 多源延迟监测报告");
	lines.push("");
	lines.push(`统计范围：最近 ${days} 天，共 ${rows.length} 条记录。`);
	lines.push("");
	lines.push(
		"| 源 | 协议 | 样本 | 成功率 | DNS | TCP | TLS | TTFB | 传输 | 总耗时 | 速率 |",
	);
	lines.push("|---|---|---|---|---|---|---|---|---|---|---|");

	for (const [key, list] of bySource) {
		const okList = list.filter((r) => r.ok);
		const successRate = ((okList.length / list.length) * 100).toFixed(0);
		const fmt = (k, unit = "ms") => {
			const v = median(okList.map((r) => r[k]));
			return v == null ? "—" : `${v}${unit}`;
		};
		const family = list[0].family ? `IPv${list[0].family}` : "auto";
		lines.push(
			`| ${list[0].label ?? key} | ${family} | ${list.length} | ${successRate}% | ${fmt("dns")} | ${fmt("tcp")} | ${fmt("tls")} | ${fmt("ttfb")} | ${fmt("transfer")} | ${fmt("total")} | ${fmt("kbps", "KB/s")} |`,
		);
	}

	const failures = rows.filter((r) => !r.ok);
	if (failures.length) {
		lines.push("");
		lines.push("## 失败记录");
		lines.push("");
		for (const f of failures.slice(-20)) {
			lines.push(
				`- ${f.ts} · ${f.label ?? f.source} · ${f.error ?? "unknown"}${f.status ? ` (HTTP ${f.status})` : ""}`,
			);
		}
	}

	lines.push("");
	lines.push("## 怎么读");
	lines.push("");
	lines.push("各列是**独立耗时**，不是累计值，可以相加还原总耗时。");
	lines.push("");
	lines.push("- `DNS` 偏大：解析慢或被污染，换 DNS / 换解析服务商比换平台有效");
	lines.push(
		"- `TCP`+`TLS` 偏大而 `TTFB` 正常：链路绕路或丢包，属于线路问题，换平台无效",
	);
	lines.push(
		"- `TTFB` 偏大而前面几段正常：源站处理慢或 CDN 未命中，这才是平台本身的差异",
	);
	lines.push(
		"- `传输` 占比大：带宽受限（跨境链路常见），和 HTML 体积相关，压缩能改善",
	);
	lines.push(
		"- 同一时段内所有源的 `DNS` 都大：问题在本地网络或运营商，不在平台",
	);

	return lines.join("\n");
}

async function main() {
	if (flag("report")) {
		const days = Number(value("days", 7)) || 7;
		const rows = readRecords(days);
		if (!rows.length) {
			console.log("还没有监测记录，先跑一次 node scripts/monitor-sources.mjs");
			return;
		}
		const report = buildReport(rows, days);
		ensureDir();
		writeFileSync(join(DIR, "report.md"), `${report}\n`, "utf-8");
		console.log(report);
		console.log(`\n已写入 ${join(DIR, "report.md")}`);
		return;
	}

	const config = loadConfig();
	if (!config.sources.length) {
		console.error("monitor.config.json 里没有可用的源，请先填 url");
		process.exit(1);
	}

	const skipped = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")).sources.filter(
		(s) => s.enabled === false || !s.url || !s.url.startsWith("http"),
	);
	if (skipped.length) {
		console.log(
			`跳过未配置的源：${skipped.map((s) => s.label ?? s.name).join("、")}\n`,
		);
	}

	const records = (
		await Promise.all(config.sources.map((s) => probeSource(s, config)))
	).flat();

	for (const r of records) {
		const tag = r.family ? ` (IPv${r.family})` : "";
		const head = `${r.ok ? "✓" : "✗"} ${r.label}${tag}`.padEnd(32);
		if (r.ok) {
			console.log(
				`${head} dns=${r.dns ?? "—"}ms tcp=${r.tcp ?? "—"}ms tls=${r.tls ?? "—"}ms ttfb=${r.ttfb ?? "—"}ms 传输=${r.transfer ?? "—"}ms 总=${r.total ?? "—"}ms 速率=${r.kbps ?? "—"}KB/s`,
			);
		} else {
			console.log(
				`${head} 失败：${r.error ?? "unknown"}${r.status ? ` (HTTP ${r.status})` : ""}`,
			);
		}
	}

	const file = appendRecords(records);
	console.log(`\n已记录到 ${file}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
