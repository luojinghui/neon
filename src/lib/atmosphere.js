/** 首页和星球房间共用的时段气息。hour 为 0–23 的本地小时。 */
function getAtmosphere(hour, name = '') {
  let greeting = '晚上好';
  let periodLabel = '暮色时分';
  let period = 'dusk';
  let isNight = true;

  if (hour < 5 || hour >= 23) {
    greeting = '夜深啦';
    periodLabel = '深夜电台';
    period = 'night';
  } else if (hour < 11) {
    greeting = '早上好';
    periodLabel = '清晨微光';
    period = 'dawn';
    isNight = false;
  } else if (hour < 14) {
    greeting = '中午好';
    periodLabel = '午间小憩';
    period = 'noon';
    isNight = false;
  } else if (hour < 18) {
    greeting = '下午好';
    periodLabel = '午后时光';
    period = 'afternoon';
    isNight = false;
  }

  const placeholder = {
    dawn: '清晨微光里，想说点什么…',
    noon: '午间小憩，随便聊聊…',
    afternoon: '午后时光，想说就说…',
    dusk: '暮色时分，留一句吧…',
    night: '深夜电台开着，轻轻说一句…'
  }[period];

  return {
    period,
    periodLabel,
    isNight,
    headline: name ? `${greeting}，${name}` : `${greeting}，欢迎着陆 Soul 星球`,
    placeholder
  };
}

module.exports = { getAtmosphere };
