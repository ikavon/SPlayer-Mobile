/**
 * QQ 音乐请求层（移植自 SPlayer-Next apis/qqmusic/core/request.ts）
 *
 * 变更：node fetch + AbortSignal.timeout → utils.fetchWithTimeout；无加密，comm 伪装。
 * 统一走 u.y.qq.com/cgi-bin/musicu.fcg 的 `{ comm, request: {module, method, param} }` 协议。
 * 首次请求前拿 music.getSession.session 的 uid/sid/userip，缓存 1h。
 */
import { QM_API_URL, QM_HEADERS, SESSION_TTL, getCommonParams } from "./config";
import { fetchWithTimeout } from "../../utils";

interface SessionCache {
  uid?: string;
  sid?: string;
  userip?: string;
  expireAt: number;
}

let session: SessionCache = { expireAt: 0 };
let initPromise: Promise<void> | null = null;

const MAX_RETRY = 2;
const RETRY_BACKOFF = 300;
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * QQ musicu.fcg 业务错误（outer=request.code, inner=request.code 之一非 0）。
 * 500003=VIP/版权拒绝（匿名拿不到 purl），确定性错误——调用方不应重试，应换档/换源。
 */
export class QmApiError extends Error {
  constructor(public outer: number, public inner: number) {
    super(`QM API 错误: outer=${outer} inner=${inner}`);
    this.name = "QmApiError";
  }
}

interface FcgResponse {
  code?: number;
  request?: { code?: number; data?: unknown };
  [key: string]: unknown;
}

const postRaw = async (body: unknown): Promise<FcgResponse> => {
  const res = await fetchWithTimeout(QM_API_URL, {
    method: "POST",
    headers: QM_HEADERS,
    body: JSON.stringify(body),
  });
  return (await res.json()) as FcgResponse;
};

const ensureSession = (): Promise<void> => {
  if (session.uid && session.expireAt > Date.now()) return Promise.resolve();
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const data = await postRaw({
        comm: getCommonParams(),
        request: {
          module: "music.getSession.session",
          method: "GetSession",
          param: { caller: 0, uid: "0", vkey: 0 },
        },
      });
      if (data.code === 0 && data.request?.code === 0) {
        const info =
          ((data.request.data as { session?: Partial<SessionCache> }) ?? {}).session ?? {};
        session = {
          uid: info.uid,
          sid: info.sid,
          userip: info.userip,
          expireAt: Date.now() + SESSION_TTL,
        };
      }
    } catch {
      // session 失败不阻塞
    } finally {
      initPromise = null;
    }
  })();
  return initPromise;
};

/**
 * 发送一次 musicu.fcg 请求，返回 request.data 业务数据段
 */
export const qmRequest = async <T = unknown>(
  module: string,
  method: string,
  param: Record<string, unknown>,
): Promise<T> => {
  await ensureSession();
  const comm = {
    ...getCommonParams(),
    ...(session.uid ? { uid: session.uid } : {}),
    ...(session.sid ? { sid: session.sid } : {}),
    ...(session.userip ? { userip: session.userip } : {}),
  };
  const body = { comm, request: { module, method, param } };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      const data = await postRaw(body);
      const outerCode = data.code ?? 0;
      const innerCode = data.request?.code ?? 0;
      if (outerCode !== 0 || innerCode !== 0) {
        throw new QmApiError(outerCode, innerCode);
      }
      return data.request?.data as T;
    } catch (err) {
      lastErr = err;
      // 500003=VIP/版权拒绝，确定性错误，重试无意义 → 立即放弃（换档/换源）
      if (err instanceof QmApiError && err.inner === 500003) break;
      if (attempt < MAX_RETRY) await delay(RETRY_BACKOFF);
    }
  }
  throw lastErr;
};
