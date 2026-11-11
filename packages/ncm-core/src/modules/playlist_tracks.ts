/**
 * 歌单增/删歌曲（默认 eapi）。
 * 服务端 code:512 表示重复/受限，按 NCM 现行实现把 trackIds 翻倍重试一次强制写入。
 */
import { createOption } from "../option";
import { NeteaseRequestError } from "../request";
import type { NeteaseModule } from "../types";

const playlistTracks: NeteaseModule = async (query, request) => {
  const tracks = String(query.tracks ?? "").split(",");
  const buildData = (ids: string[]) => ({
    op: query.op,
    pid: query.pid,
    trackIds: JSON.stringify(ids),
    imme: "true",
  });
  try {
    return await request("/api/playlist/manipulate/tracks", buildData(tracks), createOption(query));
  } catch (err) {
    if (err instanceof NeteaseRequestError && err.response.body.code === 512) {
      return request(
        "/api/playlist/manipulate/tracks",
        buildData([...tracks, ...tracks]),
        createOption(query),
      );
    }
    throw err;
  }
};

export default playlistTracks;
