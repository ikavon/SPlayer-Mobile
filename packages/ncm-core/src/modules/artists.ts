/** 歌手信息与热门歌曲（weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const artists: NeteaseModule = (query, request) =>
  request(`/api/v1/artist/${query.id}`, {}, createOption(query, "weapi"));

export default artists;
