/**
 * 登录页（对齐桌面版 SPlayer-Next 登录方案）：
 * - 官方网页登录（主入口，WebView 抓 MUSIC_U，见 WebLogin.tsx）
 * - 手动粘贴 cookie（对齐桌面版 LoginCookieDialog）
 * - 手机号+短信验证码（移动端兜底；二维码在单设备场景被风控拦截，不提供）
 *
 * 三种方式成功后统一走 finishLogin（loginStatus 校验收口）。
 * 登录类接口绝不带 realIP（触发风控）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, cookieToJson } from '../ncm';
import { finishLogin, logoutNetease } from '../auth';
import { mergeSession, parseSetCookie } from '../session';
import { bootDeviceId } from '../device';
import { useStore } from '../store';
import { useTheme, type Palette } from '../theme';
import type { RootStackParamList } from '../nav';

type Phase = 'idle' | 'sending' | 'sent' | 'logging' | 'done' | 'error';
type Method = 'sms' | 'cookie';

export default function Login() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const musicU = useStore((s) => s.musicU);
  const account = useStore((s) => s.account);
  const insets = useSafeAreaInsets();

  const [method, setMethod] = useState<Method>('sms');
  const [phone, setPhone] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [cookieRaw, setCookieRaw] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      // 登录成功 600ms 自动返回前用户手动返回 → 不再多弹一层
      if (backTimer.current) clearTimeout(backTimer.current);
    };
  }, []);

  const startCountdown = useCallback(() => {
    setCountdown(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  /** 登录成功统一收口：写会话 → loginStatus 校验 → 返回 */
  const settle = useCallback(async (): Promise<boolean> => {
    const ok = await finishLogin();
    if (ok) {
      setPhase('done');
      backTimer.current = setTimeout(() => nav.goBack(), 600);
      return true;
    }
    setErrMsg('登录状态校验失败：cookie 无效或已过期');
    return false;
  }, [nav]);

  /** 发送验证码 */
  const sendCaptcha = useCallback(async () => {
    await bootDeviceId();
    const p = phone.trim();
    if (!/^\d{5,}$/.test(p)) {
      setErrMsg('请输入正确的手机号');
      return;
    }
    setErrMsg('');
    setPhase('sending');
    try {
      const r = await api.captchaSent({ phone: p, ctcode: '86' });
      const code = (r.body as { code?: number }).code;
      if (code === 200) {
        setPhase('sent');
        startCountdown();
      } else {
        setPhase('error');
        setErrMsg(`发送失败（code ${code}）`);
      }
    } catch (e) {
      setPhase('error');
      setErrMsg(e instanceof Error ? e.message : '发送失败');
    }
  }, [phone, startCountdown]);

  /** 用验证码登录 */
  const doLogin = useCallback(async () => {
    await bootDeviceId();
    const p = phone.trim();
    if (!p) {
      setErrMsg('请输入手机号');
      return;
    }
    if (!captcha.trim()) {
      setErrMsg('请输入验证码');
      return;
    }
    setErrMsg('');
    setPhase('logging');
    try {
      const r = await api.loginCellphone({ phone: p, captcha: captcha.trim(), countrycode: '86' });
      const body = r.body as { code?: number; token?: string };
      if (body.code !== 200) {
        setPhase('sent');
        setErrMsg(`登录失败（code ${body.code}）`);
        return;
      }
      // NCM 手机号登录：MUSIC_U 在响应 body.token 里（不在 Set-Cookie 头），
      // 与响应 set-cookie（__csrf 等）一起写回会话（对齐桌面版 SESSION_MUTATING 语义）
      const u = body.token;
      if (!u) {
        setPhase('sent');
        setErrMsg('未拿到登录态 token');
        return;
      }
      mergeSession({ MUSIC_U: u, ...parseSetCookie(r.cookie ?? []) });
      if (!(await settle())) setPhase('sent');
    } catch (e) {
      setPhase('sent');
      setErrMsg(e instanceof Error ? e.message : '登录失败');
    }
  }, [phone, captcha, settle]);

  /** 手动粘贴 cookie 登录（对齐桌面版 LoginCookieDialog） */
  const doCookieLogin = useCallback(async () => {
    const raw = cookieRaw.trim();
    if (!raw || !/MUSIC_U\s*=/i.test(raw)) {
      setErrMsg('cookie 无效：必须包含 MUSIC_U');
      return;
    }
    setErrMsg('');
    setPhase('logging');
    try {
      mergeSession(cookieToJson(raw));
      if (!(await settle())) {
        setPhase('idle');
      }
    } catch (e) {
      setPhase('idle');
      setErrMsg(e instanceof Error ? e.message : '登录失败');
    }
  }, [cookieRaw, settle]);

  /** 退出登录（服务端登出 + 清本地会话） */
  const doLogout = useCallback(() => {
    void logoutNetease();
  }, []);

  // 已登录视图
  if (musicU) {
    return (
      <View style={[s.wrap, { paddingTop: insets.top + 12 }]}>
        <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
          <Text style={s.backText}>← 返回</Text>
        </Pressable>
        <View style={s.loggedCard}>
          {account?.avatarUrl ? (
            <Image source={{ uri: account.avatarUrl }} style={s.avatar} />
          ) : (
            <View style={[s.avatar, { backgroundColor: t.placeholder, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 28 }}>👤</Text>
            </View>
          )}
          <Text style={s.nick}>{account?.nickname ?? '已登录'}</Text>
          <Text style={s.sub}>网易云账号已登录</Text>
          <Pressable style={s.logoutBtn} onPress={doLogout}>
            <Text style={s.logoutText}>退出登录</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // 登录视图：KeyboardAvoidingView + ScrollView，小屏键盘弹出不再盖住验证码框/登录按钮
  return (
    <KeyboardAvoidingView
      style={[s.wrap, { paddingTop: insets.top + 12 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable style={s.backBtn} onPress={() => nav.goBack()} hitSlop={8}>
        <Text style={s.backText}>← 返回</Text>
      </Pressable>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={s.title}>网易云登录</Text>

      {/* 主入口：官方网页登录（对齐桌面版自动获取） */}
      <Pressable style={s.webBtn} onPress={() => nav.navigate('WebLogin')}>
        <Text style={s.webBtnText}>官方网页登录（推荐）</Text>
        <Text style={s.webBtnSub}>打开网易云登录页，登录成功自动同步</Text>
      </Pressable>

      {/* 其他方式切换 */}
      <View style={s.methodRow}>
        <Pressable
          style={[s.methodTab, method === 'sms' && s.methodTabActive]}
          onPress={() => { setMethod('sms'); setErrMsg(''); }}
        >
          <Text style={[s.methodTabText, method === 'sms' && s.methodTabTextActive]}>短信验证码</Text>
        </Pressable>
        <Pressable
          style={[s.methodTab, method === 'cookie' && s.methodTabActive]}
          onPress={() => { setMethod('cookie'); setErrMsg(''); }}
        >
          <Text style={[s.methodTabText, method === 'cookie' && s.methodTabTextActive]}>Cookie 登录</Text>
        </Pressable>
      </View>

      {method === 'sms' ? (
        <View>
          <View style={s.field}>
            <Text style={s.label}>手机号</Text>
            <View style={s.phoneRow}>
              <Text style={s.ctcode}>+86</Text>
              <TextInput
                style={s.input}
                placeholder="请输入手机号"
                placeholderTextColor={t.text4}
                value={phone}
                onChangeText={setPhone}
                keyboardType="number-pad"
                autoComplete="tel"
              />
            </View>
          </View>

          <View style={s.field}>
            <Text style={s.label}>验证码</Text>
            <View style={s.codeRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="短信验证码"
                placeholderTextColor={t.text4}
                value={captcha}
                onChangeText={setCaptcha}
                keyboardType="number-pad"
                autoComplete="sms-otp"
              />
              <Pressable
                style={[s.codeBtn, (countdown > 0 || phase === 'sending') && s.codeBtnDisabled]}
                disabled={countdown > 0 || phase === 'sending' || phase === 'logging'}
                onPress={sendCaptcha}
              >
                <Text style={s.codeBtnText}>
                  {phase === 'sending' ? '发送中…' : countdown > 0 ? `${countdown}s` : '获取验证码'}
                </Text>
              </Pressable>
            </View>
          </View>

          {errMsg ? <Text style={s.err}>{errMsg}</Text> : null}

          <Pressable
            style={[s.loginBtn, phase === 'logging' && s.loginBtnDisabled]}
            disabled={phase === 'logging' || phase === 'done'}
            onPress={doLogin}
          >
            <Text style={s.loginBtnText}>
              {phase === 'logging' ? '登录中…' : phase === 'done' ? '登录成功' : '登录'}
            </Text>
          </Pressable>

          <Text style={s.note}>
            验证码登录，单设备内完成。{phase === 'sent' ? '验证码已发送，请查收短信。' : ''}
          </Text>
        </View>
      ) : (
        <View>
          <View style={s.field}>
            <Text style={s.label}>Cookie</Text>
            <TextInput
              style={[s.input, s.cookieInput]}
              placeholder={'粘贴含 MUSIC_U 的 cookie 串\n可从浏览器开发者工具复制'}
              placeholderTextColor={t.text4}
              value={cookieRaw}
              onChangeText={setCookieRaw}
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {errMsg ? <Text style={s.err}>{errMsg}</Text> : null}

          <Pressable
            style={[s.loginBtn, phase === 'logging' && s.loginBtnDisabled]}
            disabled={phase === 'logging' || phase === 'done'}
            onPress={doCookieLogin}
          >
            <Text style={s.loginBtnText}>
              {phase === 'logging' ? '登录中…' : phase === 'done' ? '登录成功' : '使用 Cookie 登录'}
            </Text>
          </Pressable>

          <Text style={s.note}>需包含 MUSIC_U 字段；cookie 失效后需重新获取。</Text>
        </View>
      )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = (t: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: t.bg, paddingHorizontal: 24, paddingTop: 16 },
  backBtn: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 15, color: t.text2 },
  title: { fontSize: 22, fontWeight: '700', color: t.text, textAlign: 'center', marginTop: 8, marginBottom: 24 },
  webBtn: { backgroundColor: t.accent, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center', marginBottom: 20 },
  webBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  webBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 4 },
  methodRow: { flexDirection: 'row', borderRadius: 10, backgroundColor: t.cardAlt, padding: 3, marginBottom: 18 },
  methodTab: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  methodTabActive: { backgroundColor: t.bg, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  methodTabText: { fontSize: 13, color: t.text3 },
  methodTabTextActive: { color: t.text, fontWeight: '600' },
  field: { marginBottom: 20 },
  label: { fontSize: 13, color: t.text3, marginBottom: 8 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 12 },
  ctcode: { fontSize: 15, color: t.text, fontWeight: '600', paddingRight: 10, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: t.border, marginRight: 10 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: t.text },
  cookieInput: { borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 12, minHeight: 110, fontSize: 13 },
  codeBtn: { paddingHorizontal: 14, paddingVertical: 12, backgroundColor: t.cardAlt, borderRadius: 10, minWidth: 96, alignItems: 'center' },
  codeBtnDisabled: { opacity: 0.5 },
  codeBtnText: { fontSize: 13, color: t.accent, fontWeight: '600' },
  err: { fontSize: 13, color: t.danger, marginBottom: 12 },
  loginBtn: { backgroundColor: t.accent, borderRadius: 24, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  note: { fontSize: 12, color: t.text4, textAlign: 'center', marginTop: 16, lineHeight: 18 },
  loggedCard: { alignItems: 'center', marginTop: 40 },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 16 },
  nick: { fontSize: 20, fontWeight: '700', color: t.text },
  sub: { fontSize: 13, color: t.text3, marginTop: 6 },
  logoutBtn: { marginTop: 32, paddingHorizontal: 32, paddingVertical: 12, backgroundColor: t.cardAlt, borderRadius: 22 },
  logoutText: { color: t.danger, fontSize: 15, fontWeight: '600' },
});
