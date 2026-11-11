/**
 * 进程级设备信息（移植自 SPlayer-Next core/device.ts）
 * - deviceId：52 位大写十六进制字符，进程启动时生成一次
 * - anonymous token：匿名态 MUSIC_A（由 register_anonimous 返回后刷新；MVP 未启用 xeapi，暂不用）
 *
 * 变更：node:crypto randomBytes → utils.randomBytes
 */
import { randomHex } from "./utils";

const generate = (): string => randomHex(26).toUpperCase();

let deviceId = generate();
let anonymousToken = "";

export const getDeviceId = (): string => deviceId;

export const setDeviceId = (id: string): void => {
  deviceId = id;
};

export const regenerateDeviceId = (): string => {
  deviceId = generate();
  return deviceId;
};

export const getAnonymousToken = (): string => anonymousToken;

export const setAnonymousToken = (token: string): void => {
  anonymousToken = token;
};
