/** 获取收藏歌手列表（weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const userArtist: NeteaseModule = (query, request) => {
  const data = {
    limit: query.limit ?? 50,
    offset: query.offset ?? 0,
    total: query.total ?? true,
  };
  return request("/api/artist/sublist", data, createOption(query, "weapi"));
};

export default userArtist;