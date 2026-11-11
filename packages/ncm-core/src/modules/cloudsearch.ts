/** 云端搜索（返回更完整 privileges，推荐使用；默认 eapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const cloudsearch: NeteaseModule = (query, request) => {
  const data = {
    s: query.keywords,
    type: query.type ?? 1,
    limit: query.limit ?? 30,
    offset: query.offset ?? 0,
    total: true,
  };
  return request("/api/cloudsearch/pc", data, createOption(query));
};

export default cloudsearch;
