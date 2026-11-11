/**
 * 回退源直接验证：GD 音乐台 + QQ 音乐（搜索 + GetVkey）
 * 不经 resolve 的 NCM-first，直接验证两个换源源是否可用。
 */
import { getGdUrl } from "../src/sources/gd";
import { search as qqSearch, getUrl as qqGetUrl } from "../src/sources/qqmusic";

async function main() {
  let ok = 0;

  // ---- GD 音乐台（NCM id 换 NCM CDN 链接）----
  console.log("== GD 音乐台 ==");
  try {
    const url = await getGdUrl(1330348068); // 起风了
    if (url && /^https?:\/\//.test(url)) {
      ok++;
      console.log("✅ GD:", url.slice(0, 80));
    } else {
      console.log("⚠️ GD 返回空（可能源失效，GD 属尽力而为兜底）");
    }
  } catch (e) {
    console.log("⚠️ GD 异常:", e instanceof Error ? e.message : e);
  }

  // ---- QQ 音乐：搜索 + GetVkey ----
  console.log("\n== QQ 音乐 ==");
  try {
    const list = await qqSearch("晴天 周杰伦", 1, 3);
    const c = list[0];
    if (!c) {
      console.log("⚠️ QQ 搜索无结果");
    } else {
      console.log(`QQ 命中：${c.name} - ${c.artist} | mid=${c.mid} mediaMid=${c.mediaMid.slice(0, 12)}…`);
      if (c.mid && c.mediaMid) {
        const u = await qqGetUrl(c.mid, c.mediaMid, "hq");
        if (u?.url && /^https?:\/\//.test(u.url)) {
          ok++;
          console.log(`✅ QQ url=${u.url.slice(0, 80)} quality=${u.quality}`);
        } else {
          console.log("⚠️ QQ GetVkey 无 purl（该曲 QQ 无版权，正常情况之一）");
        }
      }
    }
  } catch (e) {
    console.log("⚠️ QQ 异常:", e instanceof Error ? e.message : e);
  }

  console.log(`\n${ok}/2 回退源可用`);
  // 至少一个回退源可用即算解锁链路有保障；两个都失败才退出码非 0
  if (ok === 0) process.exit(1);
}
main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
