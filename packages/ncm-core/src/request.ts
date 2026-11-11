/**
 * Netease API 请求层（移动端移植版）
 *
 * 来源：SPlayer-Next `electron/main/apis/netease/core/request.ts`
 * 变更：
 * - node:crypto randomBytes → utils.randomBytes/randomHex
 * - fetchWithProxy(@main/utils/proxy) → 全局 fetch + AbortController 超时
 * - 移除 xeapi 分支（MVP 走登录态 cookie 的 weapi/eapi，免 xeapi 反爬）
 * - Buffer → Uint8Array（eapi 响应解密路径）
 * 算法/请求构造/cookie 处理与原版一致。
 */

import {
  API_DOMAIN,
  DOMAIN,
  ENCRYPT_RESPONSE,
  OS_MAP,
  SPECIAL_STATUS_CODES,
  UA_MAP,
  type CryptoMode,
} from "./config";
import { cookieObjToString, cookieToJson } from "./cookie";
import * as encrypt from "./crypto";
import { getAnonymousToken, getDeviceId } from "./device";
import { bytesToHex, randomHex } from "./utils";

export interface RequestOptions {
  crypto?: CryptoMode | "";
  cookie?: string | Record<string, string>;
  ua?: string;
  domain?: string;
  realIP?: string;
  ip?: string;
  e_r?: boolean;
  checkToken?: boolean;
}

export interface RequestResponse {
  status: number;
  body: Record<string, unknown>;
  cookie: string[];
}

export class NeteaseRequestError extends Error {
  readonly response: RequestResponse;
  constructor(response: RequestResponse) {
    const body = response.body as { code?: number | string; msg?: string; message?: string };
    const code = body?.code ?? response.status;
    const msg = body?.msg ?? body?.message ?? "";
    super(msg ? `netease ${code}: ${msg}` : `netease ${code}`);
    this.name = "NeteaseRequestError";
    this.response = response;
  }
}

interface NeteaseBody {
  code?: number | string;
  [key: string]: unknown;
}

/** weapi 专用 CSRF：从 cookie 中取 __csrf */
const csrfFrom = (cookie: Record<string, string>): string => cookie["__csrf"] || "";

/** macOS 客户端日志接口需要桌面浏览器 UA */
const OSX_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** 生成 WNMCID（进程级常量）：6 位小写字母.时间戳.01.0 */
const WNMCID = (() => {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return `${s}.${Date.now()}.01.0`;
})();

/** 每次请求生成：timestamp_XXXX 的递增式 id */
const generateRequestId = (): string => {
  const rand = Math.floor(Math.random() * 1000).toString().padStart(4, "0");
  return `${Date.now()}_${rand}`;
};

/** 补齐 cookie：注入 _ntes_nuid/_ntes_nnid/WNMCID/deviceId/appver 等客户端必备字段 */
const processCookieObject = (
  cookie: Record<string, string>,
  uri: string,
): Record<string, string> => {
  const ntesNuid = cookie._ntes_nuid || randomHex(16);
  const os = OS_MAP[(cookie.os as keyof typeof OS_MAP) || "pc"] || OS_MAP.pc;

  const processed: Record<string, string> = {
    ...cookie,
    __remember_me: "true",
    ntes_kaola_ad: "1",
    _ntes_nuid: cookie._ntes_nuid || ntesNuid,
    _ntes_nnid: cookie._ntes_nnid || `${ntesNuid},${Date.now()}`,
    WNMCID: cookie.WNMCID || WNMCID,
    WEVNSM: cookie.WEVNSM || "1.0.0",
    osver: cookie.osver || os.osver,
    deviceId: cookie.deviceId || getDeviceId(),
    os: cookie.os || os.os,
    channel: cookie.channel || os.channel,
    appver: cookie.appver || os.appver,
  };

  // 登录类接口不带 NMTID（服务端要求）
  if (uri.indexOf("login") === -1) {
    processed.NMTID = randomHex(8);
  }

  if (!processed.MUSIC_U) {
    processed.MUSIC_A = processed.MUSIC_A || getAnonymousToken();
    if (!processed.MUSIC_A) delete processed.MUSIC_A;
  }

  return processed;
};

/** 根据加密方式 + 设备类型选择 User-Agent */
const chooseUserAgent = (
  crypto: keyof typeof UA_MAP,
  uaType: "pc" | "android" | "iphone" | "linux" = "pc",
): string => {
  const map = UA_MAP[crypto] as Record<string, string> | undefined;
  return (map && map[uaType]) || "";
};

/** 全局 fetch + 超时（替代 Next 的 fetchWithProxy；无代理，MVP 够用） */
const fetchWithTimeout = (url: string, init: RequestInit, timeoutMs = 8000): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

/**
 * 构造并发送请求
 * @param uri   接口路径，例如 `/api/w/login`；weapi 会自动替换前缀为 `/weapi/`
 * @param data  业务参数（不含 cookie/csrf，请求层会自动注入）
 * @param options 加密方式 / cookie / realIP 等
 */
export const createRequest = async (
  uri: string,
  data: Record<string, unknown>,
  options: RequestOptions,
): Promise<RequestResponse> => {
  const headers: Record<string, string> = {};
  const ip = options.realIP || options.ip || "";
  if (ip) {
    headers["X-Real-IP"] = ip;
    headers["X-Forwarded-For"] = ip;
  }

  // 归一化 cookie 到对象并做一次补全
  let cookie: Record<string, string> =
    typeof options.cookie === "string" ? cookieToJson(options.cookie) : options.cookie || {};
  cookie = processCookieObject(cookie, uri);
  headers["Cookie"] = cookieObjToString(cookie);

  let crypto: CryptoMode | "" = options.crypto ?? "";
  if (crypto === "") crypto = "eapi";
  if (crypto === "xeapi") {
    // MVP 未移植 xeapi（X25519/GCM）；用 eapi 兜底，VIP 歌曲靠多平台回退
    crypto = "eapi";
  }

  const csrfToken = csrfFrom(cookie);
  const useER = toBoolean(
    options.e_r !== undefined ? options.e_r : data.e_r !== undefined ? data.e_r : ENCRYPT_RESPONSE,
  );
  data.e_r = useER;

  let url = "";
  let encryptData: Record<string, string | number | boolean> | typeof data;

  switch (crypto) {
    case "weapi": {
      headers["Referer"] = options.domain || DOMAIN;
      headers["User-Agent"] = options.ua || chooseUserAgent("weapi");
      data.csrf_token = csrfToken;
      encryptData = encrypt.weapi(data);
      url = (options.domain || DOMAIN) + "/weapi/" + uri.slice(5);
      break;
    }
    case "linuxapi": {
      headers["User-Agent"] = options.ua || chooseUserAgent("linuxapi", "linux");
      encryptData = encrypt.linuxapi({
        method: "POST",
        url: (options.domain || DOMAIN) + uri,
        params: data,
      });
      url = (options.domain || DOMAIN) + "/api/linux/forward";
      break;
    }
    case "eapi":
    case "api": {
      const header: Record<string, string> = {
        osver: cookie.osver,
        deviceId: cookie.deviceId,
        os: cookie.os,
        appver: cookie.appver,
        versioncode: cookie.versioncode || "140",
        mobilename: cookie.mobilename || "",
        buildver: cookie.buildver || Date.now().toString().slice(0, 10),
        resolution: cookie.resolution || "1920x1080",
        __csrf: csrfToken,
        channel: cookie.channel,
        requestId: generateRequestId(),
      };
      if (cookie.MUSIC_U) header.MUSIC_U = cookie.MUSIC_U;
      if (cookie.MUSIC_A) header.MUSIC_A = cookie.MUSIC_A;
      headers["Cookie"] = cookieObjToString(header);
      headers["User-Agent"] =
        options.ua || (cookie.os === "osx" ? OSX_USER_AGENT : chooseUserAgent("api", "iphone"));

      if (crypto === "eapi") {
        (data as Record<string, unknown>).header = header;
        encryptData = encrypt.eapi(uri, data);
        url = (options.domain || API_DOMAIN) + "/eapi/" + uri.slice(5);
      } else {
        url = (options.domain || API_DOMAIN) + uri;
        encryptData = data;
      }
      break;
    }
    default:
      throw new Error(`Unknown crypto: ${crypto}`);
  }

  const body = new URLSearchParams(encryptData as Record<string, string>).toString();
  headers["Content-Type"] = "application/x-www-form-urlencoded";

  const answer: RequestResponse = { status: 500, body: {}, cookie: [] };
  const needDecrypt = (crypto === "eapi" || crypto === "weapi") && useER;

  let res: Response;
  try {
    res = await fetchWithTimeout(url, { method: "POST", headers, body });
  } catch (err) {
    answer.status = 502;
    answer.body = { code: 502, msg: err instanceof Error ? err.message : String(err) };
    throw new NeteaseRequestError(answer);
  }

  // 收集 set-cookie（Node fetch 提供 getSetCookie；RN 通常只 get("set-cookie")）
  const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const setCookie =
    getSetCookie?.call(res.headers) ??
    (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : []);
  answer.cookie = setCookie.map((x) => x.replace(/\s*Domain=[^(;|$)]+;*/, ""));

  let parsed: NeteaseBody;
  try {
    if (needDecrypt) {
      const buf = new Uint8Array(await res.arrayBuffer());
      parsed = encrypt.eapiResDecrypt(bytesToHex(buf)) as NeteaseBody;
    } else {
      const text = await res.text();
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { code: res.status, raw: text };
      }
    }
    answer.body = parsed;
    if (parsed?.code !== undefined) parsed.code = Number(parsed.code);
    answer.status = Number(parsed?.code || res.status);
    if (typeof parsed?.code === "number" && SPECIAL_STATUS_CODES.has(parsed.code)) {
      answer.status = 200;
    }
  } catch {
    answer.body = { code: res.status, msg: "parse failed" };
    answer.status = res.status;
  }

  answer.status = answer.status > 100 && answer.status < 600 ? answer.status : 400;

  if (answer.status === 200) return answer;
  throw new NeteaseRequestError(answer);
};

/** 宽松的 boolean 解析 */
const toBoolean = (val: unknown): boolean => {
  if (typeof val === "boolean") return val;
  if (val === "") return false;
  return val === "true" || val === "1" || val === 1;
};
