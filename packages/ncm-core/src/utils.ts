/**
 * 字节工具 —— 纯 JS，不依赖 Node Buffer，RN/Hermes 通用。
 */
import CryptoJS from "crypto-js";
const { lib } = CryptoJS;
type WordArray = CryptoJS.lib.WordArray;

/** crypto-js WordArray → Uint8Array */
export const wordArrayToUint8 = (wa: WordArray): Uint8Array => {
  const { words, sigBytes } = wa;
  const out = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) {
    out[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
};

/** Uint8Array → crypto-js WordArray */
export const uint8ToWordArray = (u8: Uint8Array): WordArray => {
  const words: number[] = [];
  for (let i = 0; i < u8.length; i++) {
    words[i >>> 2] = (words[i >>> 2] | 0) | (u8[i] << (24 - (i % 4) * 8));
  }
  return lib.WordArray.create(words, u8.length);
};

/** Uint8Array → 小写 hex */
export const bytesToHex = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
};

/**
 * 密码学随机字节。RN 需 react-native-get-random-values polyfill crypto.getRandomValues。
 * 兜底用 Math.random（非安全，但 NCM 场景里 nuid/NMTID/deviceId 非安全用途可接受）。
 */
export const randomBytes = (n: number): Uint8Array => {
  const out = new Uint8Array(n);
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
};

/** n 字节随机十六进制（小写） */
export const randomHex = (n: number): string => bytesToHex(randomBytes(n));

/** 全局 fetch + 超时（RN/Node 通用，AbortController）。
 *  externalSignal：调用方共享的取消信号（如竞速胜出后中止其余源），与内部超时信号合并。 */
export const fetchWithTimeout = (
  url: string,
  init: RequestInit,
  timeoutMs = 8000,
  externalSignal?: AbortSignal,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort);
  }
  return fetch(url, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  });
};

/** QQ 音乐 guid：随机 10 位数字字符串 */
export const randomGuid = (): string => {
  const r = randomBytes(8);
  let s = "";
  for (let i = 0; i < 10; i++) s += (r[i % r.length] % 10).toString();
  return s;
};
