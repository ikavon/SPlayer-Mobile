/** 搜索建议（web / mobile，weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const searchSuggest: NeteaseModule = (query, request) => {
  const data = { s: query.keywords || "" };
  const type = query.type === "mobile" ? "keyword" : "web";
  return request(`/api/search/suggest/${type}`, data, createOption(query, "weapi"));
};

export default searchSuggest;
