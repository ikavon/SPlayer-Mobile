/**
 * 加密层对拍测试（自包含）
 *
 * 黄金值 GOLDEN 由上游 SPlayer-Next `electron/main/apis/netease/core/crypto.ts`
 * （node:crypto 实现）一次性产出并固化于此。确定性算法应与移植版字节一致；
 * weapi 非确定性，验结构与 RSA 路径。无需上游源码即可运行：npm run test:parity。
 */
import * as mine from "../src/crypto";

const GOLDEN = {
  eapiSongUrl: {
    params:
      "E4516E3D02B1D0449DD5EA00CC5F301EF75CA120B8D9A82B52ABE3F84A6FF30382B40D5B20FEBD4FB96B1E826C392DE5CE2A0A39711962E2D73C4A53118CB1BAFCE76A3E6C50C7B40DDC7D2B5618A33F051ACA092DF55F04185CF306B7FEA6BC8A23AC6543743F5A7B244FE9BA4C92D8",
  },
  eapiMulti: {
    params:
      "0ECBAA8AF04856467D6B62476CFD8C5A9BB9127AA70DCCF61BA8C1B6C6612927201E0F825134ADA371BE75BE8282496032FC4FF101A5CE7421F2569BDA8E5B58C38769E5AC3D37CCDE572FBB650B35A2A85FEDA5FB72AE9307AD4E57779FFDEA55C9815EB58F53A7422AE7F7ACB079336D69C031567BE7F2672835E83E3268ED",
  },
  eapiEmpty: {
    params:
      "B895695FCB5E9F35EBD170BD290F4EE553EC58B6231A8D0A01F57F154A2D2C2EE29740F6C14444CA5715CE361B134436F8758B54DD11272A61505AF306ED481C3E122C1737C270B1B26C7790F17B57B2",
  },
  linuxapi: {
    eparams:
      "A0D9583F4C5FF68DE851D2893A49DE988FFC799862F3BD1CDEFF7E7E02BC04156458C40666B2CBB9DBB6424AE099F95A1FFED7FAA3E5F70A3CAF5B6DC9FC628F0D3224FA375301E713875A97CE7A80BD",
  },
  aesCbc: "d4cE6lEGMdY0rLQCGQiIdaXRclAvNNoKem2FSI5jlys=",
  aesEcb:
    "49F4EBFD3698807258D82F45552AD8511F4E43ED354F85781D54CF12EDE4818E752592CEDB96FBC4A7AFD85AF45BC09ED6574D48E238AAA6BB61FEAC9791996B4D61CEE0A9F61A6D0FD883184AFC0D61",
  decryptCt: "57551C0F81512DA739F582222FE6A5A5D42659F0BF29A1C25844DB59AFB57876",
  decryptHex: "646563727970742d6d652d706c65617365",
  rsaA:
    "7131f3d06665538de1914e42caa848115bb92e7e6bd41140d642e3be613b8f1da7a4aef3c981522468b96315cc51d2f12ab76aa0462a7e0ec7f70261b3e11b738951b3a170961e307e62298db3543a0ac5b04462c271509435cfe11a5807be1dee853b072f138e29d1cea0fb044639cd8ecb6b2ead8e0d53a011279024a4b41f",
  rsa16:
    "5241f7b662c1f953eac31439bbdb03a095ffc35139c133711381e613ea72416c4d9a513064c11ff62854439f2479a4aca221e25bc0224dbbdcfec74ea9066a485f6468bcf9eb0c3a5099fd5607fa025978e8089469e0824851e0c045999848f7217ef822f4e92baf25f2d4fdf74e43e9d977c494c58d9677ba9afa88330212ea",
  rsaZ:
    "7dc658de21b960968409a15f07a3942f18715a52d4c546a844887a9c108148be52811649fdd9b156ca8b274f5b8b685370f777b4a6dd1439208e1e4d507d9be1d1cba8bfdb7de69dd5075deb4d0c28bdd8b18f8b4b7cc76e5a351b72df42de3ffffa1b7fc6d770deb783c805630bbc74b944ace6713427ddecfb1638c9194e63",
  rsaReversed:
    "d15a1683c992095d0c234c19966605c5c5964911268bbeda8cb8d08d834913e59d53b32358903a121b5fca784c1f5ae44951fd02524df58ecc98e52cc7cf8689b42c2e93ddf05b0592512d87f5960467e2f086c018849d76014d323500e30f13ef4cafbb0cf5a66731a3f1776c75ca35d0062dac70a3e33245afabcf47938487",
};

let pass = 0;
let fail = 0;

const str = (x: unknown): string => (typeof x === "string" ? x : JSON.stringify(x));

function eq(name: string, actual: unknown, expected: unknown) {
  const sa = str(actual);
  const sb = str(expected);
  if (sa === sb) {
    pass++;
    console.log("✅", name);
  } else {
    fail++;
    console.log("❌", name);
    console.log("   golden:", sb.slice(0, 120), sb.length > 120 ? "…" : "");
    console.log("   mine:  ", sa.slice(0, 120), sa.length > 120 ? "…" : "");
  }
}

const toHex = (u8: Uint8Array): string =>
  Array.from(u8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

// ---- eapi（全确定性）----
eq("eapi /song/url/v1", mine.eapi("/song/url/v1", { id: 1973665667, level: "exhigh" }), GOLDEN.eapiSongUrl);
eq(
  "eapi 多字段对象",
  mine.eapi("/song/enhance/player/url", { ids: [1, 2, 3], br: 320000, e_r: true }),
  GOLDEN.eapiMulti,
);
eq("eapi 空对象", mine.eapi("/playlist/detail", {}), GOLDEN.eapiEmpty);

// ---- linuxapi（确定性）----
eq(
  "linuxapi",
  mine.linuxapi({ method: "POST", url: "/api/song/enhance/player/url", params: { ids: [42] } }),
  GOLDEN.linuxapi,
);

// ---- AES 原语 ----
eq("aes-cbc base64", mine.aesEncrypt("hello world 你好", "cbc", "0CoJUm6Qyw8W8jud", "0102030405060708"), GOLDEN.aesCbc);
eq(
  "aes-ecb hex",
  mine.aesEncrypt(
    "nobody/song/url/v1use{x}md5forencrypt-36cd479b6b5-{x}-36cd479b6b5-digest",
    "ecb",
    "e82ckenh8dichen8",
    "",
    "hex",
  ),
  GOLDEN.aesEcb,
);

// ---- aesDecrypt：用固化密文解，比 hex ----
eq("aesDecrypt-ecb", toHex(mine.aesDecrypt(GOLDEN.decryptCt, "e82ckenh8dichen8", "hex")), GOLDEN.decryptHex);

// ---- 裸 RSA（确定性）----
eq("rsa 短串", mine.rsaEncrypt("a"), GOLDEN.rsaA);
eq("rsa 16B secretKey 反转", mine.rsaEncrypt("zyxwvutsrqponml"), GOLDEN.rsa16);
eq("rsa 单字符 z", mine.rsaEncrypt("z"), GOLDEN.rsaZ);

// ---- weapi：非确定性，验结构 + RSA 路径 ----
{
  const w = mine.weapi({ id: 1, level: "exhigh" });
  const okShape =
    typeof w.params === "string" &&
    w.params.length > 0 &&
    typeof w.encSecKey === "string" &&
    w.encSecKey.length === 256;
  if (okShape) {
    pass++;
    console.log("✅ weapi 结构");
  } else {
    fail++;
    console.log("❌ weapi 结构", w);
  }
  // encSecKey 路径：secretKey 反转后裸 RSA（"abcdefghijklmnop" 反转）
  eq("weapi encSecKey 路径", mine.rsaEncrypt("ponmlkjihgfedcba"), GOLDEN.rsaReversed);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
