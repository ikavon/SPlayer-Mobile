/**
 * 从桌面版 logo.svg 生成移动版全套图标（主题绿配色）。
 *   橘红 #F55E55 → 主题绿 #1db954
 *   浅粉 #F9BBB8 → 浅绿 #7fdcb4
 *
 * 跑法：node scripts/generate-icons.js
 */
const { Resvg } = require('@resvg/resvg-js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC_SVG = path.resolve(__dirname, '../../../SPlayer-dev/public/icons/logo.svg');
const ASSETS = path.resolve(__dirname, '../assets');

const GREEN = '#1db954';
const GREEN_LIGHT = '#7fdcb4';
const BG_TINT = '#eafaf0';

// 改色 svg
let svg = fs.readFileSync(SRC_SVG, 'utf8');
svg = svg.replaceAll('#F55E55', GREEN).replaceAll('#F9BBB8', GREEN_LIGHT);

// resvg 渲染 svg → png buffer（透明底，图案本身不透明）
const render = (width) => {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: 'transparent',
  });
  return resvg.render().asPng();
};

// 单色（白）svg，用于 monochrome
const whiteSvg = svg.replaceAll(GREEN, '#ffffff').replaceAll(GREEN_LIGHT, '#e8e8e8');
const renderMono = (width) => {
  const resvg = new Resvg(whiteSvg, {
    fitTo: { mode: 'width', value: width },
    background: 'transparent',
  });
  return resvg.render().asPng();
};

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
// 图案缩到 660 居中于 1024，边距 182（adaptive icon 安全区）
const PAD = Math.round((1024 - 660) / 2); // 182

(async () => {
  const logo1024 = render(1024);
  console.log('  logo1024 尺寸:', (await sharp(logo1024).metadata()).width);

  // icon.png: 白底 + 唱片 1024（flatten 把透明底转白）
  await sharp(logo1024).flatten({ background: '#ffffff' }).png()
    .toFile(path.join(ASSETS, 'icon.png'));
  console.log('✓ icon.png (1024, 白底+绿唱片)');

  // adaptive foreground: 唱片缩 660 + 透明边距居中 → 512（分步避免链式顺序坑）
  const fg660 = await sharp(logo1024).resize(660, 660).toBuffer();
  const fg1024 = await sharp(fg660)
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: TRANSPARENT })
    .toBuffer();
  await sharp(fg1024).resize(512, 512).png()
    .toFile(path.join(ASSETS, 'android-icon-foreground.png'));
  console.log('✓ android-icon-foreground.png (512, 透明底+唱片居中)');

  // adaptive background: 纯色 512
  await sharp({ create: { width: 512, height: 512, channels: 4, background: BG_TINT } })
    .png()
    .toFile(path.join(ASSETS, 'android-icon-background.png'));
  console.log('✓ android-icon-background.png (512, 浅绿白)');

  // monochrome: 白色单色唱片 透明边距 → 432（分步）
  const mono1024 = renderMono(1024);
  const mono660 = await sharp(mono1024).resize(660, 660).toBuffer();
  const monoPadded = await sharp(mono660)
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: TRANSPARENT })
    .toBuffer();
  await sharp(monoPadded).resize(432, 432).png()
    .toFile(path.join(ASSETS, 'android-icon-monochrome.png'));
  console.log('✓ android-icon-monochrome.png (432, 白色单色透明底)');

  // splash-icon: 1024 白底
  await sharp(logo1024).flatten({ background: '#ffffff' }).png()
    .toFile(path.join(ASSETS, 'splash-icon.png'));
  console.log('✓ splash-icon.png (1024)');

  // favicon: 48
  await sharp(logo1024).flatten({ background: '#ffffff' }).resize(48, 48).png()
    .toFile(path.join(ASSETS, 'favicon.png'));
  console.log('✓ favicon.png (48)');

  console.log('全部生成完成');
})().catch((e) => { console.error('生成失败:', e); process.exit(1); });
