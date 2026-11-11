# SPlayer Mobile

第三方网易云音乐 Android 客户端，基于 **React Native + Expo SDK 52**。

> **非官方项目**，与网易云音乐官方无关，仅供学习交流使用。

## 出处与许可

本项目是 [SPlayer](https://github.com/imsyy/SPlayer) / [SPlayer-Next](https://github.com/imsyy/SPlayer-Next) 的衍生作品：

- `packages/ncm-core`（网易云直连核心：加解密 / 请求 / 会话 / 解锁源池）**移植自 SPlayer-Next** 的 `electron/main/apis/netease`，将 `node:crypto`/`node:zlib` 改写为纯 JS（bn.js + crypto-js + pako），算法与原版逐字节一致（见 `test/parity.test.ts` 对拍）。
- 界面设计参考 SPlayer 桌面版。

上游均为 **AGPL-3.0**，故本项目整体以 **AGPL-3.0** 开源（见 [LICENSE](./LICENSE)）。各移植文件头部保留了来源与修改说明。

## 功能

- 登录：官方网页登录（WebView 抓 cookie）/ 短信验证码 / 手动 Cookie，会话保活与统一校验
- 搜索：单曲 / 歌单 / 歌手 / 专辑，联想补全，分类懒加载
- 播放：在线解析 + VIP/锁区公益解锁源回退，离线下载播放，倍速、睡眠定时
- 歌词：逐字高亮（YRC）、翻译、桌面/锁屏歌词
- 队列：顺序 / 循环 / 单曲 / 随机，下一首插队、删除、拖动定位
- 收藏：我喜欢的音乐、歌单 / 专辑 / 歌手收藏，自建歌单管理
- 本地：播放历史、听歌排行、下载管理
- 主题：明暗跟随系统、主题色自定义

## 技术栈

- Expo SDK 52 / React Native 0.76.9（Old Architecture）
- 状态：zustand + AsyncStorage
- 播放：react-native-track-player 4.x
- 核心层：`packages/ncm-core`（纯 JS，RN 可用）

## 开发

需要 dev-client（含原生模块，Expo Go 无法运行）：

```bash
npm install
npx eas build --profile development --platform android   # 云构建 dev-client APK
# 安装 APK 后：
npx expo start --dev-client                              # 手机连 Metro 热更
```

详见 [BUILD.md](./BUILD.md)。

## 测试

```bash
cd packages/ncm-core
npm install
npm run test:parity     # 加解密与原版对拍（离线）
npm run test:unblock    # 解锁源池巡检（联网）
```

## 正式版下载

见 [Releases](https://github.com/ikavon/SPlayer-Mobile/releases)（签名 APK，可直接安装）。

## 隐私说明

- 登录凭据（MUSIC_U 等 cookie）仅存储于本机应用私有目录，不上传任何第三方服务器。
- VIP/锁区回退使用的解锁源为第三方公益 API，解析时会向其发送歌曲 ID。

## License

[AGPL-3.0](./LICENSE)
