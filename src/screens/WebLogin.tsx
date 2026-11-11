/**
 * 官方网页登录（桌面版 openNeteaseLoginWindow 的 RN 移植）
 * - WebView 打开 https://music.163.com/#/login，整页伪装桌面 Chrome UA
 *   （默认 RN UA 会被 NCM 判不受支持环境）
 * - 每 1s 轮询原生 cookie 罐，出现 MUSIC_U 即登录成功（对齐桌面版 1s 轮询）
 * - 成功后 mergeSession 写回会话，走 finishLogin 统一校验收口；
 *   校验失败则等用户在页面内重新登录，页面再次导航时自动恢复轮询
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import CookieManager from '@react-native-cookies/cookies';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { finishLogin } from '../auth';
import { mergeSession } from '../session';
import { useTheme, type Palette } from '../theme';

const LOGIN_URL = 'https://music.163.com/#/login';

/** 伪装成普通桌面 Chrome（同桌面版 FAKE_UA） */
const FAKE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** 关心的关键 cookie；未取到 MUSIC_U 视为未登录（对齐桌面版 COOKIE_KEYS） */
const COOKIE_KEYS = ['MUSIC_U', '__csrf', 'NMTID', 'MUSIC_A'];

type Phase = 'loading' | 'polling' | 'finishing';

export default function WebLogin() {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);

  const [phase, setPhase] = useState<Phase>('loading');
  const [errMsg, setErrMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settledRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 校验并收尾：对齐桌面版网页登录成功后的 finishLogin 流程 */
  const settle = useCallback(async () => {
    if (settledRef.current) return;
    settledRef.current = true;
    stopPolling();
    setPhase('finishing');
    setErrMsg('');
    const ok = await finishLogin();
    if (ok) {
      nav.goBack();
      return;
    }
    // 校验失败：提示并等待用户在页面内重新登录（页面再导航时恢复轮询）
    settledRef.current = false;
    setPhase('polling');
    setErrMsg('登录状态校验失败，请在页面内重新登录');
  }, [nav, stopPolling]);

  /** 开始轮询原生 cookie 罐（幂等：已有轮询则不重复起） */
  const startPolling = useCallback(() => {
    if (timerRef.current || settledRef.current) return;
    timerRef.current = setInterval(async () => {
      try {
        const cookies = await CookieManager.get(LOGIN_URL, true);
        const musicU = cookies?.MUSIC_U?.value;
        if (!musicU) return;
        const patch: Record<string, string> = {};
        for (const key of COOKIE_KEYS) {
          const hit = cookies[key];
          if (hit?.value) patch[key] = hit.value;
        }
        mergeSession(patch);
        void settle();
      } catch {
        // 单次轮询失败忽略，等下一拍
      }
    }, 1000);
  }, [settle]);

  useEffect(() => {
    let mounted = true;
    // 打开前清空原生 cookie 罐，避免残留 cookie 干扰（对齐桌面版清 partition）
    // app 业务请求走 fetch 直连、不经原生 cookie 罐，clearAll 无副作用
    CookieManager.clearAll(true)
      .catch(() => {})
      .finally(() => {
        if (!mounted) return;
        setPhase('polling');
        startPolling();
      });
    return () => {
      mounted = false;
      stopPolling();
    };
  }, [startPolling, stopPolling]);

  return (
    <View style={[s.wrap, { paddingTop: insets.top + 8 }]}>
      <View style={s.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={8} disabled={phase === 'finishing'}>
          <Text style={s.backText}>← 关闭</Text>
        </Pressable>
        <Text style={s.title}>网易云网页登录</Text>
        <View style={s.headerSpacer} />
      </View>
      {errMsg ? <Text style={s.err}>{errMsg}</Text> : null}
      <View style={s.webWrap}>
        <WebView
          source={{ uri: LOGIN_URL }}
          userAgent={FAKE_UA}
          applicationNameForUserAgent={FAKE_UA}
          startInLoadingState
          onLoadStart={() => {
            // 用户在页面内重新操作（含校验失败后重试登录）时恢复轮询
            if (phase !== 'finishing') startPolling();
          }}
          renderLoading={() => (
            <View style={s.loadingMask}>
              <ActivityIndicator size="large" color={t.accent} />
              <Text style={s.loadingText}>正在打开网易云登录页…</Text>
            </View>
          )}
        />
        {phase === 'finishing' ? (
          <View style={s.loadingMask}>
            <ActivityIndicator size="large" color={t.accent} />
            <Text style={s.loadingText}>检测到登录成功，正在校验…</Text>
          </View>
        ) : null}
      </View>
      <Text style={s.note}>在页面内完成登录（扫码或手机验证均可），App 会自动检测到登录成功。</Text>
    </View>
  );
}

const useStyles = (t: Palette) =>
  StyleSheet.create({
    wrap: { flex: 1, backgroundColor: t.bg, paddingHorizontal: 12 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
    backText: { fontSize: 15, color: t.text2 },
    title: { fontSize: 16, fontWeight: '700', color: t.text },
    headerSpacer: { width: 44 },
    err: { fontSize: 13, color: t.danger, marginBottom: 6, textAlign: 'center' },
    webWrap: { flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
    loadingMask: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.bg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    loadingText: { fontSize: 13, color: t.text3 },
    note: { fontSize: 12, color: t.text4, textAlign: 'center', marginTop: 10, marginBottom: 4, lineHeight: 18 },
  });
