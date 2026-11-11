/**
 * NCM 会话层：完整 cookie 集的统一存取（对齐桌面版 apis/netease/index.ts 的会话管理）。
 *
 * 桌面版把 MUSIC_U/__csrf/MUSIC_A/deviceId 存进 SQLite sessions 表，登录态变更接口
 * （SESSION_MUTATING）的响应 set-cookie 会写回；移动版此前只存 MUSIC_U 单值。
 * 这里用 zustand 持久化的 ncmCookies 承担同样角色：
 * - authCookie()    所有 api 调用统一取会话（不再手拼 { MUSIC_U }）
 * - mergeSession()  登录成功 / login_refresh / 网页抓包后的 cookie 合并写回
 * - clearSession()  登出或会话失效时清空
 *
 * store 只 type-import ncm.ts，这里运行时 import store 无循环依赖。
 */
import { useStore } from './store';

/**
 * 取当前会话 cookie 集（供 api 调用的 cookie 参数）。
 * 旧版本升级上来只有 musicU 没有 ncmCookies，用 MUSIC_U 单值兜底。
 */
export const authCookie = (): Record<string, string> => {
  const { ncmCookies, musicU } = useStore.getState();
  if (ncmCookies && Object.keys(ncmCookies).length) return { ...ncmCookies };
  if (musicU) return { MUSIC_U: musicU };
  return {};
};

/**
 * 合并写回会话（对齐桌面版 mergeNeteaseCookies / persistSession 语义）。
 * patch 里带 MUSIC_U 时同步刷新「已登录」标志。
 */
export const mergeSession = (patch: Record<string, string>): void => {
  const { ncmCookies, musicU, setNcmCookies, setMusicU } = useStore.getState();
  setNcmCookies({ ...ncmCookies, ...patch });
  if (patch.MUSIC_U && patch.MUSIC_U !== musicU) setMusicU(patch.MUSIC_U);
};

/** 清空会话（登出 / 服务端判失效时） */
export const clearSession = (): void => {
  const { setNcmCookies, setMusicU, setAccount, setLastRefreshAt } = useStore.getState();
  setNcmCookies({});
  setMusicU(undefined);
  setAccount(undefined);
  setLastRefreshAt(0);
};

/**
 * set-cookie 数组 → 扁平对象（只取 key=value，忽略 Path/Domain/Max-Age 等属性）。
 * 与桌面版 parseSetCookie 同逻辑。
 */
export const parseSetCookie = (arr: string[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const raw of arr) {
    const first = raw.split(';')[0];
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    const key = first.slice(0, eq).trim();
    const val = first.slice(eq + 1).trim();
    if (key) out[key] = val;
  }
  return out;
};
