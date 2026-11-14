import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { DataSummarySetting } from '@axe/domain/data/data-summary-setting';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { RoomElementAliasSettingsComponent } from '@axe/features/room-settings/room-element-alias-settings/room-element-alias-settings.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomElementAliasSettingsComponent', () => {
  let fixture: ComponentFixture<RoomElementAliasSettingsComponent>;
  let host: HTMLElement;

  const all = <T extends HTMLElement>(testId: string, within: HTMLElement = host): T[] => [
    ...within.querySelectorAll<T>(`[data-testid="${testId}"]`),
  ];
  const cards = () => all('element-alias');
  const type = (box: HTMLInputElement, text: string) => {
    box.value = text;
    box.dispatchEvent(new Event('change'));
  };
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  function onTable(name: string, sections: Record<string, Record<string, number>>): GameCharacter {
    const piece = GameCharacter.create(name, 1, '');
    for (const [sectionName, fields] of Object.entries(sections)) {
      const section = DataElement.create(sectionName, '');
      piece.detailDataElement!.appendChild(section);
      for (const [field, value] of Object.entries(fields)) section.appendChild(DataElement.create(field, value));
    }
    piece.setLocation('table');
    return piece;
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RoomElementAliasSettingsComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(async () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    onTable('二つ持ち', { 基本: { 行動値: 10 }, 戦闘: { 行動値: 12 } });
    onTable('一つ持ち', { 基本: { イニシアティブ: 7 } });
    onTable('持たない', { 基本: { 幸運: 3 } });
    fixture = TestBed.createComponent(RoomElementAliasSettingsComponent);
    host = fixture.nativeElement as HTMLElement;
    await settle();
  });

  it('starts with no aliases and a box to name the first', () => {
    expect(cards()).toHaveLength(0);
    expect(host.textContent).toContain('別名はまだありません。');
    expect(all('element-alias-new-name')).toHaveLength(1);
  });

  it('adds an alias under the name typed, and empties the box', async () => {
    const box = all<HTMLInputElement>('element-alias-new-name')[0];
    box.value = ' 行動値 ';

    all('element-alias-add')[0].click();
    await settle();

    expect(DataSummarySetting.instance.aliases).toEqual([{ name: '行動値', candidates: [] }]);
    expect(box.value).toBe('');
    expect(all<HTMLInputElement>('element-alias-name')[0].value).toBe('行動値');
  });

  it('adds nothing for a blank name or one already taken', async () => {
    DataSummarySetting.instance.aliases = [{ name: '行動値', candidates: [] }];
    await settle();
    const box = all<HTMLInputElement>('element-alias-new-name')[0];

    for (const name of ['', '   ', '行動値']) {
      box.value = name;
      all('element-alias-add')[0].click();
    }

    expect(DataSummarySetting.instance.aliases).toHaveLength(1);
  });

  it('offers the items the pieces on the table carry as candidates, by their paths', () => {
    const offered = [...host.querySelectorAll('datalist option')].map((option) => (option as HTMLOptionElement).value);

    expect(offered).toContain('基本/行動値');
    expect(offered).toContain('戦闘/行動値');
    expect(offered).toContain('基本/イニシアティブ');
    expect(offered.filter((path) => path === '基本/行動値')).toHaveLength(1);
  });

  it('adds, reorders and removes the candidates of an alias', async () => {
    DataSummarySetting.instance.aliases = [{ name: '行動値', candidates: [] }];
    await settle();
    const add = async (reference: string) => {
      all<HTMLInputElement>('element-alias-candidate-box')[0].value = reference;
      all('element-alias-candidate-add')[0].click();
      await settle();
    };

    await add('基本/行動値');
    await add('戦闘/行動値');
    await add('イニシアティブ');
    await add('イニシアティブ');
    expect(DataSummarySetting.instance.aliases[0].candidates).toEqual(['基本/行動値', '戦闘/行動値', 'イニシアティブ']);

    const buttons = () => all('element-alias-candidate').map((item) => [...item.querySelectorAll('button')]);
    expect(buttons()[0][0].disabled).toBe(true);
    expect(buttons()[2][1].disabled).toBe(true);
    buttons()[2][0].click();
    await settle();
    expect(DataSummarySetting.instance.aliases[0].candidates).toEqual(['基本/行動値', 'イニシアティブ', '戦闘/行動値']);

    buttons()[0][2].click();
    await settle();
    expect(DataSummarySetting.instance.aliases[0].candidates).toEqual(['イニシアティブ', '戦闘/行動値']);
  });

  it('says on how many pieces of the table an alias stands for an item', async () => {
    DataSummarySetting.instance.aliases = [
      { name: '行動値', candidates: ['基本/行動値', 'イニシアティブ'] },
      { name: '速さ', candidates: ['行動値'] },
    ];
    await settle();

    const found = all('element-alias-found').map((line) => line.textContent!.trim());

    expect(found).toEqual(['卓のコマ3体のうち2体で見つかります', '卓のコマ3体のうち0体で見つかります']);
  });

  it('renames an alias, and puts the box back when the name is blank or taken', async () => {
    DataSummarySetting.instance.aliases = [
      { name: '行動値', candidates: ['基本/行動値'] },
      { name: '回避', candidates: [] },
    ];
    await settle();
    const names = () => all<HTMLInputElement>('element-alias-name');

    type(names()[0], '速さ');
    await settle();
    expect(DataSummarySetting.instance.aliases[0]).toEqual({ name: '速さ', candidates: ['基本/行動値'] });

    type(names()[0], '回避');
    expect(names()[0].value).toBe('速さ');
    type(names()[0], '  ');
    expect(names()[0].value).toBe('速さ');
    expect(DataSummarySetting.instance.aliases.map((alias) => alias.name)).toEqual(['速さ', '回避']);
  });

  it('deletes an alias', async () => {
    DataSummarySetting.instance.aliases = [
      { name: '行動値', candidates: ['基本/行動値'] },
      { name: '回避', candidates: [] },
    ];
    await settle();

    all('element-alias-remove')[0].click();
    await settle();

    expect(DataSummarySetting.instance.aliases).toEqual([{ name: '回避', candidates: [] }]);
    expect(cards()).toHaveLength(1);
  });

  it('shows an alias another seat wrote', async () => {
    DataSummarySetting.instance.aliases = [{ name: '行動値', candidates: ['基本/行動値'] }];
    await settle();

    expect(all<HTMLInputElement>('element-alias-name').map((box) => box.value)).toEqual(['行動値']);
  });

  it('lets only the master change anything, with every box and button held still', async () => {
    DataSummarySetting.instance.aliases = [{ name: '行動値', candidates: ['基本/行動値', '戦闘/行動値'] }];
    PeerCursor.myCursor.role = PeerRole.Player;
    await settle();
    const component = fixture.componentInstance;
    const box = all<HTMLInputElement>('element-alias-new-name')[0];
    box.value = '回避';

    component.addAlias(box);
    component.removeAlias(0);
    component.removeCandidate(0, 0);
    component.moveCandidate(0, 0, 1);
    component.addCandidate(0, box);
    component.renameAlias(0, box);

    expect(DataSummarySetting.instance.aliases).toEqual([
      { name: '行動値', candidates: ['基本/行動値', '戦闘/行動値'] },
    ]);
    const controls = [...host.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')];
    expect(controls.length).toBeGreaterThan(5);
    expect(controls.every((control) => control.disabled)).toBe(true);
  });
});
