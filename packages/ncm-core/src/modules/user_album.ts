/** 获取收藏专辑列表（weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const userAlbum: NeteaseModule = (query, request) => {
  const data = {
    limit: query.limit ?? 50,
    offset: query.offset ?? 0,
    total: query.total ?? true,
  };
  return request("/api/album/sublist", data, createOption(query, "weapi"));
};

export default userAlbum;