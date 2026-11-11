/**
 * @splayer-mobile/ncm-core —— NCM 直连客户端核心层
 *
 * 移植自 SPlayer-Next `electron/main/apis/netease/core/*`，纯 JS，RN 可用。
 * 不依赖任何远程 NCM API 服务，App 自带加密层直连 music.163.com。
 */
export * from "./config";
export { aesEncrypt, aesDecrypt, rsaEncrypt, weapi, eapi, linuxapi, eapiResDecrypt } from "./crypto";
export { createRequest, NeteaseRequestError } from "./request";
export type { RequestOptions, RequestResponse } from "./request";
export { cookieToJson, cookieObjToString } from "./cookie";
export { getDeviceId, setDeviceId, regenerateDeviceId } from "./device";
export { api } from "./modules";
export type { Query, NeteaseModule, RequestFn } from "./types";
export { resolveSongUrl } from "./resolve";
export type { ResolveInput, ResolveResult, ResolveSource } from "./resolve";
export { getGdUrl } from "./sources/gd";
export { search as qqSearch, getUrl as qqGetUrl } from "./sources/qqmusic";
