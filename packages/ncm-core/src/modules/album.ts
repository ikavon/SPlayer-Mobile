/** 专辑详情：元数据 + 曲目（weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const album: NeteaseModule = (query, request) =>
  request(`/api/v1/album/${query.id}`, {}, createOption(query, "weapi"));

export default album;
