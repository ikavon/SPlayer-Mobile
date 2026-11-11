/**
 * 底部浮层几何：MiniPlayer 尺寸/偏移与标签栏高度，MiniPlayer 与各屏底部留白共用。
 * useBottomSpacer 给出屏幕应预留的 paddingBottom，保证列表末行不被 MiniPlayer 盖住。
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveTrack } from 'react-native-track-player';

export const TAB_BAR_HEIGHT = 50;
export const MINI_PLAYER_HEIGHT = 56;
/** MiniPlayer 与屏幕底边（或标签栏顶边）的间隙，与 MiniPlayer 的 bottom 计算一致 */
const MINI_GAP = 6;
/** MiniPlayer 上方额外呼吸空间 */
const EXTRA = 8;
/** 播放条侵入内容区的高度 = 条高 + 间隙 + 呼吸 */
const MINI_BLOCK = MINI_PLAYER_HEIGHT + MINI_GAP + EXTRA;
/** 无播放条时只留小边距 */
const IDLE_PAD = 16;

/**
 * onTab=双标签页（Search/Library）；false=推入子页（整屏）。
 *
 * 关键几何：bottom-tabs 的内容区是标签栏的兄弟节点（flex:1），已扣掉标签栏(50)+底部安全区，
 * 其底边即标签栏顶边。MiniPlayer 浮在标签栏上方 6px，只侵入内容区 MINI_BLOCK(70)px——
 * 故 tab 屏只需让出 70，**不能再加 insets.bottom/标签栏高度**（否则双重预留，底部一大块空白）。
 * stack 屏内容区是整屏，MiniPlayer 距屏底 insets.bottom+6，需让出 insets.bottom+MINI_BLOCK。
 * 没有播放曲时 MiniPlayer 不显示，只留小边距（初入 app 不再有大块空白）。
 */
export function useBottomSpacer(onTab: boolean): number {
  const insets = useSafeAreaInsets();
  const track = useActiveTrack();
  const miniVisible = !!track?.url;
  if (!miniVisible) {
    return onTab ? IDLE_PAD : insets.bottom + IDLE_PAD;
  }
  return onTab ? MINI_BLOCK : insets.bottom + MINI_BLOCK;
}
