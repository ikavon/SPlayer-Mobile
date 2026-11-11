/** 红心 / 取消红心歌曲（weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const like: NeteaseModule = (query, request) => {
  const data = {
    trackId: query.id,
    like: query.like === true || query.like === "true",
    time: 3,
  };
  return request("/api/song/like", data, createOption(query, "weapi"));
};

export default like;
