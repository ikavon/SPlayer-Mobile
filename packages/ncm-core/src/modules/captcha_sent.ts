/** 发送短信验证码（weapi） */
import { createOption } from "../option";
import type { NeteaseModule } from "../types";

const captchaSent: NeteaseModule = (query, request) => {
  const data = {
    ctcode: query.ctcode || "86",
    secrete: "music_middleuser_pclogin",
    cellphone: query.phone,
  };
  return request("/api/sms/captcha/sent", data, createOption(query, "weapi"));
};

export default captchaSent;
