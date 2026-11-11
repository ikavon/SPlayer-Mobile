/**
 * 手机号登录（验证码或密码均可），weapi
 * - 验证码登录：传 phone + captcha
 * - 密码登录：传 phone + password（或 md5_password）
 * 成功时 body.cookie 为 join 后的串（含 MUSIC_U）
 */
import CryptoJS from "crypto-js";
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const md5 = (text: string): string => CryptoJS.MD5(text).toString();

const loginCellphone: NeteaseModule = async (query, request) => {
  const hasCaptcha = Boolean(query.captcha);
  const data: Record<string, unknown> = {
    type: "1",
    https: "true",
    phone: query.phone,
    countrycode: query.countrycode || "86",
    remember: "true",
  };
  if (hasCaptcha) {
    data.captcha = query.captcha;
  } else {
    data.password = (query.md5_password as string) || md5((query.password as string) || "");
  }

  let result = await request("/api/w/login/cellphone", data, createOption(query, "weapi"));
  const body = result.body as { code?: number; [key: string]: unknown };

  if (body.code === 200) {
    const renamed = JSON.parse(JSON.stringify(body).replace(/avatarImgId_str/g, "avatarImgIdStr"));
    result = {
      status: 200,
      body: { ...renamed, cookie: result.cookie.join(";") },
      cookie: result.cookie,
    };
  }
  return result;
};

export default loginCellphone;
