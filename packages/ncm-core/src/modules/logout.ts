/**
 * 退出登录（打断服务端 session），默认 eapi
 * 移植自 SPlayer-Next modules/logout.ts
 */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const logout: NeteaseModule = (query, request) => request("/api/logout", {}, createOption(query));

export default logout;
