import { TestBed } from '@angular/core/testing';
import { StampRulesService } from '@axe/application/chat/stamp-rules.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { OPEN_STAMP_RULES } from '@axe/domain/chat/stamp-rules';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('StampRulesService', () => {
  function open(role: PeerRole): StampRulesService {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = role;
    if (!ObjectStore.instance.get<Config>('Config')) new Config('Config').initialize();
    return TestBed.inject(StampRulesService);
  }

  const config = () => ObjectStore.instance.get<Config>('Config')!;

  afterEach(() => {
    const held = ObjectStore.instance.get<Config>('Config');
    if (held) held.stampRules = OPEN_STAMP_RULES;
  });

  it('lets every stamp be used for everything before the room says otherwise', () => {
    const rules = open(PeerRole.Player);

    expect(rules.isOn('line')).toBe(true);
    expect(rules.allows('reaction', 'seal:ok')).toBe(true);
  });

  it('lets the game master turn a use off and deny stamps for everyone', () => {
    const rules = open(PeerRole.GameMaster);

    rules.setOn('reaction', false);
    rules.setAllowed('line', ['roll:fumble', 'roll:critical'], false);

    expect(rules.isOn('reaction')).toBe(false);
    expect(rules.allows('line', 'roll:fumble')).toBe(false);
    expect(rules.allows('line', 'roll:success')).toBe(true);
    expect(config().stampRules.line.denied).toEqual(['roll:fumble', 'roll:critical']);

    rules.setAllowed('line', ['roll:fumble'], true);
    expect(rules.allows('line', 'roll:fumble')).toBe(true);
  });

  it('refuses anyone but the game master', () => {
    const rules = open(PeerRole.Player);

    rules.setOn('line', false);
    rules.setAllowed('reaction', ['seal:ok'], false);

    expect(rules.canChange()).toBe(false);
    expect(config().stampRules).toEqual(OPEN_STAMP_RULES);
  });

  it('follows the rules as they arrive from the room', () => {
    const rules = open(PeerRole.Player);
    expect(rules.allows('line', 'seal:ok')).toBe(true);

    config().stampRules = { ...OPEN_STAMP_RULES, line: { off: false, denied: ['seal:ok'] } };

    expect(rules.allows('line', 'seal:ok')).toBe(false);
  });
});
