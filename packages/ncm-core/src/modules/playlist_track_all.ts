/** 获取歌单所有歌曲（分页） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const playlistTrackAll: NeteaseModule = (query, request) => {
  const data = {
    id: query.id,
    limit: query.limit ?? 500,
    offset: query.offset ?? 0,
  };
  return request("/api/playlist/track/all", data, createOption(query, "weapi"));
};

export default playlistTrackAll;