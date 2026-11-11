/** 推荐歌单（无需登录，weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const personalized: NeteaseModule = (query, request) => {
  const data = { limit: query.limit ?? 30, total: true, n: 1000 };
  return request("/api/personalized/playlist", data, createOption(query, "weapi"));
};

export default personalized;
