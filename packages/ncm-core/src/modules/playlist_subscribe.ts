/** 订阅 / 取消订阅歌单（eapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const playlistSubscribe: NeteaseModule = (query, request) => {
  const action = query.t === 2 ? "unsubscribe" : "subscribe";
  const data = { id: query.id };
  return request(`/api/playlist/${action}`, data, createOption(query, "eapi"));
};

export default playlistSubscribe;
