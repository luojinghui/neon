import type { DoodleTemplate, DoodleTemplateId, DoodleTheme, DoodleThemeId } from './types';

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1440;
const PHOTO_WHITENING = 0.045;

export const DOODLE_THEMES: DoodleTheme[] = [
  { id: 'sun-pop', name: '日光波普', primary: '#FFD84D', secondary: '#FF7BA8', ink: '#1F1A17', accent: '#FFF9E8' },
  { id: 'berry-zap', name: '莓果闪电', primary: '#FF6B91', secondary: '#8B74FF', ink: '#20182D', accent: '#FFF4A8' },
  { id: 'blue-hour', name: '蓝调出逃', primary: '#67D9FF', secondary: '#FF9D57', ink: '#17212B', accent: '#FFF3DF' },
  { id: 'mint-party', name: '薄荷派对', primary: '#79E7C2', secondary: '#FF84A8', ink: '#16251F', accent: '#FFF36C' },
  { id: 'lemon-soda', name: '柠檬汽水', primary: '#F6F04D', secondary: '#62D8FF', ink: '#172126', accent: '#FFFFFF' },
  { id: 'grape-dream', name: '葡萄梦境', primary: '#B899FF', secondary: '#FF91C8', ink: '#251836', accent: '#FFF18A' },
  { id: 'peach-fizz', name: '蜜桃气泡', primary: '#FFB08A', secondary: '#FF6D8E', ink: '#34201B', accent: '#FFF5D7' },
  { id: 'night-neon', name: '霓虹夜游', primary: '#22233B', secondary: '#00E0B8', ink: '#11111B', accent: '#FFF05A' }
];

export const DOODLE_TEMPLATES: DoodleTemplate[] = [
  { id: 'comic-cover', name: '气泡漫画', description: '对白气泡压住画面' },
  { id: 'instant-film', name: '斜拍胶片', description: '倾斜相纸与手写感' },
  { id: 'hero-poster', name: '主角海报', description: '全幅肖像与巨型标题' },
  { id: 'sticker-book', name: '贴纸派对', description: '圆形头像与胶带标签' },
  { id: 'magazine-pop', name: '潮流杂志', description: '封面排版与撞色标题' },
  { id: 'split-zine', name: '拼贴小志', description: '左右分栏大胆留白' },
  { id: 'orbit-badge', name: '星轨徽章', description: '圆形肖像与环绕轨道' },
  { id: 'arcade-ticket', name: '电玩票根', description: '像素棋盘与玩家铭牌' }
];

export const DOODLE_TITLES = [
  '今天是摸鱼勇者',
  '宇宙级发呆冠军',
  '好运信号接收员',
  '周末提前体验官',
  '反内耗巡逻队长',
  '今日闪耀限定角色',
  '灵感暴走艺术家',
  '猫耳星球特派员',
  '快乐能量补给官',
  '银河系松弛代表',
  '不赶时间探险家',
  '今日份可爱主理人',
  '地球限定开心果',
  '下班信号发射员',
  '奶茶能量鉴定师',
  '快乐废话收藏家',
  '气氛组常驻嘉宾',
  '人间清醒体验卡',
  '好运加载进度 99%',
  '银河早餐研究员',
  '烦恼退散魔法师',
  '可爱超标观察员',
  '脑洞星系领航员',
  '松弛感野生代言人',
  '随机浪漫制造机',
  '今日宜大胆做梦',
  '情绪稳定练习生',
  '宇宙夸夸小队长',
  '晚点再说执行官',
  '阳光库存管理员',
  '平凡生活冒险王',
  '被好运偷偷选中'
];

type PosterOptions = {
  title: string;
  themeId: DoodleThemeId;
  templateId: DoodleTemplateId;
  createdAt?: Date;
  qrSource?: CanvasImageSource | null;
};

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(source, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function blendCartoonChannel(
  channel: number,
  originalChannel: number,
  luminance: number,
  saturation: number,
  luminanceShift: number,
  edgeStrength: number,
  ink: number
) {
  const detailed = channel * 0.82 + originalChannel * 0.18;
  const toned = luminance + (detailed - luminance) * saturation + luminanceShift;
  const lightlyWhitened = toned * (1 - PHOTO_WHITENING) + 255 * PHOTO_WHITENING;
  return clampByte(lightlyWhitened * (1 - edgeStrength) + ink * edgeStrength);
}

function cartoonize(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
) {
  const canvas = document.createElement('canvas');
  const processScale = 620 / Math.max(targetWidth, targetHeight);
  canvas.width = Math.max(1, Math.round(targetWidth * processScale));
  canvas.height = Math.max(1, Math.round(targetHeight * processScale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('当前浏览器无法处理图片');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  drawCover(context, source, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

  const original = context.getImageData(0, 0, canvas.width, canvas.height);
  const smoothCanvas = document.createElement('canvas');
  smoothCanvas.width = canvas.width;
  smoothCanvas.height = canvas.height;
  const smoothContext = smoothCanvas.getContext('2d', { willReadFrequently: true });
  if (!smoothContext) throw new Error('当前浏览器无法处理图片');
  smoothContext.imageSmoothingEnabled = true;
  smoothContext.imageSmoothingQuality = 'high';
  smoothContext.filter = 'blur(1.25px) saturate(1.04) contrast(1.03)';
  smoothContext.drawImage(canvas, 0, 0);

  const image = smoothContext.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  const originalPixels = original.data;
  const luma = new Float32Array(canvas.width * canvas.height);
  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    luma[pixel] = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
  }

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const pixel = y * canvas.width + x;
      const index = pixel * 4;
      const left = Math.max(0, x - 1);
      const right = Math.min(canvas.width - 1, x + 1);
      const top = Math.max(0, y - 1);
      const bottom = Math.min(canvas.height - 1, y + 1);
      const topLeft = luma[top * canvas.width + left];
      const topCenter = luma[top * canvas.width + x];
      const topRight = luma[top * canvas.width + right];
      const middleLeft = luma[y * canvas.width + left];
      const middleRight = luma[y * canvas.width + right];
      const bottomLeft = luma[bottom * canvas.width + left];
      const bottomCenter = luma[bottom * canvas.width + x];
      const bottomRight = luma[bottom * canvas.width + right];
      const gradientX = -topLeft + topRight - 2 * middleLeft + 2 * middleRight - bottomLeft + bottomRight;
      const gradientY = -topLeft - 2 * topCenter - topRight + bottomLeft + 2 * bottomCenter + bottomRight;
      const gradient = Math.hypot(gradientX, gradientY);
      const edgeStrength = Math.min(0.72, Math.max(0, (gradient - 105) / 280));

      const luminance = luma[pixel];
      const liftedLuminance = 255 * Math.pow(luminance / 255, 0.92);
      const quantizedLuminance = Math.round(liftedLuminance / 24) * 24;
      const luminanceShift = quantizedLuminance - luminance;
      const saturation = luminance < 52 ? 0.94 : 1.08;

      pixels[index] = blendCartoonChannel(pixels[index], originalPixels[index], luminance, saturation, luminanceShift, edgeStrength, 31);
      pixels[index + 1] = blendCartoonChannel(pixels[index + 1], originalPixels[index + 1], luminance, saturation, luminanceShift, edgeStrength, 26);
      pixels[index + 2] = blendCartoonChannel(pixels[index + 2], originalPixels[index + 2], luminance, saturation, luminanceShift, edgeStrength, 23);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function drawStar(context: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, color: string, rotation = 0) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 10;
  context.strokeStyle = '#1F1A17';
  context.stroke();
  context.restore();
}

function drawLightning(context: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string) {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.beginPath();
  context.moveTo(42, 0);
  context.lineTo(0, 72);
  context.lineTo(35, 68);
  context.lineTo(12, 136);
  context.lineTo(86, 48);
  context.lineTo(48, 52);
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 8;
  context.lineJoin = 'round';
  context.strokeStyle = '#1F1A17';
  context.stroke();
  context.restore();
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replaceAll('/', '.');
}

type PosterFrame = { x: number; y: number; width: number; height: number; radius: number; rotation?: number };

type TitleBlockOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  align?: CanvasTextAlign;
  maxSize?: number;
  minSize?: number;
  maxLines?: number;
  rotation?: number;
};

function withRotation(context: CanvasRenderingContext2D, centerX: number, centerY: number, rotation: number, draw: () => void) {
  context.save();
  context.translate(centerX, centerY);
  context.rotate(rotation);
  context.translate(-centerX, -centerY);
  draw();
  context.restore();
}

function drawPanel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke = '',
  lineWidth = 0,
  shadow = ''
) {
  context.save();
  if (shadow) {
    context.shadowColor = shadow;
    context.shadowBlur = 0;
    context.shadowOffsetX = 12;
    context.shadowOffsetY = 14;
  }
  roundedRect(context, x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  context.shadowColor = 'transparent';
  if (stroke && lineWidth > 0) {
    context.lineWidth = lineWidth;
    context.strokeStyle = stroke;
    context.stroke();
  }
  context.restore();
}

function splitTitle(title: string, maxLines: number) {
  const characters = Array.from(title.trim());
  if (characters.length <= 7 || maxLines === 1) return [characters.join('')];
  const lineCount = Math.min(maxLines, characters.length > 14 ? 3 : 2);
  const perLine = Math.ceil(characters.length / lineCount);
  const lines: string[] = [];
  for (let index = 0; index < characters.length; index += perLine) lines.push(characters.slice(index, index + perLine).join(''));
  return lines.slice(0, maxLines);
}

function drawTitleBlock(context: CanvasRenderingContext2D, title: string, options: TitleBlockOptions) {
  const lines = splitTitle(title, options.maxLines || 2);
  const maxSize = options.maxSize || 84;
  const minSize = options.minSize || 36;
  const lineHeightRatio = 1.04;
  let fontSize = maxSize;
  while (fontSize > minSize) {
    context.font = `900 ${fontSize}px "Arial Black", "PingFang SC", "Microsoft YaHei", sans-serif`;
    const widest = Math.max(...lines.map((line) => context.measureText(line).width));
    if (widest <= options.width && lines.length * fontSize * lineHeightRatio <= options.height) break;
    fontSize -= 2;
  }
  const align = options.align || 'left';
  const textX = align === 'center' ? options.x + options.width / 2 : align === 'right' ? options.x + options.width : options.x;
  const totalHeight = lines.length * fontSize * lineHeightRatio;
  withRotation(context, options.x + options.width / 2, options.y + options.height / 2, options.rotation || 0, () => {
    context.fillStyle = options.color;
    context.font = `900 ${fontSize}px "Arial Black", "PingFang SC", "Microsoft YaHei", sans-serif`;
    context.textAlign = align;
    context.textBaseline = 'top';
    lines.forEach((line, index) => context.fillText(line, textX, options.y + (options.height - totalHeight) / 2 + index * fontSize * lineHeightRatio, options.width));
  });
}

function drawBrand(context: CanvasRenderingContext2D, x: number, y: number, fill: string, color: string, rotation = -0.055) {
  withRotation(context, x + 122, y + 37, rotation, () => {
    drawPanel(context, x, y, 244, 74, 37, fill);
    context.fillStyle = color;
    context.font = '900 34px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('NEON · 漫游', x + 122, y + 39, 214);
  });
}

function drawMeta(context: CanvasRenderingContext2D, date: Date, x: number, y: number, color: string, align: CanvasTextAlign = 'left') {
  context.save();
  context.fillStyle = color;
  context.font = '800 24px Arial, sans-serif';
  context.textAlign = align;
  context.textBaseline = 'alphabetic';
  context.letterSpacing = '2px';
  context.fillText(`TODAY'S SOUL ROLE  /  ${formatDate(date)}`, x, y);
  context.restore();
}

function drawQrCard(
  context: CanvasRenderingContext2D,
  qrSource: CanvasImageSource | null | undefined,
  x: number,
  y: number,
  ink: string,
  rotation = 0
) {
  withRotation(context, x + 98, y + 109, rotation, () => {
    if (!qrSource) {
      drawPanel(context, x + 8, y + 152, 180, 54, 27, 'rgba(255,255,255,0.88)', ink, 5);
      context.fillStyle = ink;
      context.font = '900 20px Arial, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('NEON CAMERA', x + 98, y + 180, 150);
      return;
    }
    drawPanel(context, x, y, 196, 218, 24, '#FFFFFF', ink, 7, 'rgba(0,0,0,0.18)');
    context.drawImage(qrSource, x + 25, y + 17, 146, 146);
    context.fillStyle = ink;
    context.font = '800 18px "Arial Black", "PingFang SC", "Microsoft YaHei", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';
    context.fillText('扫码查看', x + 98, y + 196, 158);
  });
}

function drawPhotoFrame(
  context: CanvasRenderingContext2D,
  cartoon: HTMLCanvasElement,
  frame: PosterFrame,
  theme: DoodleTheme,
  borderWidth = 14
) {
  const rotation = frame.rotation || 0;
  withRotation(context, frame.x + frame.width / 2, frame.y + frame.height / 2, rotation, () => {
    context.save();
    roundedRect(context, frame.x, frame.y, frame.width, frame.height, frame.radius);
    context.clip();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(cartoon, frame.x, frame.y, frame.width, frame.height);
    context.globalCompositeOperation = 'soft-light';
    context.globalAlpha = 0.06;
    context.fillStyle = theme.secondary;
    context.fillRect(frame.x, frame.y, frame.width, frame.height);
    context.restore();
    if (borderWidth > 0) {
      roundedRect(context, frame.x, frame.y, frame.width, frame.height, frame.radius);
      context.lineWidth = borderWidth;
      context.strokeStyle = theme.ink;
      context.stroke();
    }
  });
}

function drawDots(context: CanvasRenderingContext2D, color: string, spacing = 40, alpha = 0.15) {
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  for (let y = 24; y < POSTER_HEIGHT; y += spacing) {
    for (let x = 22 + ((y / spacing) % 2) * 12; x < POSTER_WIDTH; x += spacing) {
      context.beginPath();
      context.arc(x, y, 3.6, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

function drawChecker(context: CanvasRenderingContext2D, y: number, height: number, colorA: string, colorB: string, size = 54) {
  for (let row = 0; row * size < height; row += 1) {
    for (let column = 0; column * size < POSTER_WIDTH; column += 1) {
      context.fillStyle = (row + column) % 2 === 0 ? colorA : colorB;
      context.fillRect(column * size, y + row * size, size, Math.min(size, height - row * size));
    }
  }
}

function readableText(background: string, darkText: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(background);
  if (!match) return darkText;
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
  return luminance < 0.42 ? '#FFFFFF' : darkText;
}

function drawCatDetails(context: CanvasRenderingContext2D, frame: PosterFrame, theme: DoodleTheme) {
  const left = frame.x + frame.width * 0.3;
  const right = frame.x + frame.width * 0.7;
  const top = frame.y - 60;
  context.fillStyle = theme.primary;
  context.strokeStyle = theme.ink;
  context.lineWidth = 14;
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(left - 70, frame.y + 20);
  context.lineTo(left, top);
  context.lineTo(left + 78, frame.y + 18);
  context.closePath();
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(right - 78, frame.y + 18);
  context.lineTo(right, top);
  context.lineTo(right + 70, frame.y + 20);
  context.closePath();
  context.fill();
  context.stroke();

  context.save();
  context.globalAlpha = 0.42;
  context.fillStyle = '#FF7398';
  context.beginPath();
  context.ellipse(frame.x + frame.width * 0.28, frame.y + frame.height * 0.69, 64, 28, -0.1, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.ellipse(frame.x + frame.width * 0.72, frame.y + frame.height * 0.69, 64, 28, 0.1, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function renderDoodlePoster(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, options: PosterOptions) {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法生成涂鸦');
  const theme = DOODLE_THEMES.find((item) => item.id === options.themeId) || DOODLE_THEMES[0];
  const template = DOODLE_TEMPLATES.find((item) => item.id === options.templateId) || DOODLE_TEMPLATES[0];
  const createdAt = options.createdAt || new Date();
  const primaryText = readableText(theme.primary, theme.ink);
  const secondaryText = readableText(theme.secondary, theme.ink);
  const accentText = readableText(theme.accent, theme.ink);
  const frames: Record<DoodleTemplateId, PosterFrame> = {
    'comic-cover': { x: 72, y: 112, width: 936, height: 1010, radius: 58 },
    'instant-film': { x: 145, y: 142, width: 790, height: 720, radius: 16, rotation: -0.045 },
    'hero-poster': { x: 0, y: 0, width: 1080, height: 1138, radius: 0 },
    'sticker-book': { x: 160, y: 154, width: 760, height: 760, radius: 380 },
    'magazine-pop': { x: 86, y: 112, width: 908, height: 1110, radius: 8 },
    'split-zine': { x: 406, y: 138, width: 634, height: 1030, radius: 42 },
    'orbit-badge': { x: 150, y: 168, width: 780, height: 780, radius: 390 },
    'arcade-ticket': { x: 110, y: 330, width: 860, height: 720, radius: 26 }
  };
  const frame = frames[template.id];
  const cartoon = cartoonize(source, sourceWidth, sourceHeight, frame.width, frame.height);

  if (template.id === 'comic-cover') {
    context.fillStyle = theme.primary;
    context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    context.fillStyle = theme.secondary;
    context.beginPath();
    context.moveTo(650, 0);
    context.lineTo(1080, 0);
    context.lineTo(1080, 700);
    context.closePath();
    context.fill();
    drawDots(context, theme.ink, 38, 0.14);
    drawPhotoFrame(context, cartoon, frame, theme, 18);
    drawCatDetails(context, frame, theme);
    drawPanel(context, 108, 866, 770, 184, 50, '#FFFFFF', theme.ink, 12, 'rgba(0,0,0,0.2)');
    context.fillStyle = '#FFFFFF';
    context.beginPath();
    context.moveTo(220, 1034);
    context.lineTo(178, 1100);
    context.lineTo(306, 1046);
    context.fill();
    context.strokeStyle = theme.ink;
    context.lineWidth = 12;
    context.stroke();
    drawTitleBlock(context, options.title, { x: 150, y: 888, width: 686, height: 136, color: theme.ink, maxSize: 70, maxLines: 2, align: 'center' });
    drawBrand(context, 68, 58, theme.ink, '#FFFFFF');
    drawStar(context, 962, 168, 50, 20, theme.accent, 0.2);
    drawLightning(context, 914, 870, 0.72, theme.accent);
    drawMeta(context, createdAt, 72, 1344, primaryText);
    drawQrCard(context, options.qrSource, 820, 1172, theme.ink, 0.025);
  } else if (template.id === 'instant-film') {
    context.fillStyle = theme.accent;
    context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    context.fillStyle = theme.secondary;
    context.beginPath();
    context.arc(130, 160, 210, 0, Math.PI * 2);
    context.arc(970, 1160, 290, 0, Math.PI * 2);
    context.fill();
    drawDots(context, theme.ink, 48, 0.11);
    withRotation(context, 540, 580, -0.045, () => {
      drawPanel(context, 92, 72, 896, 1050, 30, '#FFFDF7', theme.ink, 16, 'rgba(0,0,0,0.22)');
    });
    drawPhotoFrame(context, cartoon, frame, theme, 10);
    drawTitleBlock(context, options.title, { x: 166, y: 886, width: 730, height: 164, color: theme.ink, maxSize: 68, maxLines: 2, align: 'center', rotation: -0.045 });
    withRotation(context, 540, 66, -0.08, () => drawPanel(context, 420, 34, 240, 64, 8, theme.primary));
    drawBrand(context, 66, 1140, theme.ink, '#FFFFFF', 0.035);
    drawMeta(context, createdAt, 72, 1350, theme.ink);
    drawStar(context, 94, 1060, 46, 18, theme.primary, -0.2);
    drawQrCard(context, options.qrSource, 820, 1170, theme.ink, -0.018);
  } else if (template.id === 'hero-poster') {
    context.fillStyle = theme.ink;
    context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    drawPhotoFrame(context, cartoon, frame, theme, 0);
    const gradient = context.createLinearGradient(0, 560, 0, 1160);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.62, 'rgba(0,0,0,0.42)');
    gradient.addColorStop(1, theme.ink);
    context.fillStyle = gradient;
    context.fillRect(0, 520, POSTER_WIDTH, 650);
    context.fillStyle = theme.secondary;
    context.fillRect(0, 0, 32, 1138);
    drawBrand(context, 62, 54, theme.primary, primaryText, -0.02);
    context.fillStyle = theme.accent;
    context.font = '900 24px Arial, sans-serif';
    context.textAlign = 'left';
    context.fillText('MAIN CHARACTER ENERGY', 68, 730);
    drawTitleBlock(context, options.title, { x: 64, y: 754, width: 760, height: 270, color: '#FFFFFF', maxSize: 100, minSize: 52, maxLines: 2 });
    context.fillStyle = theme.primary;
    context.beginPath();
    context.moveTo(0, 1110);
    context.lineTo(1080, 1030);
    context.lineTo(1080, 1440);
    context.lineTo(0, 1440);
    context.closePath();
    context.fill();
    drawLightning(context, 900, 840, 1.05, theme.accent);
    drawMeta(context, createdAt, 66, 1348, primaryText);
    drawQrCard(context, options.qrSource, 820, 1172, theme.ink, 0.018);
  } else if (template.id === 'sticker-book') {
    context.fillStyle = theme.primary;
    context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    context.fillStyle = theme.secondary;
    for (let index = 0; index < 9; index += 1) {
      context.beginPath();
      context.arc(30 + index * 140, 90 + (index % 2) * 92, 92, 0, Math.PI * 2);
      context.fill();
    }
    drawDots(context, theme.ink, 42, 0.12);
    drawPanel(context, 116, 110, 848, 848, 424, '#FFFDF7', theme.ink, 14, 'rgba(0,0,0,0.18)');
    drawPhotoFrame(context, cartoon, frame, theme, 14);
    drawCatDetails(context, frame, theme);
    withRotation(context, 540, 920, -0.045, () => {
      drawPanel(context, 126, 844, 828, 170, 28, theme.accent, theme.ink, 12, 'rgba(0,0,0,0.18)');
    });
    drawTitleBlock(context, options.title, { x: 170, y: 866, width: 740, height: 126, color: accentText, maxSize: 68, maxLines: 2, align: 'center', rotation: -0.045 });
    drawBrand(context, 68, 70, theme.ink, '#FFFFFF');
    drawStar(context, 974, 610, 42, 17, theme.accent, 0.3);
    drawStar(context, 98, 1020, 44, 18, '#FFFFFF', -0.2);
    drawMeta(context, createdAt, 72, 1348, primaryText);
    drawQrCard(context, options.qrSource, 820, 1170, theme.ink, 0.02);
  } else if (template.id === 'magazine-pop') {
    context.fillStyle = theme.accent;
    context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    context.fillStyle = theme.secondary;
    context.fillRect(0, 0, 1080, 72);
    context.fillRect(0, 1260, 1080, 180);
    drawPhotoFrame(context, cartoon, frame, theme, 12);
    context.fillStyle = theme.secondary;
    context.fillRect(42, 170, 162, 650);
    context.save();
    context.translate(122, 748);
    context.rotate(-Math.PI / 2);
    context.fillStyle = theme.ink;
    context.font = '900 34px Arial, sans-serif';
    context.textAlign = 'left';
    context.letterSpacing = '5px';
    context.fillText('NEON / ISSUE 08 / SOUL PEOPLE', 0, 0);
    context.restore();
    drawPanel(context, 176, 742, 738, 238, 0, theme.primary, theme.ink, 10);
    drawTitleBlock(context, options.title, { x: 214, y: 766, width: 662, height: 188, color: primaryText, maxSize: 82, maxLines: 2 });
    context.fillStyle = '#FFFFFF';
    context.font = '900 64px Arial, sans-serif';
    context.textAlign = 'right';
    context.fillText('SOUL!', 960, 178);
    drawBrand(context, 68, 78, theme.ink, '#FFFFFF', 0);
    drawMeta(context, createdAt, 68, 1360, secondaryText);
    drawQrCard(context, options.qrSource, 820, 1168, theme.ink, 0);
  } else if (template.id === 'split-zine') {
    context.fillStyle = theme.primary;
    context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    drawPanel(context, 38, 94, 422, 1160, 42, theme.accent, theme.ink, 12, 'rgba(0,0,0,0.2)');
    context.fillStyle = theme.secondary;
    context.beginPath();
    context.moveTo(320, 0);
    context.lineTo(1080, 0);
    context.lineTo(1080, 520);
    context.lineTo(420, 760);
    context.closePath();
    context.fill();
    drawPhotoFrame(context, cartoon, frame, theme, 14);
    context.fillStyle = theme.ink;
    context.font = '900 24px Arial, sans-serif';
    context.textAlign = 'left';
    context.fillText('A LITTLE ZINE ABOUT', 76, 214);
    drawTitleBlock(context, options.title, { x: 76, y: 250, width: 330, height: 540, color: accentText, maxSize: 78, minSize: 42, maxLines: 3 });
    drawBrand(context, 720, 62, theme.ink, '#FFFFFF', 0.02);
    drawStar(context, 364, 870, 50, 20, theme.secondary, 0.1);
    drawMeta(context, createdAt, 1008, 1350, primaryText, 'right');
    drawQrCard(context, options.qrSource, 90, 1166, theme.ink, -0.02);
  } else if (template.id === 'orbit-badge') {
    context.fillStyle = theme.ink;
    context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    drawDots(context, theme.accent, 62, 0.2);
    context.save();
    context.strokeStyle = theme.secondary;
    context.lineWidth = 16;
    context.beginPath();
    context.ellipse(540, 558, 500, 268, -0.35, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = theme.primary;
    context.lineWidth = 8;
    context.beginPath();
    context.ellipse(540, 558, 320, 516, 0.7, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    drawPanel(context, 126, 144, 828, 828, 414, theme.accent, theme.primary, 18, 'rgba(0,0,0,0.35)');
    drawPhotoFrame(context, cartoon, frame, theme, 14);
    drawPanel(context, 92, 856, 896, 186, 93, theme.primary, theme.accent, 10, 'rgba(0,0,0,0.3)');
    drawTitleBlock(context, options.title, { x: 150, y: 884, width: 780, height: 130, color: primaryText, maxSize: 70, maxLines: 2, align: 'center' });
    drawBrand(context, 418, 56, theme.accent, theme.ink, 0);
    drawStar(context, 956, 236, 48, 18, theme.accent, 0.15);
    drawStar(context, 116, 772, 40, 16, theme.secondary, -0.2);
    drawMeta(context, createdAt, 66, 1354, '#FFFFFF');
    drawQrCard(context, options.qrSource, 820, 1170, theme.ink, 0.02);
  } else {
    context.fillStyle = theme.primary;
    context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    drawChecker(context, 0, 216, theme.ink, theme.secondary, 54);
    drawChecker(context, 1080, 360, theme.secondary, theme.accent, 54);
    drawPanel(context, 64, 58, 952, 206, 28, theme.ink, theme.accent, 10, 'rgba(0,0,0,0.22)');
    context.fillStyle = theme.secondary;
    for (let x = 102; x <= 978; x += 73) {
      context.beginPath();
      context.arc(x, 88, 9, 0, Math.PI * 2);
      context.fill();
    }
    drawTitleBlock(context, options.title, { x: 110, y: 105, width: 860, height: 120, color: theme.accent, maxSize: 72, maxLines: 2, align: 'center' });
    drawPhotoFrame(context, cartoon, frame, theme, 16);
    context.save();
    context.globalAlpha = 0.16;
    context.fillStyle = '#FFFFFF';
    for (let y = frame.y + 18; y < frame.y + frame.height; y += 24) context.fillRect(frame.x, y, frame.width, 5);
    context.restore();
    drawPanel(context, 64, 1082, 952, 284, 32, theme.accent, theme.ink, 12);
    context.fillStyle = theme.ink;
    context.font = '900 30px Arial, sans-serif';
    context.textAlign = 'left';
    context.fillText('PLAYER 01  /  CHARACTER UNLOCKED', 94, 1152);
    drawBrand(context, 82, 1238, theme.ink, '#FFFFFF', -0.02);
    drawMeta(context, createdAt, 92, 1210, theme.ink);
    drawQrCard(context, options.qrSource, 804, 1154, theme.ink, 0.018);
  }

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片导出失败，请重试'))),
      'image/jpeg',
      quality
    );
  });
}
