import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { HotbarFillService } from '@axe/application/hotbar/hotbar-fill.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { EffectLibraryPanelComponent } from '@axe/features/effect/effect-library-panel/effect-library-panel.component';
import { EffectPresetEditorComponent } from '@axe/features/effect/effect-preset-editor/effect-preset-editor.component';
import { refuseLocalStorageOutright } from '@axe/testing/refused-storage';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('EffectLibraryPanelComponent', () => {
  let fixture: ComponentFixture<EffectLibraryPanelComponent>;
  let preset: EffectPreset;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EffectLibraryPanelComponent],
      providers: [...TEST_PROVIDERS],
    });
    fixture = TestBed.createComponent(EffectLibraryPanelComponent);

    preset = new EffectPreset();
    preset.name = '爆炎';
    preset.tagName = '炎';
    ObjectStore.instance.add(preset, false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ObjectStore.instance.remove(preset);
  });

  it('casts nothing for a guest, who shows nothing on anybody’s table', () => {
    const cast = TestBed.inject(EffectCastService);
    vi.spyOn(cast, 'resolveTargets').mockReturnValue([{ name: 'ミナ' }] as never);
    const fired = vi.spyOn(cast, 'fire').mockImplementation(() => undefined as never);
    preset.targeting = 'self';
    PeerCursor.createMyCursor().role = PeerRole.Guest;
    const panel = fixture.componentInstance as unknown as { fire(preset: EffectPreset): void };

    panel.fire(preset);
    expect(fired).not.toHaveBeenCalled();

    PeerCursor.myCursor.role = PeerRole.Player;
    panel.fire(preset);
    expect(fired).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('opens where the browser refuses to hand over its storage at all', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [EffectLibraryPanelComponent], providers: [...TEST_PROVIDERS] });
    refuseLocalStorageOutright();

    expect(() => TestBed.createComponent(EffectLibraryPanelComponent)).not.toThrow();
  });

  it('lists the effects that have been added', () => {
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('爆炎');
    expect(text).toContain('炎');
  });

  it('narrows the list by a search', () => {
    const other = new EffectPreset();
    other.name = '氷結';
    other.tagName = '氷';
    ObjectStore.instance.add(other, false);

    try {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('氷結');

      fixture.componentInstance.query.set('爆炎');
      fixture.detectChanges();

      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('爆炎');
      expect(text).not.toContain('氷結');
    } finally {
      ObjectStore.instance.remove(other);
    }
  });

  it('says why when the search finds nothing', () => {
    fixture.componentInstance.query.set('該当なし');
    fixture.detectChanges();

    expect(fixture.componentInstance.matchCount()).toBe(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('一致するエフェクトがありません');
  });

  it('heads each family', () => {
    fixture.detectChanges();

    const headings = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[role="button"]'));
    expect(headings.map((heading) => heading.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['expand_more 炎 1']);
  });

  it('folds a family away', () => {
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('爆炎');

    const heading = (fixture.nativeElement as HTMLElement).querySelector('[role="button"]');
    heading?.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    // The heading stays and only the contents go.
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('炎');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('爆炎');
  });

  it('hands an effect to the hotbar, under the name it goes by', () => {
    const fill = vi.spyOn(TestBed.inject(HotbarFillService), 'fill').mockReturnValue({ page: 0, slotIndex: 0 });
    fixture.detectChanges();

    (fixture.componentInstance as unknown as { addToHotbar(preset: EffectPreset): void }).addToHotbar(preset);

    expect(fill.mock.calls[0][0]).toMatchObject({ kind: 'effect', value: '爆炎', valueName: '爆炎' });
  });

  it('counts and names every piece picked, a part picked with its body among them, though only the body is marked on the table', () => {
    const targeting = TestBed.inject(EffectTargetingService);
    const body = GameCharacter.create('ドラゴン', 2, '');
    const part = GameCharacter.create('頭', 1, '');
    part.ridingOn = body.identifier;
    part.rideSeat = 'part';
    TestBed.inject(ObjectChangeService).notifyChanged(part.identifier);
    preset.targeting = 'multi';
    preset.maxTargets = 3;
    try {
      targeting.begin(preset);
      targeting.pick(body.identifier);
      targeting.pick(part.identifier);

      expect(targeting.marks().map((mark) => mark.identifier)).toEqual([body.identifier]);
      expect(fixture.componentInstance.pickedNames()).toEqual(['ドラゴン', '頭']);
    } finally {
      targeting.cancel();
      part.destroy();
      body.destroy();
    }
  });

  it('names a piece picked whose name is kept from the reader as no one in particular', () => {
    const targeting = TestBed.inject(EffectTargetingService);
    const masked = GameCharacter.create('黒幕', 1, '');
    masked.hideName = true;
    preset.targeting = 'multi';
    preset.maxTargets = 3;
    vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden').mockReturnValue(false);
    try {
      targeting.begin(preset);
      targeting.pick(masked.identifier);

      expect(fixture.componentInstance.pickedNames()).toEqual(['？？？']);
    } finally {
      targeting.cancel();
      masked.destroy();
    }
  });

  it('does nothing when it is fired with nothing to aim at', () => {
    fixture.detectChanges();

    const row = (fixture.nativeElement as HTMLElement).querySelector('li');
    row?.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    expect(fixture.componentInstance.lastFired()).toBe('');
  });

  it('says so when something cast on yourself has nobody to cast it on', () => {
    fixture.detectChanges();
    const preset = fixture.componentInstance.groups()[0].presets[0];
    preset.targeting = 'self';

    const tile = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((button) =>
      button.textContent?.includes('爆炎')
    )!;
    tile.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.notice()).toContain('対象がいません');
  });

  it('opens the editor on an effect from “edit” in the right-click menu of its tile', () => {
    const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
    const editor = { presetIdentifier: { set: vi.fn() } };
    const openPanel = vi.spyOn(TestBed.inject(PanelService), 'open').mockReturnValue(editor as never);
    fixture.detectChanges();

    const tile = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((button) =>
      button.textContent?.includes('爆炎')
    )!;
    tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const menu = open.mock.calls[0][1] as ContextMenuAction[];
    menu.find((entry) => entry.name === '編集')!.action!();

    expect(openPanel).toHaveBeenCalledWith(EffectPresetEditorComponent, expect.anything());
    expect(editor.presetIdentifier.set).toHaveBeenCalledWith(preset.identifier);
  });
});
