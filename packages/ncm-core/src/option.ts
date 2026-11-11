/**
 * 请求 options 工厂（原样来自 SPlayer-Next core/option.ts，无依赖）
 * 从调用方 query 中抽取 crypto / cookie / ua / realIP 等，拼成 createRequest 的第三参数
 */
import type { CryptoMode } from "./config";
import type { RequestOptions } from "./request";

export interface Query {
  crypto?: CryptoMode;
  cookie?: string | Record<string, string>;
  ua?: string;
  realIP?: string;
  ip?: string;
  e_r?: boolean;
  domain?: string;
  checkToken?: boolean;
  [key: string]: unknown;
}

export const createOption = (query: Query, crypto: CryptoMode | "" = ""): RequestOptions => ({
  crypto: (query.crypto as CryptoMode | undefined) || crypto,
  cookie: query.cookie,
  ua: query.ua || "",
  realIP: query.realIP,
  ip: query.ip,
  e_r: query.e_r,
  domain: query.domain || "",
  checkToken: query.checkToken || false,
});
