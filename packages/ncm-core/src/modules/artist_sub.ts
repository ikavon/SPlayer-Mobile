/** 收藏 / 取消收藏歌手（weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const artistSub: NeteaseModule = (query, request) => {
  const path = query.t === 2 ? "/api/artist/unsub" : "/api/artist/sub";
  const data = { artistId: query.id, artistIds: `[${query.id}]` };
  return request(path, data, createOption(query, "weapi"));
};

export default artistSub;
