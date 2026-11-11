/** 收藏 / 取消收藏专辑（weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const albumSub: NeteaseModule = (query, request) => {
  const path = query.t === 2 ? "/api/album/sub/cancel" : "/api/album/sub";
  const data = { id: query.id };
  return request(path, data, createOption(query, "weapi"));
};

export default albumSub;
