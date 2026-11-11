/** 删除歌单（eapi：与 create 同族，weapi 会被反爬拒） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const playlistDelete: NeteaseModule = (query, request) => {
  const data = { ids: `[${query.id}]` };
  return request("/api/playlist/remove", data, createOption(query, "eapi"));
};

export default playlistDelete;
