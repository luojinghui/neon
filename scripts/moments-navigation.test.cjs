const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relative, dependencies = {}) {
  const file = path.resolve(__dirname, '..', relative);
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, (name) => dependencies[name] || require(name));
  return exports;
}

const cloudNavigation = load('src/app/cloud/navigation.ts');
const moments = load('src/app/moments/navigation.ts', { '../cloud/navigation': cloudNavigation });
const profile = load('src/app/profile/navigation.ts', {
  '../cloud/navigation': cloudNavigation,
  '../moments/navigation': moments
});
const momentId = 'a'.repeat(16);

test('星语详情没有来源或来源不安全时回到星河列表', () => {
  for (const value of [
    undefined, null, '', '   ', 'https://evil.example/profile/alice', '//evil.example/moments',
    '/\\evil', '/moments/../admin', `/moments/${momentId}/extra`, `/moments/${'a'.repeat(15)}`,
    `/moments/${momentId}?from=https://evil.example`, `/moments/${momentId}?next=/admin`,
    '/profile/ab', '/profile/alice?section=javascript', '/profile/alice?next=/',
    '/profile/alice?section=moments#hack', '/profile/alice?from=/&from=/soul',
    'javascript:alert(1)', '/profile/alice?key=short&section=moments', '/soul/../admin',
    '/cloud?tab=plaza&id=bad', '/admin', `/moments/${momentId}`
  ]) {
    assert.equal(moments.sanitizeMomentReturnTo(value), '/moments', String(value));
    assert.equal(moments.getMomentBackLabel(String(value ?? '')), '星河');
  }
  assert.equal(moments.createMomentHref(momentId), `/moments/${momentId}`);
  assert.equal(moments.createMomentHref(momentId, { returnTo: '/moments' }), `/moments/${momentId}`);
  assert.equal(moments.createMomentHref(momentId, { returnTo: 'https://evil.example' }), `/moments/${momentId}`);
});

test('星语详情按进入页返回，并保留个人主页的分区与原返回地址', () => {
  const accepted = [
    ['/moments', '星河'],
    ['/', '首页'],
    ['/soul', '星球'],
    ['/soul/room_123', '聊天'],
    ['/soul/dm-123e4567-e89b-12d3-a456-426614174000', '聊天'],
    ['/cloud', '云传'],
    ['/cloud?tab=plaza', '广场'],
    ['/cloud?tab=plaza&id=Ab_cd-12', '广场'],
    [`/cloud?tab=plaza&id=${'a'.repeat(32)}`, '广场'],
    ['/doodle', '画镜'],
    ['/island', '浮岛'],
    ['/island/island_1', '浮岛'],
    ['/profile', '个人中心'],
    ['/profile?section=messages', '个人中心'],
    ['/profile/alice', '个人中心'],
    ['/profile/alice?section=moments', '个人中心'],
    [`/profile/alice?key=${'a'.repeat(18)}&from=%2F&section=friends`, '个人中心']
  ];
  for (const [destination, label] of accepted) {
    assert.equal(moments.sanitizeMomentReturnTo(destination), destination);
    assert.equal(moments.getMomentBackLabel(destination), label);
    if (destination !== '/moments') {
      const href = moments.createMomentHref(momentId, { returnTo: destination });
      assert.equal(new URL(href, 'https://neon.example').searchParams.get('from'), destination);
    }
  }

  const profilePath = profile.createProfileHref('alice', {
    publicKey: 'a'.repeat(18),
    returnTo: '/soul/room_123',
    section: 'moments'
  });
  assert.equal(profilePath, `/profile/alice?key=${'a'.repeat(18)}&from=%2Fsoul%2Froom_123&section=moments`);
  const href = moments.createMomentHref(momentId, { returnTo: profilePath });
  const from = new URL(href, 'https://neon.example').searchParams.get('from');
  assert.equal(from, profilePath);
  assert.equal(moments.sanitizeMomentReturnTo(from), profilePath);
  assert.equal(moments.getMomentBackLabel(from), '个人中心');
  assert.equal(profile.sanitizeProfileReturnTo(href), href);
  assert.equal(profile.getProfileBackLabel(href), '星语');

  const authorPath = profile.createProfileHref('bob', { returnTo: href, section: 'moments' });
  const second = moments.createMomentHref('b'.repeat(16), { returnTo: authorPath });
  assert.equal(moments.sanitizeMomentReturnTo(new URL(second, 'https://neon.example').searchParams.get('from')), authorPath);
});

test('个人主页只接受安全的星语详情回跳，分区参数不会把访客带进私信', () => {
  assert.equal(profile.sanitizeProfileReturnTo(`/moments/${momentId}`), `/moments/${momentId}`);
  assert.equal(profile.getProfileBackLabel(`/moments/${momentId}`), '星语');
  for (const destination of ['/cloud?tab=plaza', '/cloud?tab=plaza&id=Ab_cd-12', `/cloud?tab=plaza&id=${'a'.repeat(32)}`, '/soul/room_123']) {
    assert.equal(profile.sanitizeProfileReturnTo(destination), destination);
  }
  assert.equal(profile.sanitizeProfileReturnTo('https://evil.example/cloud?tab=plaza'), '/');
  assert.equal(profile.sanitizeProfileReturnTo('/profile/guide?key=planetguide&section=moments'), '/');
  assert.equal(moments.sanitizeMomentReturnTo('/profile/guide?key=planetguide&section=moments'), '/profile/guide?key=planetguide&section=moments');
  assert.equal(profile.sanitizeProfileReturnTo(`/moments/${momentId}?from=${encodeURIComponent('/profile/alice?section=moments')}`), `/moments/${momentId}?from=${encodeURIComponent('/profile/alice?section=moments')}`);
  for (const value of [
    `/moments/${momentId}?from=https://evil.example`,
    `/moments/${momentId}?next=/admin`,
    `/moments/${'a'.repeat(15)}`,
    `/moments/${momentId}#extra`
  ]) assert.equal(profile.sanitizeProfileReturnTo(value), '/');

  assert.equal(profile.createProfileHref('alice', { returnTo: '/moments', section: 'moments' }), '/profile/alice?from=%2Fmoments&section=moments');
  assert.equal(profile.createProfileHref('alice', { returnTo: '/', section: 'nope' }), '/profile/alice?from=%2F');
  assert.equal(profile.sanitizeProfileSection('messages'), 'messages');
  assert.equal(profile.sanitizeProfileSection('profile'), '');
  assert.equal(profile.resolveProfileSection('moments', false), 'moments');
  assert.equal(profile.resolveProfileSection('messages', false), 'profile');
  assert.equal(profile.resolveProfileSection('messages', true), 'messages');
  assert.equal(profile.resolveProfileSection('friends', true), 'friends');
  assert.equal(profile.resolveProfileSection('nope', true), 'profile');

  let nested = '/';
  for (let depth = 0; depth < 8; depth += 1) {
    nested = `/profile/alice?from=${encodeURIComponent(nested)}&section=moments`;
    nested = `/moments/${momentId}?from=${encodeURIComponent(nested)}`;
  }
  assert.equal(moments.sanitizeMomentReturnTo(nested), '/moments');
  assert.equal(profile.sanitizeProfileReturnTo(nested), '/');
});

test('详情页、个人主页星河和个人中心入口使用原路径返回', () => {
  const detail = readFileSync(path.resolve(__dirname, '../src/app/moments/[momentId]/page.tsx'), 'utf8');
  assert.match(detail, /sanitizeMomentReturnTo\(searchParams\.get\('from'\)\)/);
  assert.match(detail, /backHref=\{returnTo\}/);
  assert.match(detail, /backLabel=\{backLabel\}/);
  assert.match(detail, /router\.replace\(returnTo\)/);
  assert.doesNotMatch(detail, /backHref="\/moments"/);
  assert.doesNotMatch(detail, /router\.replace\('\/moments'\)/);

  const gallery = readFileSync(path.resolve(__dirname, '../src/app/moments/components/MomentGallery.tsx'), 'utf8');
  assert.match(gallery, /createMomentHref\(moment\.id, \{ returnTo \}\)/);
  const profilePage = readFileSync(path.resolve(__dirname, '../src/app/profile/[userId]/page.tsx'), 'utf8');
  assert.match(profilePage, /section: 'moments'/);
  assert.match(profilePage, /resolveProfileSection/);
  const share = readFileSync(path.resolve(__dirname, '../src/app/soul/[roomId]/components/ShareMomentDialog.tsx'), 'utf8');
  assert.match(share, /createMomentHref\(share\.momentId/);
  const redirect = readFileSync(path.resolve(__dirname, '../src/app/profile/page.tsx'), 'utf8');
  assert.match(redirect, /sanitizeProfileSection/);
  const shortcut = readFileSync(path.resolve(__dirname, '../src/app/profile/components/ProfileShortcut.tsx'), 'utf8');
  assert.match(shortcut, /section: unread > 0 \? 'messages'/);
});
