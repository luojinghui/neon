const assert = require('node:assert/strict');
const test = require('node:test');
const { getAtmosphere } = require('./atmosphere');

test('时段问候覆盖清晨、午后和深夜电台', () => {
  assert.equal(getAtmosphere(8).periodLabel, '清晨微光');
  assert.equal(getAtmosphere(15).periodLabel, '午后时光');
  const night = getAtmosphere(23, '小林');
  assert.equal(night.periodLabel, '深夜电台');
  assert.equal(night.period, 'night');
  assert.equal(night.isNight, true);
  assert.equal(night.headline, '夜深啦，小林');
  assert.match(night.placeholder, /深夜电台/);
});

test('未留名时仍用着陆问候，输入提示随午间变化', () => {
  const noon = getAtmosphere(12);
  assert.equal(noon.periodLabel, '午间小憩');
  assert.equal(noon.headline, '中午好，欢迎着陆 Soul 星球');
  assert.match(noon.placeholder, /午间/);
  assert.equal(getAtmosphere(20).periodLabel, '暮色时分');
});
