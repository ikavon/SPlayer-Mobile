import { create } from 'zustand';

/**
 * 非持久化实时状态：睡眠定时倒计时（每秒更新）。
 * 与 store.ts 的持久层分离——倒计时每秒 set 若走 persist 会每秒写 AsyncStorage，故单列此 store。
 */
export const useLive = create<{
  /** 剩余秒（0=未开启/已到期） */
  sleepRemain: number;
  /** 是否开启中 */
  sleepActive: boolean;
  setSleepLive: (remain: number, active: boolean) => void;
}>((set) => ({
  sleepRemain: 0,
  sleepActive: false,
  setSleepLive: (remain, active) => set({ sleepRemain: remain, sleepActive: active }),
}));
