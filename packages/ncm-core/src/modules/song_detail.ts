/** 批量获取歌曲详情（默认 eapi，原样移植 SPlayer-Next） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const songDetail: NeteaseModule = (query, request) => {
  const ids = String(query.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const data = {
    c: `[${ids.map((id) => `{"id":${id}}`).join(",")}]`,
  };
  return request("/api/v3/song/detail", data, createOption(query));
};

export default songDetail;