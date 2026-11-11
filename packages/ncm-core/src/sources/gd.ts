/**
 * GD 音乐台解锁源（SPlayer /api/unblock/netease 同款数据源）
 * 公网免费 API，1 个 HTTP：用 NCM 歌曲 id 换一条可播的 NCM CDN 链接。
 * 非自托管后端，与 SPlayer 桌面版 unblock 一致。可能不稳定，作尽力而为的兜底。
 */
import { fetchWithTimeout } from "../utils";

const GD_API = "https://music-api.gdstudio.xyz/api.php";

/** 用 NCM 歌曲 id 取 GD 返回的可播链接，失败返回 null。
 *  参数与本地 NCM 源部署包的 gdmusic 模块对齐（source=netease&br=999）。
 *  GD 返回的是 NCM CDN 链接（多为 http://），统一转 https——Android release 禁明文流量。 */
export const getGdUrl = async (
  ncmId: number | string,
  signal?: AbortSignal,
): Promise<string | null> => {
  const res = await fetchWithTimeout(
    `${GD_API}?types=url&source=netease&id=${ncmId}&br=999`,
    { method: "GET" },
    8000,
    signal,
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { url?: string } | null;
  return data?.url ? data.url.replace(/^http:\/\//, "https://") : null;
};
