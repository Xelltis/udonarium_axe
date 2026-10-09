import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { stampsOfFamily } from '@axe/domain/chat/stamp-catalog';
import { OPEN_STAMP_RULES } from '@axe/domain/chat/stamp-rules';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { StampRulesEditorComponent } from '@axe/features/room-settings/stamp-rules/stamp-rules-editor.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('StampRulesEditorComponent', () => {
  let fixture: ComponentFixture<StampRulesEditorComponent>;

  function open(role: PeerRole): HTMLElement {
    TestBed.configureTestingModule({ imports: [StampRulesEditorComponent], providers: [...TEST_PROVIDERS] });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = role;
    if (!ObjectStore.instance.get<Config>('Config')) new Config('Config').initialize();
    fixture = TestBed.createComponent(StampRulesEditorComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const config = () => ObjectStore.instance.get<Config>('Config')!;

  function press(root: HTMLElement, testId: string): void {
    (root.querySelector(`[data-testid="${testId}"]`) as HTMLElement).click();
    TestBed.inject(ObjectChangeService).notifyChanged('Config');
    fixture.detectChanges();
  }

  afterEach(() => {
    const held = ObjectStore.instance.get<Config>('Config');
    if (held) held.stampRules = OPEN_STAMP_RULES;
  });

  it('offers a card for each use, with every stamp allowed in a room that set nothing', () => {
    const root = open(PeerRole.GameMaster);

    expect(root.querySelector('[data-testid="room-settings-stamps-line"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="room-settings-stamps-reaction"]')).not.toBeNull();
    expect(
      root.querySelector('[data-testid="room-settings-stamp-reaction-seal:ok"]')!.getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('lets the game master deny a stamp one use, a family at a time, and allow it back', () => {
    const root = open(PeerRole.GameMaster);

    press(root, 'room-settings-stamp-line-seal:ok');
    expect(config().stampRules.line.denied).toEqual(['seal:ok']);
    expect(config().stampRules.reaction.denied).toEqual([]);
    expect(root.querySelector('[data-testid="room-settings-stamp-line-seal:ok"]')!.getAttribute('aria-pressed')).toBe(
      'false'
    );

    press(root, 'room-settings-stamps-reaction-deny-roll');
    expect(config().stampRules.reaction.denied).toEqual(stampsOfFamily('roll').map((each) => each.id));

    press(root, 'room-settings-stamps-reaction-allow-roll');
    expect(config().stampRules.reaction.denied).toEqual([]);
  });

  it('lets the game master turn a use off, which folds its stamps away', () => {
    const root = open(PeerRole.GameMaster);

    press(root, 'room-settings-stamps-reaction-on');

    expect(config().stampRules.reaction.off).toBe(true);
    expect(root.querySelector('[data-testid^="room-settings-stamp-reaction-"]')).toBeNull();
    expect(root.querySelector('[data-testid^="room-settings-stamp-line-"]')).not.toBeNull();
  });

  it('shows anyone but the game master the rules as they stand, and changes nothing', () => {
    const root = open(PeerRole.Player);
    const stamp = root.querySelector<HTMLButtonElement>('[data-testid="room-settings-stamp-line-seal:ok"]')!;

    expect(stamp.disabled).toBe(true);
    expect(root.querySelector<HTMLInputElement>('[data-testid="room-settings-stamps-line-on"]')!.disabled).toBe(true);
    stamp.click();
    expect(config().stampRules).toEqual(OPEN_STAMP_RULES);
  });
});
