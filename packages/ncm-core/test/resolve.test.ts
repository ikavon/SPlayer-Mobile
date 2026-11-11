/**
 * 回退解析联调：用一首 NCM VIP/锁区歌验证换源链路
 * NCM 官方拿不到 → 回退到 GD 或 QQ 音乐，应拿到一条可播链接。
 */
import { api } from "../src/modules";
import { resolveSongUrl } from "../src/resolve";

const CN_IP = "116.25.53.100";

async function main() {
  // 搜一首周杰伦的歌（NCM 上多为 VIP）
  const cs = await api.cloudsearch({ keywords: "晴天 周杰伦", limit: 5, realIP: CN_IP });
  const songs = (cs.body as { result?: { songs?: any[] } }).result?.songs ?? [];
  const s = songs[0];
  if (!s?.id) throw new Error("搜索无结果");
  const artist = s.ar?.[0]?.name ?? s.artists?.[0]?.name ?? "";
  console.log(`目标歌曲：${s.name} - ${artist} (id=${s.id})`);

  // 直接 NCM song_url，看是否 url=null（VIP/锁区）
  const direct = await api.songUrl({ id: s.id, realIP: CN_IP });
  const dUrl = (direct.body as { data?: { url?: string; freeTrialInfo?: unknown }[] }).data?.[0]?.url;
  console.log(`NCM 官方直取：${dUrl ? "✓ 有链接" : "null（VIP/锁区→需回退）"}`);

  // resolve：应回退到 GD / QQ
  const r = await resolveSongUrl({ id: s.id, name: s.name, artist, realIP: CN_IP });
  if (r) {
    console.log(
      `✅ resolve 命中 [${r.source}] quality=${r.quality ?? "?"}${r.isTrial ? "(试听)" : ""}`,
    );
    console.log(`   url=${r.url.slice(0, 80)}${r.url.length > 80 ? "…" : ""}`);
    // 校验链接是 http(s)
    const okUrl = /^https?:\/\//.test(r.url);
    console.log(okUrl ? "✅ 链接格式合法" : "⚠️ 链接格式异常");
    process.exit(0);
  }
  console.log("❌ resolve 全部回退失败（NCM/GD/QQ 均无链接）");
  process.exit(1);
}
main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
