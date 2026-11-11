/** 每日推荐歌曲（每日 30 首，需登录，weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const recommendSongs: NeteaseModule = (query, request) => {
  if (query.cookie && typeof query.cookie === "object") {
    (query.cookie as Record<string, string>).os = "ios";
  }
  return request("/api/v3/discovery/recommend/songs", {}, createOption(query, "weapi"));
};

export default recommendSongs;
