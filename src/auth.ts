/**
 * 登录生命周期：登录成功统一收口、冷启动校验、24h 保活、服务端登出。
 * 对齐桌面版 src/stores/user.ts 的 fetchStatus / refresh / logout 语义。
 *
 * 铁律：登录类接口绝不传 realIP（X-Real-IP 触发风控），此处所有调用均不带。
 */
import { api, NeteaseRequestError } from './ncm';
import { authCookie, clearSession, mergeSession, parseSetCookie } from './session';
import { useStore } from './store';

/** 登录 cookie 保活间隔（对齐桌面版 REFRESH_INTERVAL_MS） */
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface LoginStatusProfile {
  userId?: number;
  nickname?: string;
  avatarUrl?: string;
}

interface LoginStatusBody {
  code?: number;
  data?: { profile?: LoginStatusProfile; account?: { id?: number } };
  profile?: LoginStatusProfile;
  account?: { id?: number };
}

/**
 * 服务端是否明确表示登录态失效（对齐桌面版 isExplicitNeteaseAuthFailure）：
 * code 301，或响应文案含"未登录/登录失效"一类字样。
 */
const isAuthFailure = (e: unknown): boolean => {
  if (!(e instanceof NeteaseRequestError)) return false;
  const body = (e.response?.body ?? {}) as { code?: unknown; msg?: unknown; message?: unknown };
  const code = Number(body.code ?? e.response?.status);
  if (code === 301) return true;
  const message = [body.msg, body.message, e.message]
    .filter((v): v is string => typeof v === 'string')
    .join(' ');
  return /未登录|需要登录|请先登录|登录(?:状态|凭据|cookie)?(?:已)?(?:失效|过期)|need.?login|not.?login|login required|(?:login|session|cookie).*(?:expired|invalid|unauthori[sz]ed)|invalid.*cookie/i.test(
    message,
  );
};

/** in-flight 去重：bootAuthCheck 与 Search 屏可能同时触发，loginStatus 只打一次 */
let finishInflight: Promise<boolean> | null = null;

/**
 * 登录成功统一收口：loginStatus 校验会话并写入账号信息。
 * 三种登录方式（网页/手动 cookie/验证码）成功后都走这里。
 * @returns 已登录 true；服务端判未登录返回 false 并清会话；网络错误返回 false 但保留本地态
 */
export const finishLogin = (): Promise<boolean> => {
  if (finishInflight) return finishInflight;
  finishInflight = doFinishLogin().finally(() => {
    finishInflight = null;
  });
  return finishInflight;
};

const doFinishLogin = async (): Promise<boolean> => {
  try {
    const r = await api.loginStatus({ cookie: authCookie(), timestamp: Date.now() });
    const body = r.body as LoginStatusBody;
    if (body.code !== undefined && Number(body.code) !== 200) {
      clearSession();
      return false;
    }
    const raw = body.data?.profile ?? body.profile;
    const userId = raw?.userId ?? body.data?.account?.id ?? body.account?.id;
    if (!userId) {
      clearSession();
      return false;
    }
    useStore.getState().setAccount({
      userId,
      nickname: raw?.nickname ?? '已登录',
      avatarUrl: raw?.avatarUrl,
    });
    return true;
  } catch (e) {
    // 服务端明确判失效 → 清会话；网络错误保留本地态（对齐桌面版离线可用性）
    if (isAuthFailure(e)) clearSession();
    return false;
  }
};

/**
 * 冷启动登录态校验：有 MUSIC_U 时先按需续期（24h），再 loginStatus 验证。
 * 服务端判会话失效则清本地；网络错误保留本地态。
 */
export const bootAuthCheck = async (): Promise<void> => {
  const { musicU, lastRefreshAt, setLastRefreshAt } = useStore.getState();
  if (!musicU) return;

  if (Date.now() - lastRefreshAt > REFRESH_INTERVAL_MS) {
    setLastRefreshAt(Date.now());
    try {
      const r = await api.loginRefresh({ cookie: authCookie(), timestamp: Date.now() });
      const patch = parseSetCookie(r.cookie ?? []);
      if (patch.MUSIC_U) mergeSession(patch);
    } catch {
      // 续期失败不阻断，继续走状态校验
    }
  }

  await finishLogin();
};

/**
 * 登出：先打断服务端 session，再清本地会话与收藏数据。
 * 服务端调用失败也继续本地清理。
 */
export const logoutNetease = async (): Promise<void> => {
  try {
    await api.logout({ cookie: authCookie() });
  } catch {
    // 忽略服务端登出失败
  }
  useStore.getState().logout();
};
