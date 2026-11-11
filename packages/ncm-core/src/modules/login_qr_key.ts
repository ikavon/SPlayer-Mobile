/** 获取二维码登录 unikey（默认 eapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const loginQrKey: NeteaseModule = async (query, request) => {
  const result = await request("/api/login/qrcode/unikey", { type: 3 }, createOption(query));
  return {
    status: 200,
    body: { data: result.body, code: 200 },
    cookie: result.cookie,
  };
};

export default loginQrKey;
