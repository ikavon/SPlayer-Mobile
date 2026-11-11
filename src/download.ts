/**
 * 下载离线：解析 → 下载到应用私有目录 → 记入 store；离线播放优先读本地 file://。
 *
 * 文件存 FileSystem.documentDirectory + 'splayer-downloads/'（应用私有，无需权限；
 * track-player/ExoPlayer 可直读 file://）。路径持久化在 store.downloads，文件跨重启仍在。
 * CDN 链接有时效，故每次下载都重新解析（resolveSongUrl）拿新鲜 url，不复用旧链接。
 * MVP 无进度条（downloadAsync 无回调），用 toast 反馈"下载中→已下载/失败"。
 */
import * as FileSystem from 'expo-file-system';
import { resolveSongUrl, CN_IP } from './ncm';
import type { NcmSong } from './ncm';
import { authCookie } from './session';
import { useStore } from './store';

const DIR = (FileSystem.documentDirectory ?? '') + 'splayer-downloads/';

let dirReady = false;

/** 确保下载目录存在（幂等） */
async function ensureDownloadDir(): Promise<void> {
  if (dirReady) return;
  try {
    const info = await FileSystem.getInfoAsync(DIR);
    if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    dirReady = true;
  } catch {
    // 目录已存在或创建失败——忽略（downloadAsync 仍可能成功）
  }
}

/** 从 CDN url 路径提取扩展名，缺省 .mp3 */
const extFromUrl = (url: string): string => {
  const path = url.split('?')[0].split('#')[0];
  const m = path.match(/\.(mp3|flac|m4a|aac|ogg|wav)$/i);
  return m ? `.${m[1].toLowerCase()}` : '.mp3';
};

/**
 * 下载一首歌到本地。现解析拿新鲜 CDN url → downloadAsync → 记 store。
 * @returns true 下载成功（含已下载覆盖）；false 无可用音源或下载失败
 */
export async function downloadSong(
  song: NcmSong,
  musicU?: string,
  realIP: string = CN_IP,
): Promise<boolean> {
  try {
    await ensureDownloadDir();
    const r = await resolveSongUrl({
      id: song.id,
      name: song.name,
      artist: song.artist,
      realIP,
      level: useStore.getState().playLevel,
      ...(musicU ? { cookie: authCookie() } : {}),
    });
    if (!r?.url) return false;
    const ext = extFromUrl(r.url);
    const fileUri = DIR + `${song.id}${ext}`;
    // 覆盖旧文件（重新下载场景）
    try { await FileSystem.deleteAsync(fileUri, { idempotent: true }); } catch { /* ignore */ }
    const res = await FileSystem.downloadAsync(r.url, fileUri);
    if (!res || res.status < 200 || res.status >= 300) return false;
    let size: number | undefined;
    try {
      const info = await FileSystem.getInfoAsync(res.uri);
      size = (info as { size?: number })?.size;
    } catch { /* ignore */ }
    useStore.getState().addDownload(song, res.uri, size, r.source);
    return true;
  } catch (e) {
    console.warn('[download] failed', song.id, e);
    return false;
  }
}

/** 离线曲本地路径（已含 file://），无则 undefined。playSongsAt/resolveOne 优先查此。 */
export function localUriFor(id: number): string | undefined {
  return useStore.getState().downloads[id]?.path;
}

/** 删除一条下载：删文件 + 清记录 */
export async function deleteDownload(id: number): Promise<void> {
  const rec = useStore.getState().downloads[id];
  if (!rec) return;
  try { await FileSystem.deleteAsync(rec.path, { idempotent: true }); } catch { /* ignore */ }
  useStore.getState().removeDownload(id);
}

/** 删除全部下载：批量删文件 + 清记录（Downloads 屏"全部删除"用） */
export async function clearAllDownloads(): Promise<void> {
  const all = Object.values(useStore.getState().downloads);
  await Promise.all(
    all.map((d) => FileSystem.deleteAsync(d.path, { idempotent: true }).catch(() => {})),
  );
  useStore.getState().clearDownloads();
}

/** 下载记录数组视图（按下载时间倒序），供 Downloads 屏渲染 */
export function downloadedSongs(): NcmSong[] {
  const list = Object.values(useStore.getState().downloads);
  list.sort((a, b) => b.downloadedAt - a.downloadedAt);
  return list.map((d) => d.song);
}
