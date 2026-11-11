const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// ncm-core 源码已拷贝进 app/packages/ncm-core（见 src/ncm.ts 注释），位于 app 项目根内，
// Metro 默认监听即可，无需跨目录 watchFolders。
// 运行时依赖（bn.js/crypto-js/pako）已装进 app/node_modules。
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
];

module.exports = config;
