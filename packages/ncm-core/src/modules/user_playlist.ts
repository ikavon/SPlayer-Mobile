/** 用户歌单列表（weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const userPlaylist: NeteaseModule = (query, request) => {
  const data = {
    uid: query.uid,
    limit: query.limit ?? 50,
    offset: query.offset ?? 0,
    includeVideo: query.includeVideo ?? true,
  };
  return request("/api/user/playlist", data, createOption(query, "weapi"));
};

export default userPlaylist;