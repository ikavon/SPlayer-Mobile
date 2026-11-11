/** 歌手专辑列表（weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const artistAlbum: NeteaseModule = (query, request) => {
  const data = {
    limit: query.limit ?? 30,
    offset: query.offset ?? 0,
    total: true,
  };
  return request(`/api/artist/albums/${query.id}`, data, createOption(query, "weapi"));
};

export default artistAlbum;
