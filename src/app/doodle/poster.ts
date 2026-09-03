import type { DoodleTemplate, DoodleTemplateId, DoodleTheme, DoodleThemeId } from './types';

export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1440;

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
  { id: 'comic-cover', name: '漫画封面', description: '粗线条与经典猫耳' },
  { id: 'instant-film', name: '拍立得', description: '留白相纸与随手贴纸' },
  { id: 'hero-poster', name: '勇者海报', description: '大画幅与强力视觉' },
  { id: 'sticker-book', name: '贴纸手账', description: '圆角头像与元气装饰' }
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

function cartoonize(source: CanvasImageSource, sourceWidth: number, sourceHeight: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 540;
  canvas.height = 570;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('当前浏览器无法处理图片');
  drawCover(context, source, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  const luma = new Uint8Array(canvas.width * canvas.height);
  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    luma[pixel] = Math.round(pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114);
  }

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const pixel = y * canvas.width + x;
      const index = pixel * 4;
      const right = luma[y * canvas.width + Math.min(x + 1, canvas.width - 1)];
      const down = luma[Math.min(y + 1, canvas.height - 1) * canvas.width + x];
      const edge = Math.abs(luma[pixel] - right) + Math.abs(luma[pixel] - down);
      if (edge > 38) {
        pixels[index] = 27;
        pixels[index + 1] = 24;
        pixels[index + 2] = 22;
      } else {
        const average = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
        const posterize = (value: number) => Math.max(0, Math.min(255, Math.round((average + (value - average) * 1.35) / 48) * 48));
        pixels[index] = posterize(pixels[index]);
        pixels[index + 1] = posterize(pixels[index + 1]);
        pixels[index + 2] = posterize(pixels[index + 2]);
      }
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

function fitTitle(context: CanvasRenderingContext2D, title: string, maxWidth: number) {
  let size = 76;
  while (size > 46) {
    context.font = `900 ${size}px var(--font-sans), "PingFang SC", sans-serif`;
    if (context.measureText(title).width <= maxWidth) return size;
    size -= 4;
  }
  return size;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).replaceAll('/', '.');
}

export function renderDoodlePoster(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, options: PosterOptions) {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法生成涂鸦');
  const theme = DOODLE_THEMES.find((item) => item.id === options.themeId) || DOODLE_THEMES[0];
  const template = DOODLE_TEMPLATES.find((item) => item.id === options.templateId) || DOODLE_TEMPLATES[0];

  context.fillStyle = theme.primary;
  context.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  if (template.id === 'hero-poster') {
    context.fillStyle = theme.secondary;
    context.fillRect(0, 0, 150, POSTER_HEIGHT);
    context.fillRect(930, 0, 150, POSTER_HEIGHT);
  } else if (template.id === 'sticker-book') {
    context.fillStyle = theme.secondary;
    for (let index = 0; index < 9; index += 1) {
      context.beginPath();
      context.arc(30 + index * 140, 100 + (index % 2) * 110, 88, 0, Math.PI * 2);
      context.fill();
    }
  } else {
    context.save();
    context.translate(POSTER_WIDTH, 0);
    context.rotate(template.id === 'instant-film' ? Math.PI / 3.4 : Math.PI / 4);
    context.fillStyle = theme.secondary;
    context.fillRect(-260, -400, 900, 1800);
    context.restore();
  }

  context.globalAlpha = 0.18;
  context.fillStyle = theme.ink;
  for (let y = 28; y < POSTER_HEIGHT; y += 38) {
    for (let x = 24 + ((y / 38) % 2) * 14; x < POSTER_WIDTH; x += 38) {
      context.beginPath();
      context.arc(x, y, 3.8, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 1;

  const frame =
    template.id === 'instant-film'
      ? { x: 112, y: 138, width: 856, height: 790, radius: 18 }
      : template.id === 'hero-poster'
        ? { x: 52, y: 82, width: 976, height: 1018, radius: 22 }
        : template.id === 'sticker-book'
          ? { x: 138, y: 160, width: 804, height: 846, radius: 180 }
          : { x: 78, y: 142, width: 924, height: 930, radius: 56 };

  if (template.id === 'instant-film') {
    roundedRect(context, 68, 94, 944, 970, 30);
    context.fillStyle = '#FFFDF7';
    context.fill();
    context.lineWidth = 16;
    context.strokeStyle = theme.ink;
    context.stroke();
    context.save();
    context.translate(80, 54);
    context.rotate(-0.12);
    context.fillStyle = theme.accent;
    context.fillRect(0, 0, 210, 58);
    context.restore();
  }
  if (template.id === 'sticker-book') {
    roundedRect(context, 106, 128, 868, 910, 205);
    context.fillStyle = '#FFFDF7';
    context.fill();
    context.lineWidth = 12;
    context.strokeStyle = theme.ink;
    context.stroke();
  }

  context.save();
  roundedRect(context, frame.x, frame.y, frame.width, frame.height, frame.radius);
  context.clip();
  const cartoon = cartoonize(source, sourceWidth, sourceHeight);
  context.imageSmoothingEnabled = true;
  context.drawImage(cartoon, frame.x, frame.y, frame.width, frame.height);
  context.globalCompositeOperation = 'soft-light';
  context.globalAlpha = 0.18;
  context.fillStyle = theme.secondary;
  context.fillRect(frame.x, frame.y, frame.width, frame.height);
  context.restore();

  roundedRect(context, frame.x, frame.y, frame.width, frame.height, frame.radius);
  context.lineWidth = template.id === 'instant-film' ? 10 : 18;
  context.strokeStyle = theme.ink;
  context.stroke();

  // Cat ears and blush deliberately sit on a fixed portrait guide: playful, not biometric inference.
  context.fillStyle = theme.primary;
  context.strokeStyle = theme.ink;
  context.lineWidth = 15;
  context.lineJoin = 'round';
  const earTop = template.id === 'hero-poster' ? 22 : template.id === 'sticker-book' ? 98 : 76;
  context.beginPath();
  context.moveTo(310, frame.y + 24);
  context.lineTo(356, earTop);
  context.lineTo(432, frame.y + 12);
  context.closePath();
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(650, frame.y + 12);
  context.lineTo(724, earTop);
  context.lineTo(774, frame.y + 26);
  context.closePath();
  context.fill();
  context.stroke();

  context.save();
  context.globalAlpha = 0.52;
  context.fillStyle = '#FF6F91';
  context.beginPath();
  const blushY = template.id === 'hero-poster' ? 748 : template.id === 'instant-film' ? 650 : 720;
  context.ellipse(330, blushY, 70, 32, -0.12, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.ellipse(750, blushY, 70, 32, 0.12, 0, Math.PI * 2);
  context.fill();
  context.restore();

  drawStar(context, template.id === 'sticker-book' ? 940 : 938, template.id === 'hero-poster' ? 210 : 170, 54, 22, theme.accent, 0.2);
  drawStar(context, 96, template.id === 'instant-film' ? 1010 : 1030, 43, 18, '#FFFFFF', -0.2);
  drawLightning(context, template.id === 'hero-poster' ? 900 : 935, template.id === 'sticker-book' ? 900 : 860, template.id === 'hero-poster' ? 1.05 : 0.78, theme.accent);

  if (template.id === 'sticker-book') {
    drawStar(context, 120, 300, 34, 14, theme.secondary, -0.35);
    drawStar(context, 972, 650, 32, 13, theme.primary, 0.4);
  }

  if (template.id === 'hero-poster') {
    roundedRect(context, 40, 1080, 1000, 190, 24);
    context.fillStyle = theme.primary;
    context.fill();
    context.lineWidth = 16;
    context.strokeStyle = theme.ink;
    context.stroke();
  }

  context.save();
  context.translate(template.id === 'hero-poster' ? 68 : 64, template.id === 'hero-poster' ? 36 : 82);
  context.rotate(-0.055);
  roundedRect(context, 0, 0, 244, 74, 37);
  context.fillStyle = theme.ink;
  context.fill();
  context.fillStyle = '#FFFFFF';
  context.font = '900 38px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('NEON · 漫游', 122, 39);
  context.restore();

  context.fillStyle = theme.ink;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  const titleSize = fitTitle(context, options.title, options.qrSource ? 720 : 920);
  context.font = `900 ${titleSize}px var(--font-sans), "PingFang SC", sans-serif`;
  context.fillText(options.title, 72, 1174);
  context.font = '700 28px Arial, sans-serif';
  context.letterSpacing = '3px';
  context.fillText(`TODAY'S SOUL ROLE  /  ${formatDate(options.createdAt || new Date())}`, 76, 1230);
  context.letterSpacing = '0px';

  if (options.qrSource) {
    roundedRect(context, 796, 1110, 222, 250, 26);
    context.fillStyle = '#FFFFFF';
    context.fill();
    context.lineWidth = 8;
    context.strokeStyle = theme.ink;
    context.stroke();
    context.drawImage(options.qrSource, 824, 1134, 166, 166);
    context.fillStyle = theme.ink;
    context.font = '800 23px var(--font-sans), sans-serif';
    context.textAlign = 'center';
    context.fillText('扫码查收今日角色', 907, 1335);
  } else {
    roundedRect(context, 72, 1290, 472, 74, 37);
    context.fillStyle = 'rgba(255,255,255,0.82)';
    context.fill();
    context.fillStyle = theme.ink;
    context.font = '800 27px var(--font-sans), sans-serif';
    context.textAlign = 'center';
    context.fillText('NEON · 漫游相机', 308, 1338);
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
