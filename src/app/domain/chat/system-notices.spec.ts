import {
  DEFAULT_SYSTEM_NOTICES,
  NOTICE_OFF,
  noticeRouteOf,
  readSystemNotices,
  withNoticeRoute,
  writeSystemNotices,
} from '@axe/domain/chat/system-notices';

describe('system notice routes', () => {
  it('send every kind where it always went in a room that chose nothing', () => {
    const routes = readSystemNotices('');

    expect(routes).toEqual(DEFAULT_SYSTEM_NOTICES);
    expect(noticeRouteOf(routes, 'round')).toBe('');
  });

  it.each([
    ['damaged text', '{"round":'],
    ['a list', '["BattleTab"]'],
    ['a number', '3'],
    ['nothing at all', undefined],
  ])('read %s as a room that chose nothing', (_label, held) => {
    expect(readSystemNotices(held)).toEqual(DEFAULT_SYSTEM_NOTICES);
  });

  it('read a tab chosen and a kind sent nowhere, passing over routes that are not text', () => {
    const routes = readSystemNotices('{"round":"BattleTab","bgm":"off","card":3,"trigger":""}');

    expect(noticeRouteOf(routes, 'round')).toBe('BattleTab');
    expect(noticeRouteOf(routes, 'bgm')).toBe(NOTICE_OFF);
    expect(noticeRouteOf(routes, 'card')).toBe('');
    expect(noticeRouteOf(routes, 'trigger')).toBe('');
  });

  it('keep a kind this version does not know when written again', () => {
    const routes = withNoticeRoute(readSystemNotices('{"later":"SubTab"}'), 'round', 'BattleTab');

    expect(JSON.parse(writeSystemNotices(routes))).toEqual({ later: 'SubTab', round: 'BattleTab' });
  });

  it('write nothing once every kind goes where it always went again', () => {
    const chosen = withNoticeRoute(DEFAULT_SYSTEM_NOTICES, 'round', 'BattleTab');

    expect(writeSystemNotices(withNoticeRoute(chosen, 'round', ''))).toBe('');
  });
});
