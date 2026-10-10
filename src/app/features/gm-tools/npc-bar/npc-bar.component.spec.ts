import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NpcBarService } from '@axe/application/ui/npc-bar.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatPaletteRegistryService } from '@axe/features/chat/chat-palette/chat-palette-registry.service';
import { NpcBarComponent } from '@axe/features/gm-tools/npc-bar/npc-bar.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function makeCharacter(name: string, opts: { isNpc?: boolean; location?: string } = {}): GameCharacter {
  const character = GameCharacter.create(name, 1, '');
  character.isNpc = opts.isNpc ?? false;
  character.location.name = opts.location ?? 'table';
  return character;
}

interface NpcBarInternals {
  select(npc: GameCharacter): void;
  unregister(npc: GameCharacter): void;
}

describe('NpcBarComponent', () => {
  let component: NpcBarComponent;
  let fixture: ComponentFixture<NpcBarComponent>;
  let panelStub: { openLazy: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    panelStub = { openLazy: vi.fn(), open: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [NpcBarComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    TestBed.overrideProvider(PanelService, { useValue: panelStub });
    TestBed.overrideProvider(ChatPaletteRegistryService, { useValue: new ChatPaletteRegistryService() });
    fixture = TestBed.createComponent(NpcBarComponent);
    component = fixture.componentInstance;
  });

  it('lists the non-player characters, leaving out the graveyard', () => {
    makeCharacter('モンスターA', { isNpc: true });
    makeCharacter('モンスターB', { isNpc: true });
    makeCharacter('プレイヤー', { isNpc: false });
    makeCharacter('退場NPC', { isNpc: true, location: 'graveyard' });

    const names = component
      .npcs()
      .map((c) => c.name)
      .sort();
    expect(names).toEqual(['モンスターA', 'モンスターB']);
  });

  it('switches an open palette to that character', () => {
    const registry = TestBed.inject(ChatPaletteRegistryService);
    const handle = { setCharacterById: vi.fn() };
    registry.register(handle);
    const npc = makeCharacter('A', { isNpc: true });

    (component as unknown as NpcBarInternals).select(npc);

    expect(handle.setCharacterById).toHaveBeenCalledWith(npc.identifier);
    expect(panelStub.openLazy).not.toHaveBeenCalled();
  });

  it('opens one when none is', () => {
    const npc = makeCharacter('B', { isNpc: true });

    (component as unknown as NpcBarInternals).select(npc);

    expect(panelStub.openLazy).toHaveBeenCalledTimes(1);
  });

  it('takes a character off the list', () => {
    const character = makeCharacter('D', { isNpc: true });
    expect(component.npcs()).toContain(character);

    (component as unknown as NpcBarInternals).unregister(character);

    expect(character.isNpc).toBe(false);
  });

  it('narrows the strip by a word in the name', () => {
    makeCharacter('ゴブリンA', { isNpc: true });
    makeCharacter('ゴブリンB', { isNpc: true });
    makeCharacter('村長', { isNpc: true });

    expect(component.filteredNpcs()).toHaveLength(3);

    component.search.set('ゴブリン');

    expect(component.filteredNpcs().map((npc) => npc.name)).toEqual(['ゴブリンA', 'ゴブリンB']);
  });

  it('folds width so a full-width search still finds a half-width name', () => {
    makeCharacter('HPポーション', { isNpc: true });

    component.search.set('ＨＰ');

    expect(component.filteredNpcs()).toHaveLength(1);
  });

  it('says nothing matched rather than that there are none', () => {
    makeCharacter('ゴブリン', { isNpc: true });
    TestBed.inject(NpcBarService).open();
    component.search.set('zzz');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('一致する NPC がいません');
  });
});
