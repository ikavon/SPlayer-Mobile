/** 热搜详情（带热度/图标，weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const searchHotDetail: NeteaseModule = (query, request) =>
  request("/api/hotsearchlist/get", {}, createOption(query, "weapi"));

export default searchHotDetail;
