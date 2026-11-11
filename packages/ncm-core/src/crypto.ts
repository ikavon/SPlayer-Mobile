/**
 * Netease API 加解密层（移动端移植版）
 *
 * 来源：SPlayer-Next `electron/main/apis/netease/core/crypto.ts`
 * 变更：node:crypto / node:zlib → 纯 JS（bn.js 裸 RSA + crypto-js AES/MD5 + pako gzip）
 * 算法、密钥、输出格式与原版逐字节一致（见 test/parity.test.ts 对拍）。
 *
 * - 加密方式：weapi（web 端）、linuxapi（Linux 客户端）、eapi（桌面/移动客户端）、api（明文带 cookie）
 * - xeapi（反爬）暂不移植，MVP 用登录态 cookie 走 weapi/eapi，免 xeapi
 */

import BN from "bn.js";
import CryptoJS from "crypto-js";
import pako from "pako";

const { AES, enc, mode, pad, MD5 } = CryptoJS;
const { ungzip } = pako;
import { BASE62, EAPI_KEY, IV, LINUX_API_KEY, PRESET_KEY } from "./config";
import { bytesToHex, uint8ToWordArray, wordArrayToUint8 } from "./utils";

/**
 * weapi RSA 公钥（裸模幂，NO_PADDING）。e/n 由 config.PUBLIC_KEY 派生，固定常量。
 * 移动端不引 node:crypto，故直接固化模数；若 NCM 换 key 需同步更新。
 */
const RSA_E = new BN("010001", 16);
const RSA_N = new BN(
  "e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7",
  16,
);

/** 0..max-1 随机整数。RN 需 react-native-get-random-values polyfill crypto.getRandomValues。 */
const randomInt = (max: number): number => {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const arr = new Uint32Array(1);
    c.getRandomValues(arr);
    return arr[0] % max;
  }
  return Math.floor(Math.random() * max);
};

/**
 * AES 加密（cbc / ecb，aes-128，PKCS7），输出 base64 或 hex(大写)
 * @param text 明文
 * @param m 加密模式
 * @param key 16 字节 utf8 密钥
 * @param iv cbc 时的 16 字节 utf8 IV；ecb 忽略
 * @param format 输出格式
 */
export const aesEncrypt = (
  text: string,
  m: "cbc" | "ecb",
  key: string,
  iv: string,
  format: "base64" | "hex" = "base64",
): string => {
  const keyWA = enc.Utf8.parse(key);
  const opts: Record<string, unknown> = {
    mode: m === "cbc" ? mode.CBC : mode.ECB,
    padding: pad.Pkcs7,
  };
  if (m === "cbc") opts.iv = enc.Utf8.parse(iv);
  const encrypted = AES.encrypt(text, keyWA, opts as never);
  return format === "hex"
    ? encrypted.ciphertext.toString(enc.Hex).toUpperCase()
    : encrypted.ciphertext.toString(enc.Base64);
};

/**
 * AES 解密（固定 aes-128-ecb，PKCS7）→ Uint8Array
 * @param ciphertext 密文
 * @param key 16 字节 utf8 密钥
 * @param format 输入密文格式
 */
export const aesDecrypt = (
  ciphertext: string,
  key: string,
  format: "base64" | "hex" = "base64",
): Uint8Array => {
  const keyWA = enc.Utf8.parse(key);
  const cipherWA =
    format === "hex" ? enc.Hex.parse(ciphertext) : enc.Base64.parse(ciphertext);
  const decrypted = AES.decrypt({ ciphertext: cipherWA } as never, keyWA, {
    mode: mode.ECB,
    padding: pad.Pkcs7,
  } as never);
  return wordArrayToUint8(decrypted);
};

/**
 * 裸 RSA（NO_PADDING，1024bit，明文左侧补 0 到 128 字节）→ 小写 hex(256)
 * 网易云 weapi 要求「裸 RSA」：明文左补 0 到 128B（1024bit 模长），再做一次模幂，输出 hex
 */
export const rsaEncrypt = (str: string): string => {
  const dataBytes = wordArrayToUint8(enc.Utf8.parse(str));
  if (dataBytes.length > 128) throw new Error("rsaEncrypt: input > 128 bytes");
  const buf = new Uint8Array(128);
  buf.set(dataBytes, 128 - dataBytes.length);
  const m = new BN(bytesToHex(buf), 16);
  const red = BN.red(RSA_N);
  const result = m.toRed(red).redPow(RSA_E).fromRed();
  return result.toString(16).padStart(256, "0");
};

/**
 * weapi 加密
 * 1) 生成 16 字节随机 base62 secretKey
 * 2) 明文经 AES-CBC(PRESET_KEY) 加密一次，再用 secretKey 再加密一次
 * 3) secretKey 倒序后用裸 RSA 加密为 encSecKey
 */
export const weapi = (object: unknown): { params: string; encSecKey: string } => {
  const text = JSON.stringify(object);
  let secretKey = "";
  for (let i = 0; i < 16; i++) secretKey += BASE62.charAt(randomInt(62));
  const first = aesEncrypt(text, "cbc", PRESET_KEY, IV);
  const params = aesEncrypt(first, "cbc", secretKey, IV);
  const encSecKey = rsaEncrypt(secretKey.split("").reverse().join(""));
  return { params, encSecKey };
};

/**
 * linuxapi 加密
 * @param object 业务参数
 * @returns eparams（AES-128-ECB hex）
 */
export const linuxapi = (object: unknown): { eparams: string } => {
  const text = JSON.stringify(object);
  return { eparams: aesEncrypt(text, "ecb", LINUX_API_KEY, "", "hex") };
};

/**
 * eapi 加密
 * 1) 用 url + 明文 + 固定盐拼接后 MD5 作为签名 digest
 * 2) 整串 `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}` 经 AES-128-ECB(hex) 加密
 * @param url 接口路径
 * @param object 业务参数
 */
export const eapi = (url: string, object: unknown): { params: string } => {
  const text = typeof object === "object" ? JSON.stringify(object) : String(object);
  const message = `nobody${url}use${text}md5forencrypt`;
  const digest = MD5(message).toString();
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  return { params: aesEncrypt(data, "ecb", EAPI_KEY, "", "hex") };
};

/**
 * eapi 响应解密
 * @param encryptedHex 加密后的 hex 文本
 * @param aeapi 是否 gzip 压缩
 */
export const eapiResDecrypt = (encryptedHex: string, aeapi = false): unknown => {
  try {
    const bytes = aesDecrypt(encryptedHex, EAPI_KEY, "hex");
    const final = aeapi ? ungzip(bytes) : bytes;
    return JSON.parse(uint8ToWordArray(final).toString(enc.Utf8));
  } catch {
    return null;
  }
};
