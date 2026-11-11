/** 歌单详情（默认 eapi，对齐 NCM 增强版行为） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const playlistDetail: NeteaseModule = (query, request) => {
  const data = { id: query.id, n: 100000, s: query.s ?? 8 };
  return request("/api/v6/playlist/detail", data, createOption(query));
};

export default playlistDetail;
