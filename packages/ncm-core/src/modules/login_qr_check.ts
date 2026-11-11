/** 轮询二维码扫码状态：801 待扫码 / 802 待确认 / 800 过期 / 803 已确认（cookie 有 MUSIC_U） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const loginQrCheck: NeteaseModule = async (query, request) => {
  const data = { key: query.key, type: 3 };
  try {
    const result = await request("/api/login/qrcode/client/login", data, createOption(query));
    return {
      status: 200,
      body: { ...result.body, cookie: result.cookie.join(";") },
      cookie: result.cookie,
    };
  } catch (err) {
    const fallback = err as { cookie?: string[] };
    return { status: 200, body: {}, cookie: fallback?.cookie ?? [] };
  }
};

export default loginQrCheck;
