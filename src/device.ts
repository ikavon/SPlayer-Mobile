/**
 * 设备指纹持久化：让 ncm-core 的 deviceId 跨重启稳定。
 *
 * 背景：ncm-core 的 device.ts 用模块级 `let deviceId = generate()`，进程启动即随机生成，
 * 冷启动后必然变化。桌面版 SPlayer-Next 把 deviceId 写进 SQLite session、跨重启恢复，
 * NCM 视为同一台"老设备"；移动版每次冷启动都是新 deviceId，NCM 每次都判"新设备登录"，
 * 反复重试会触发"请确认是否本人账号"(8860) 之类登录风控并逐次升级。
 *
 * 对齐桌面版：启动时从 AsyncStorage 恢复 deviceId，没有则生成并落盘。
 * 登录链路（captchaSent/loginCellphone）调用前 await 一次，确保请求带上稳定设备指纹。
 * 非登录接口风控宽松，不强求就绪。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { regenerateDeviceId, setDeviceId } from '../packages/ncm-core/src';

const KEY = 'ncm_device_id';

let bootPromise: Promise<void> | null = null;

/**
 * 幂等启动：从 AsyncStorage 恢复 deviceId，没有则生成新的并持久化。
 * 多次调用复用同一个 Promise，绝不重复生成或覆盖已有值。
 */
export const bootDeviceId = (): Promise<void> => {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) {
      setDeviceId(stored);
    } else {
      const id = regenerateDeviceId();
      await AsyncStorage.setItem(KEY, id);
    }
  })();
  return bootPromise;
};
