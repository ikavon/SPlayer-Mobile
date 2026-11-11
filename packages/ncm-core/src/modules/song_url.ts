/**
 * 获取歌曲播放地址（v1 端点）
 * - url == null：VIP / 版权未开放 → 交由多平台回退(qqmusic/kugou/lx)取替代链接
 * - freeTrialInfo != null：仅 30s 试听片段
 *
 * 偏差说明：Next 用 xeapi；MVP 未移植 xeapi，改走 eapi（旧 NCM API 包即如此，已验证可行）。
 */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const song_url: NeteaseModule = (query, request) => {
  const ids = query.id ?? query.ids;
  const data = {
    ids: `[${String(ids).split(",").join(",")}]`,
    level: query.level ?? "exhigh",
    encodeType: "flac",
  };
  return request("/api/song/enhance/player/url/v1", data, createOption(query, "eapi"));
};

export default song_url;
