/** 获取用户喜欢的音乐 ID 列表（weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const userLike: NeteaseModule = (query, request) => {
  const data = { uid: query.uid };
  return request("/api/song/like/get", data, createOption(query, "weapi"));
};

export default userLike;