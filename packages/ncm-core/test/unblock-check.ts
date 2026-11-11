/**
 * 解锁源池健康巡检 + 30s 试听检测。
 * 每源取链后 HEAD 探 content-length：试听片段(~30s)体积远小于完整曲，
 * 标 ⚠试听 供定位"返回 30s 试听而非完整解锁"的源。直跑：npx tsx test/unblock-check.ts
 */
import { UNBLOCK_SOURCES } from "../src/sources/unblock";
import { fetchWithTimeout } from "../src/utils";

const IDS = [1973593792, 2029099185, 2624495087, 31010776, 1426940269, 2059421216];
/** 1.5MB——30s 试听(128k≈480KB/320k≈1.2MB)以下判为疑似试听；完整曲通常 >2MB */
const TRIAL_MAX = 1_500_000;
const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`);
const fmtKB = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}MB` : `${Math.round(n / 1024)}KB`);
const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);

interface Cell {
  name: string;
  ok: boolean;
  ms: number;
  url?: string;
  len?: number | null;
  err?: string;
}

async function probeLen(url: string): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(url, { method: "HEAD" }, 8000);
    const cl = res.headers.get("content-length");
    return cl ? parseInt(cl, 10) : null;
  } catch {
    return null;
  }
}

async function timeOne(fn: (id: number | string) => Promise<string | null>, id: number): Promise<Cell> {
  const t0 = Date.now();
  try {
    const url = await fn(id);
    if (!url) return { name: "", ok: false, ms: Date.now() - t0, err: "null" };
    const len = await probeLen(url);
    return { name: "", ok: true, ms: Date.now() - t0, url, len };
  } catch (e) {
    return { name: "", ok: false, ms: Date.now() - t0, err: (e as Error)?.message ?? String(e) };
  }
}

const isTrial = (c: Cell) => c.ok && c.len != null && c.len < TRIAL_MAX;

async function main(): Promise<void> {
  console.log(`\n🔍 解锁源池巡检 + 试听检测（${IDS.length} 首 × ${UNBLOCK_SOURCES.length} 源；⚠试听=体积<${fmtKB(TRIAL_MAX)}）\n`);
  const hits: Record<string, number> = {};
  const trials: Record<string, number> = {};
  for (const s of UNBLOCK_SOURCES) { hits[s.name] = 0; trials[s.name] = 0; }
  let matchHit = 0;

  for (const id of IDS) {
    const cells = await Promise.all(
      UNBLOCK_SOURCES.map(async (s) => {
        const c = await timeOne(s.fetch, id);
        c.name = s.name;
        if (c.ok) {
          hits[s.name]++;
          if (isTrial(c)) trials[s.name]++;
        }
        return c;
      }),
    );
    const anyFull = cells.some((c) => c.ok && !isTrial(c));
    if (anyFull) matchHit++;
    const winner = cells.find((c) => c.ok && !isTrial(c));
    console.log(`#${id}  ${anyFull ? "🔓 有完整源" : "🚫 仅试听/全空"}`);
    for (const c of cells) {
      const tag = c.ok ? (isTrial(c) ? "⚠试听" : "✅") : "❌";
      const tail = c.ok
        ? (c.len != null ? fmtKB(c.len) : "?len") + "  " + (c.url!.slice(0, 36) + "…")
        : (c.err ?? "").slice(0, 40);
      console.log(`  ${tag} ${pad(c.name, 12)} ${pad(fmtMs(c.ms), 9)} ${tail}`);
    }
    console.log(winner ? `  🏁 完整首中：${winner.name} (${fmtMs(winner.ms)})\n` : "\n");
  }

  console.log("📊 每源：命中 / 试听 / 完整");
  let alive = 0;
  for (const s of UNBLOCK_SOURCES) {
    const h = hits[s.name], t = trials[s.name];
    console.log(`  ${pad(s.name, 12)} 命中 ${h}/${IDS.length}  试听 ${t}  完整 ${h - t}`);
    if (h - t > 0) alive++;
  }
  console.log(`\n  聚合(完整) matchUnblock：${matchHit}/${IDS.length}\n  完整源：${alive}/${UNBLOCK_SOURCES.length}\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
