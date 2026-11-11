# 构建 dev-client

track-player、expo-file-system 是原生模块，Expo Go 装不了，必须打 dev-client。
**日常改 JS 不用重打**：dev-client 装好后 `npx expo start --dev-client` 连 Metro 热更即可。
**改了 app.json 或增删原生模块才需要重打**（当前待重打项：`userInterfaceStyle: automatic` 深色跟随）。

项目锁定 Expo SDK 52 / RN 0.76.9 / Old Architecture（track-player 4.x 不支持 New Arch，勿升）。

## 路线 A：EAS Build（云端，推荐；本机无本地安卓工具链）

```bash
cd app
npx eas login                                    # 首次：Expo 账号（projectId 已配在 app.json）
npx eas build --profile development --platform android
# 云构建 ~10-20min，完成后网页给 APK 下载链接（或 npx eas build:list 查）
```

装上 APK 后：

```bash
npx expo start --dev-client   # 手机扫码连 Metro，加载本机 JS
```

连不上 expo.dev 时按本机代理约定：`HTTPS_PROXY=http://127.0.0.1:26561` 再跑。
iOS 需 Apple Developer 账号，`--platform ios` 首次会引导 EAS 托管签名。

## 路线 B：本地构建（需 Android Studio + JDK 17 + SDK + NDK；本机目前是 JDK 8，不可用）

```bash
cd app
npx expo prebuild            # 生成 android/，自动 link 原生模块
npx expo run:android         # 构建+装到连接的设备（或 cd android && ./gradlew assembleDebug）
```

## 跑起来后验证清单

- [ ] 首页加载推荐歌单（`api.personalized` 直连 NCM）
- [ ] 点歌单→点歌→`playSongsAt` 解析 NCM CDN 链接并播放
- [ ] Player 页 播/暂停 + 进度正常
- [ ] 切后台音频继续 + 锁屏有媒体控制（track-player）
- [ ] 播一首 VIP/锁区歌 → 命中解锁源池回退（Player 页"音源"显示"解锁源"）
- [ ] 下载离线：播放页 ⬇ 下载 → 飞行模式下"我的→已下载"仍可播；🗑 删除同步清文件与记录
- [ ] 深色模式跟随系统（重打 dev-client 后生效）
- [ ] 我喜欢的音乐 / 已下载 计数与列表一致
- [ ] 一键巡检解锁源池：`cd ../packages/ncm-core && npm run test:unblock`
      （test/ 在外层副本 SPlayer-Mobile/packages/ncm-core；app 内活副本无 test 目录）

## 项目特定注意

- **Old Architecture**：`app.json` 已设 `newArchEnabled:false`，勿改回，否则 track-player 崩。
- **原生模块清单**：react-native-track-player 4.1.2、expo-file-system ~18.0.12。
  状态持久化用 AsyncStorage（纯 JS，早期 mmkv 方案已弃用，无 patches 目录）。
- **ncm-core 位置**：源码在 `app/packages/ncm-core`（EAS 上传范围=app/，跨目录引用会让云端
  bundle 找不到模块）。Metro 默认监听即可，无需 watchFolders。外层
  `SPlayer-Mobile/packages/ncm-core` 是旧工作副本（test/ 在那），改动以 app 内为准。
- **首次原生编译**：track-player 拉 C++ 源码较慢（EAS ~10-20min）。
