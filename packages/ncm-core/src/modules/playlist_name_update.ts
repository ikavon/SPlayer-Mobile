/** 更新歌单名（eapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const playlistNameUpdate: NeteaseModule = (query, request) => {
  const data = { id: query.id, name: query.name };
  return request("/api/playlist/update/name", data, createOption(query, "eapi"));
};

export default playlistNameUpdate;
