/**
 * QQ 音乐播放地址（GetVkey）—— 自建（Next 未实现，注释说走 lx 插件）
 *
 * 走 u.y.qq.com/cgi-bin/musicu.fcg 的 music.vkey.GetVkey / CgiGetVkey：
 * 传 songmid + filename(`{prefix}{mediaMid}.{ext}`)，响应 midurlinfo[0].purl + sip[0]
 * 拼成 https://<sip>/<purl>。purl 为空表示 QQ 也无版权。
 *
 * filename 前缀（用 mediaMid，非 songmid）：
 *   M500 = 128k mp3 / M800 = 320k mp3 / F000 = flac
 *
 * 500003=VIP/版权拒绝：匿名(uin=0)拿不到 VIP 曲 purl，这是 QQ 的设计而非请求格式错。
 * 已做现实调优：request.ts 对 500003 不重试（确定性错误），getUrl 逐档 M800→M500 立即降级；
 * 非 VIP 曲 GetVkey 仍可取链。VIP 曲解锁靠公益解锁源池 matchUnblock（byfuns/msls 稳），
 * QQ 为末位兜底。要解 VIP 需 QQ 登录态（cookie），非本阶段目标。
 */
import { qmRequest, QmApiError } from "./request";
import { randomGuid } from "../../utils";

export type QmQuality = "lq" | "hq" | "lossless";

const SPEC: Record<QmQuality, { prefix: string; ext: string }> = {
  lq: { prefix: "M500", ext: "mp3" },
  hq: { prefix: "M800", ext: "mp3" },
  lossless: { prefix: "F000", ext: "flac" },
};

const ORDER: QmQuality[] = ["lossless", "hq", "lq"];

const tryGet = async (
  mid: string,
  mediaMid: string,
  quality: QmQuality,
): Promise<{ url: string; quality: QmQuality } | null> => {
  const spec = SPEC[quality];
  const filename = `${spec.prefix}${mediaMid}.${spec.ext}`;
  const data = await qmRequest<{
    midurlinfo?: Array<{ purl?: string }>;
    sip?: string[];
  }>("music.vkey.GetVkey", "CgiGetVkey", {
    guid: randomGuid(),
    songmid: [mid],
    songtype: [0],
    uin: "0",
    loginflag: 1,
    platform: "20",
    filename: [filename],
  });
  const info = data?.midurlinfo?.[0];
  const sip = data?.sip?.[0];
  if (info?.purl && sip) return { url: `https://${sip}/${info.purl}`, quality };
  return null;
};

/**
 * 取 QQ 音乐播放链接，从请求音质向下逐档回退
 * @param mid       songmid
 * @param mediaMid  media_mid（filename 用）
 * @param quality   请求音质，默认 hq（320k）
 */
export const getUrl = async (
  mid: string,
  mediaMid: string,
  quality: QmQuality = "hq",
): Promise<{ url: string; quality: QmQuality } | null> => {
  if (!mid || !mediaMid) return null;
  const start = Math.max(0, ORDER.indexOf(quality));
  for (let i = start; i < ORDER.length; i++) {
    try {
      const r = await tryGet(mid, mediaMid, ORDER[i]);
      if (r) return r;
    } catch (e) {
      // 500003=VIP 拒绝等确定性错误：记日志便于观测，换档继续（M800→M500）
      if (e instanceof QmApiError) {
        console.warn(`[qqmusic] GetVkey ${mid} ${ORDER[i]}: inner=${e.inner}`);
      }
    }
  }
  return null;
};
