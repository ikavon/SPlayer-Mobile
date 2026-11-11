/**
 * 公益解锁源池 —— 移植自本地 NCM 源部署包（ComputerCraft/NCM本地源）
 * unblockmusic-utils 的 matchID 并行竞速逻辑。
 *
 * NCM 官方拿不到链接（VIP/锁区）时，向多个公益解锁源并行要一条 NCM CDN
 * 替代链接，任一成功即返回；每源 8s 超时，全失败返回 null。
 * 实测（2026-08-20）：byfuns / msls / gd 对 VIP 曲返回完整链接；baka 返回 30s 试听(470KB)
 * 已下线。matchUnblock 对每源结果 HEAD 探体积，<1.5MB(试听片段)丢弃继续竞速，
 * 防止"返回试听"的源抢赢导致只播 30s。公益源随时会变，用 test:unblock 一键巡检(含试听检测)。
 *
 * RN 适配：
 * - byfuns 直接返回纯文本 url，最省事；
 * - msls 是 302 跳转——RN fetch(XHR) 无法 manual-redirect，
 *   改用 HEAD 让 XHR 跟随跳转后读 response.url（HEAD 无 body，不会把音频下载下来）；
 * - 返回的 http:// 链接统一转 https://（Android 默认禁明文流量）；
 * - 每源结果 HEAD 探 content-length，<1.5MB 视为 30s 试听丢弃（防试听源抢赢）。
 */
import { fetchWithTimeout } from "../utils";
import { getGdUrl } from "./gd";

const TIMEOUT_MS = 8000;

const toHttps = (u: string): string => u.replace(/^http:\/\//, "https://");

/** byfuns：GET 返回纯文本 url（实测 VIP 曲稳定） */
const byfuns = async (id: number | string, signal?: AbortSignal): Promise<string | null> => {
  const res = await fetchWithTimeout(
    `https://api.byfuns.top/1/?id=${id}&level=exhigh`,
    { method: "GET" },
    TIMEOUT_MS,
    signal,
  );
  // 若被 302 直送 CDN（XHR 已跟随），response.url 即音频地址
  if (res.url && /music\.126\.net/.test(res.url)) return toHttps(res.url);
  if (res.status >= 400) return null;
  const text = (await res.text()).trim();
  if (text.startsWith("http")) return toHttps(text);
  try {
    const j = JSON.parse(text) as { url?: string };
    if (j?.url) return toHttps(j.url);
  } catch {
    /* 非 JSON 响应：忽略 */
  }
  return null;
};

/** msls：302 跳转 CDN，用 HEAD 跟随跳转取最终 url（无 body 下载） */
const msls = async (id: number | string, signal?: AbortSignal): Promise<string | null> => {
  const req = `https://api.msls1441.com/?type=url&id=${id}`;
  const res = await fetchWithTimeout(req, { method: "HEAD" }, TIMEOUT_MS, signal);
  if (res.url && res.url !== req && !res.url.includes("msls1441") && /^https?:\/\//.test(res.url)) {
    return toHttps(res.url);
  }
  return null;
};

/** 30s 试听体积上限：完整曲通常 >2MB；试听片段(128k≈480KB/320k≈1.2MB)以下判为试听并丢弃 */
const TRIAL_MAX = 1_500_000;

/** HEAD 取 content-length；失败/无头返回 null（调用方按"未知=放行"处理） */
const probeLen = async (url: string, signal?: AbortSignal): Promise<number | null> => {
  try {
    const res = await fetchWithTimeout(url, { method: "HEAD" }, TIMEOUT_MS, signal);
    const cl = res.headers.get("content-length");
    return cl ? parseInt(cl, 10) : null;
  } catch {
    return null;
  }
};

/** 校验非 30s 试听：体积小于阈值的视为试听返回 null（丢弃，继续竞速其它源） */
const validateFull = async (url: string, signal?: AbortSignal): Promise<string | null> => {
  const len = await probeLen(url, signal);
  if (len != null && len < TRIAL_MAX) return null; // 疑似试听
  return url;
};

/**
 * 解锁源池（名 + 取链函数）——巡检脚本与 matchUnblock 共用同一份，单一事实源。
 * 顺序仅影响巡检展示与并发起跑顺序（任一命中即返回，不依赖顺序）。
 * signal：竞速共享取消信号，胜出后中止其余源的在途请求。
 */
export const UNBLOCK_SOURCES: Array<{
  name: string;
  fetch: (id: number | string, signal?: AbortSignal) => Promise<string | null>;
}> = [
  { name: "byfuns", fetch: byfuns },
  { name: "msls", fetch: msls },
  { name: "gd", fetch: getGdUrl },
];

/**
 * 并行竞速：所有解锁源同时发出，任一拿到可播链接立即返回；
 * 全部失败/超时返回 null。胜出即 abort 其余源——不让败者继续跑满 8s 超时，
 * 省公益源配额与本机电量。
 */
export const matchUnblock = (ncmId: number | string): Promise<string | null> =>
  new Promise((resolve) => {
    const controller = new AbortController();
    const sources = UNBLOCK_SOURCES.map((s) => s.fetch);
    let pending = sources.length;
    let settled = false;
    const finish = (url: string | null) => {
      if (!settled) {
        settled = true;
        controller.abort();
        resolve(url);
      }
    };
    const onMiss = () => {
      pending -= 1;
      if (pending === 0) finish(null);
    };
    for (const src of sources) {
      Promise.resolve()
        .then(() => src(ncmId, controller.signal))
        .then((url) => (url ? validateFull(url, controller.signal) : null))
        .then((v) => (v ? finish(v) : onMiss()))
        .catch(onMiss);
    }
  });
