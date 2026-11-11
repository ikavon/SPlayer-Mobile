/** 新建歌单（eapi：weapi 会被 NCM 反爬判 "illegal request"，同族端点均走 eapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const playlistCreate: NeteaseModule = (query, request) => {
  const data = {
    name: query.name,
    privacy: query.privacy ?? 0,
    type: query.type ?? "NORMAL",
  };
  return request("/api/playlist/create", data, createOption(query, "eapi"));
};

export default playlistCreate;
