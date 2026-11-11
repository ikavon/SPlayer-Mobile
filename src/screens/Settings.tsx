/**
 * 设置：播放倍速 / 睡眠定时 / 网络与解析(realIP) / 本地数据管理 / 账号 / 关于。
 * 参考 desktop MainSetting.vue，移动版收敛为单列分组滚动。
 */
import { useState, useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { logoutNetease } from '../auth';
import { useLive } from '../liveStore';
import { useTheme, useIsDark, type Palette } from '../theme';
import { applyPlayRate, startSleepTimer, cancelSleepTimer } from '../player';
import { clearAllDownloads } from '../download';
import OptionPickerModal from '../components/OptionPickerModal';
import { useBottomSpacer } from '../layout';
import { CN_IP } from '../ncm';
import type { RootStackParamList } from '../nav';

const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SLEEP_OPTIONS = [15, 30, 45, 60, 90];
const LIMIT_OPTIONS = [10, 50, 100, 200, 500];
const LEVEL_OPTIONS = [
  { v: 'standard', l: '标准' },
  { v: 'higher', l: '高' },
  { v: 'exhigh', l: '极高' },
  { v: 'lossless', l: '无损' },
  { v: 'hires', l: 'Hi-Res' },
];
const COLOR_OPTIONS = ['#1db954', '#1a73e8', '#9c27b0', '#e91e63', '#ff6f00', '#00897b'];
const MODE_OPTIONS = [
  { v: 'system', l: '跟随系统' },
  { v: 'light', l: '浅色' },
  { v: 'dark', l: '深色' },
] as const;

const fmtRemain = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function Settings() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const isDark = useIsDark();
  const s = useMemo(() => useStyles(t), [t]);
  const bottomSpacer = useBottomSpacer(false);
  const musicU = useStore((s) => s.musicU);
  const account = useStore((s) => s.account);
  const playRate = useStore((s) => s.playRate);
  const setPlayRate = useStore((s) => s.setPlayRate);
  const playLevel = useStore((s) => s.playLevel);
  const setPlayLevel = useStore((s) => s.setPlayLevel);
  const themeColor = useStore((s) => s.themeColor);
  const setThemeColor = useStore((s) => s.setThemeColor);
  const themeMode = useStore((s) => s.themeMode);
  const setThemeMode = useStore((s) => s.setThemeMode);
  const realIP = useStore((s) => s.realIP);
  const setRealIP = useStore((s) => s.setRealIP);
  const sleepWaitSongEnd = useStore((s) => s.sleepWaitSongEnd);
  const setSleepWaitSongEnd = useStore((s) => s.setSleepWaitSongEnd);
  const historyLimit = useStore((s) => s.historyLimit);
  const setHistoryLimit = useStore((s) => s.setHistoryLimit);
  const clearHistory = useStore((s) => s.clearHistory);
  const clearPlayStats = useStore((s) => s.clearPlayStats);
  const sleepRemain = useLive((s) => s.sleepRemain);
  const sleepActive = useLive((s) => s.sleepActive);

  const [limitPicker, setLimitPicker] = useState(false);

  const onRate = (r: number) => {
    setPlayRate(r);
    applyPlayRate(r);
  };

  const confirm = (title: string, msg: string, onConfirm: () => void) =>
    Alert.alert(title, msg, [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: onConfirm },
    ]);

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 12 }]}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={s.backText}>← 返回</Text>
        </Pressable>
        <Text style={s.title}>设置</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: bottomSpacer + 16 }}>
        {/* 播放倍速 */}
        <Text style={s.sectionTitle}>播放</Text>
        <View style={s.card}>
          <Text style={s.rowLabel}>播放倍速</Text>
          <View style={s.chips}>
            {RATE_OPTIONS.map((r) => (
              <Pressable
                key={r}
                style={[s.chip, playRate === r && s.chipActive]}
                onPress={() => onRate(r)}
              >
                <Text style={[s.chipText, playRate === r && s.chipTextActive]}>{r}×</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={s.card}>
          <Text style={s.rowLabel}>播放音质</Text>
          <View style={s.chips}>
            {LEVEL_OPTIONS.map((o) => (
              <Pressable
                key={o.v}
                style={[s.chip, playLevel === o.v && s.chipActive]}
                onPress={() => setPlayLevel(o.v)}
              >
                <Text style={[s.chipText, playLevel === o.v && s.chipTextActive]}>{o.l}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.rowHint}>无损/Hi-Res 需会员；非会员极高(320k)已含。解锁源返回固定音质。</Text>
        </View>

        {/* 睡眠定时 */}
        <Text style={s.sectionTitle}>睡眠定时</Text>
        <View style={s.card}>
          {sleepActive ? (
            <View style={s.sleepHead}>
              <Text style={s.sleepCountdown}>⏱ {fmtRemain(sleepRemain)} 后停止</Text>
              <Pressable style={s.cancelBtn} onPress={cancelSleepTimer} hitSlop={6}>
                <Text style={s.cancelBtnText}>取消</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={s.rowHint}>选择时长开始倒计时</Text>
          )}
          <View style={s.chips}>
            {SLEEP_OPTIONS.map((m) => (
              <Pressable key={m} style={s.chip} onPress={() => startSleepTimer(m, sleepWaitSongEnd)}>
                <Text style={s.chipText}>{m} 分</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.switchRow}>
            <Text style={s.rowLabel}>播完本曲再停</Text>
            <Switch
              value={sleepWaitSongEnd}
              onValueChange={setSleepWaitSongEnd}
              trackColor={{ false: t.placeholder, true: t.accent }}
            />
          </View>
        </View>

        {/* 主题模式 */}
        <Text style={s.sectionTitle}>主题模式</Text>
        <View style={s.card}>
          <View style={s.chips}>
            {MODE_OPTIONS.map((o) => (
              <Pressable
                key={o.v}
                style={[s.chip, themeMode === o.v && s.chipActive]}
                onPress={() => setThemeMode(o.v)}
              >
                <Text style={[s.chipText, themeMode === o.v && s.chipTextActive]}>{o.l}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 主题色 */}
        <Text style={s.sectionTitle}>主题色</Text>
        <View style={s.card}>
          <View style={[s.chips, { marginTop: 0 }]}>
            {COLOR_OPTIONS.map((c) => (
              <Pressable
                key={c}
                style={[
                  s.colorChip,
                  { backgroundColor: c },
                  // 深色卡片上黑环不可见，按外观切换环色
                  themeColor === c && { borderWidth: 3, borderColor: isDark ? '#ffffff' : 'rgba(0,0,0,0.55)' },
                ]}
                onPress={() => setThemeColor(c)}
              />
            ))}
          </View>
          <Text style={s.rowHint}>应用于播放页强调色（按钮/歌词/进度条）与模糊背景。</Text>
        </View>

        {/* 网络与解析 */}
        <Text style={s.sectionTitle}>网络与解析</Text>
        <View style={s.card}>
          <View style={s.switchRow}>
            <Text style={s.rowLabel}>大陆 IP（realIP）</Text>
            <Pressable onPress={() => setRealIP(CN_IP)} hitSlop={6}>
              <Text style={s.resetBtn}>重置</Text>
            </Pressable>
          </View>
          <Text style={s.rowHint}>当前：{realIP}（直连 NCM 接口成功率用；默认 {CN_IP}）</Text>
        </View>

        {/* 本地数据 */}
        <Text style={s.sectionTitle}>本地数据</Text>
        <View style={s.card}>
          <Pressable style={s.switchRow} onPress={() => setLimitPicker(true)}>
            <Text style={s.rowLabel}>播放历史上限</Text>
            <Text style={s.rowValue}>{historyLimit} 首 ›</Text>
          </Pressable>
          <Pressable style={s.actionRow} onPress={() => confirm('清空播放历史', '确定清空全部播放历史？', clearHistory)}>
            <Text style={s.actionText}>清空播放历史</Text>
          </Pressable>
          <Pressable style={s.actionRow} onPress={() => confirm('清空听歌排行', '确定清空听歌次数统计？', clearPlayStats)}>
            <Text style={s.actionText}>清空听歌排行</Text>
          </Pressable>
          <Pressable
            style={s.actionRow}
            onPress={() =>
              confirm('清空下载', '确定删除全部已下载歌曲（本地文件将被删除）？', () => {
                void clearAllDownloads();
                useStore.getState().showToast('已清空下载');
              })
            }
          >
            <Text style={s.actionText}>清空下载</Text>
          </Pressable>
        </View>

        {/* 账号 */}
        <Text style={s.sectionTitle}>账号</Text>
        <View style={s.card}>
          {musicU ? (
            <Pressable
              style={s.actionRow}
              onPress={() =>
                Alert.alert('退出登录', '确定退出登录？本地数据（历史/排行/下载）保留。', [
                  { text: '取消', style: 'cancel' },
                  { text: '退出', style: 'destructive', onPress: () => void logoutNetease() },
                ])
              }
            >
              <Text style={s.logoutText}>退出登录{account?.nickname ? `（${account.nickname}）` : ''}</Text>
            </Pressable>
          ) : (
            <Pressable style={s.actionRow} onPress={() => nav.navigate('Login')}>
              <Text style={s.actionText}>去登录</Text>
            </Pressable>
          )}
        </View>

        {/* 关于 */}
        <Text style={s.sectionTitle}>关于</Text>
        <View style={s.card}>
          <View style={s.switchRow}>
            <Text style={s.rowLabel}>版本</Text>
            <Text style={s.rowValue}>1.0.0</Text>
          </View>
        </View>
      </ScrollView>

      <OptionPickerModal
        visible={limitPicker}
        title="播放历史上限"
        options={LIMIT_OPTIONS}
        currentValue={historyLimit}
        onPick={(n) => {
          setHistoryLimit(n);
          setLimitPicker(false);
        }}
        onCancel={() => setLimitPicker(false)}
      />
    </View>
  );
}

const useStyles = (t: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: t.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: { paddingVertical: 8 },
  backText: { fontSize: 15, color: t.text2 },
  title: { fontSize: 18, fontWeight: '800', color: t.accent },
  sectionTitle: {
    fontSize: 12,
    color: t.text3,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 6,
    marginHorizontal: 20,
  },
  card: {
    backgroundColor: t.card,
    marginHorizontal: 12,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowLabel: { fontSize: 15, fontWeight: '500', color: t.text },
  rowValue: { fontSize: 14, color: t.text3 },
  rowHint: { fontSize: 12, color: t.text3, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: t.cardAlt },
  chipActive: { backgroundColor: t.accent },
  chipText: { fontSize: 14, color: t.text2, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  sleepHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sleepCountdown: { fontSize: 15, fontWeight: '700', color: t.accent },
  cancelBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: t.cardAlt, borderRadius: 14 },
  cancelBtnText: { fontSize: 13, color: t.danger, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  actionRow: { paddingVertical: 12 },
  actionText: { fontSize: 15, color: t.accent, fontWeight: '500' },
  logoutText: { fontSize: 15, color: t.danger, fontWeight: '500' },
  resetBtn: { fontSize: 13, color: t.accent, fontWeight: '600' },
  colorChip: { width: 32, height: 32, borderRadius: 16 },
});
