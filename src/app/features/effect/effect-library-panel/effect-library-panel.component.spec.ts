import { WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectFieldService } from '@axe/application/effect/effect-field.service';
import { EFFECT_STAGE_LOADER } from '@axe/application/effect/effect-stage-loader';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { HotbarFillService } from '@axe/application/hotbar/hotbar-fill.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { effectFamilyColor } from '@axe/domain/effect/effect-families';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import {
  EFFECT_TILE_PREVIEW_DELAY_MS,
  EffectLibraryPanelComponent,
} from '@axe/features/effect/effect-library-panel/effect-library-panel.component';
import { EffectPresetEditorComponent } from '@axe/features/effect/effect-preset-editor/effect-preset-editor.component';
import { EffectPreviewComponent } from '@axe/features/effect/effect-preview/effect-preview.component';
import { refuseLocalStorageOutright } from '@axe/testing/refused-storage';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type { MockInstance } from 'vitest';

describe('EffectLibraryPanelComponent', () => {
  let fixture: ComponentFixture<EffectLibraryPanelComponent>;
  let preset: EffectPreset;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EffectLibraryPanelComponent],
      // The preview's small stage is left unmade: what is checked is which effect it is given.
      providers: [...TEST_PROVIDERS, { provide: EFFECT_STAGE_LOADER, useValue: () => Promise.resolve(null) }],
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

  it('holds nothing ready for a guest, who shows nothing on anybody’s table', () => {
    const targeting = TestBed.inject(EffectTargetingService);
    PeerCursor.createMyCursor().role = PeerRole.Guest;
    const panel = fixture.componentInstance as unknown as { choose(preset: EffectPreset): void };

    panel.choose(preset);
    expect(targeting.isPicking()).toBe(false);

    PeerCursor.myCursor.role = PeerRole.Player;
    panel.choose(preset);
    expect(targeting.isPicking()).toBe(true);
    targeting.cancel();
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

  it('says what was searched for when the search finds nothing, how to search, and offers the way back', () => {
    fixture.componentInstance.query.set(' 該当なし ');
    fixture.detectChanges();
    const empty = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="effect-library-empty"]')!;

    expect(fixture.componentInstance.matchCount()).toBe(0);
    expect(empty.textContent).toContain('「該当なし」に一致するエフェクトはありません。');
    expect(empty.textContent).toContain('名前・系統・種類');

    empty.querySelector<HTMLButtonElement>('[data-testid="effect-library-clear-all"]')!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.query()).toBe('');
    expect(fixture.componentInstance.matchCount()).toBe(1);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="effect-library-empty"]')).toBeNull();
  });

  it('says that nothing matches, without a word searched for, where the grade and the reach alone leave nothing', () => {
    fixture.componentInstance.gradeFilter.set(3);
    fixture.detectChanges();
    const empty = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="effect-library-empty"]')!;

    expect(empty.textContent).toContain('一致するエフェクトがありません');
    expect(empty.querySelector('[data-testid="effect-library-clear-all"]')).not.toBeNull();
  });

  it('heads each family with its name and how many effects of it are listed', () => {
    fixture.detectChanges();

    const headings = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[data-family-heading]'));
    expect(headings.map((heading) => heading.textContent?.replace(/\s+/g, ''))).toEqual(['expand_more炎1件']);
    expect(headings[0].getAttribute('aria-expanded')).toBe('true');
  });

  it('folds a family away', () => {
    fixture.detectChanges();
    const rows = () => (fixture.nativeElement as HTMLElement).querySelectorAll('[data-effect-tile]');
    expect(rows()).toHaveLength(1);

    const heading = (fixture.nativeElement as HTMLElement).querySelector('[data-family-heading]');
    heading?.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    // The heading stays and only the contents go.
    expect(heading?.isConnected).toBe(true);
    expect(heading?.getAttribute('aria-expanded')).toBe('false');
    expect(rows()).toHaveLength(0);
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

  it('names a piece whose name is kept from the reader as no one in particular when aimed at or cast from', () => {
    const masked = GameCharacter.create('黒幕', 1, '');
    masked.hideName = true;
    masked.targeted = true;
    vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden').mockReturnValue(false);
    TestBed.inject(SelectionSignalService).selectObject(masked.identifier, masked.aliasName);
    try {
      expect(fixture.componentInstance.targetChips().map((chip) => chip.name)).toEqual(['？？？']);
      expect(fixture.componentInstance.casterName()).toBe('？？？');
    } finally {
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

  describe('adding the defaults the room does not have', () => {
    /** The command in the menu of the list, the menu opened where it is closed. */
    function button(): HTMLButtonElement {
      const host = fixture.nativeElement as HTMLElement;
      if (!host.querySelector('[data-testid="effect-library-menu"]')) {
        host.querySelector<HTMLButtonElement>('[data-testid="effect-library-menu-button"]')!.click();
        fixture.detectChanges();
      }
      return host.querySelector<HTMLButtonElement>('[data-testid="effect-library-add-missing"]')!;
    }

    function defaultsHere(): EffectPreset[] {
      const identifiers = new Set(DEFAULT_EFFECT_PRESET_SEEDS.map((seed) => seed.identifier));
      return ObjectStore.instance
        .getObjects<EffectPreset>(EffectPreset)
        .filter((each) => identifiers.has(each.identifier));
    }

    beforeEach(() => {
      PeerCursor.createMyCursor().role = PeerRole.Player;
    });

    afterEach(() => {
      for (const each of defaultsHere()) ObjectStore.instance.remove(each);
    });

    it('is offered in the menu beside the command that brings the defaults up to date, by name', () => {
      fixture.detectChanges();

      expect(button()).toBeTruthy();
      expect(button().textContent).toContain('足りない既定を追加');
      expect(button().disabled).toBe(false);
      expect(button().previousElementSibling?.getAttribute('data-testid')).toBe('effect-library-restore-defaults');
    });

    it('builds what is missing, leaves the table’s effect alone and says how many it built', () => {
      fixture.detectChanges();
      const before = JSON.stringify(preset.toContext());

      button().click();
      fixture.detectChanges();

      expect(defaultsHere()).toHaveLength(DEFAULT_EFFECT_PRESET_SEEDS.length);
      expect(JSON.stringify(preset.toContext())).toBe(before);
      expect(fixture.componentInstance.noticeLine()).toBe(
        `足りない既定を${DEFAULT_EFFECT_PRESET_SEEDS.length}件追加しました`
      );
    });

    it('says so when no default is missing', () => {
      fixture.detectChanges();
      button().click();

      button().click();
      fixture.detectChanges();

      expect(defaultsHere()).toHaveLength(DEFAULT_EFFECT_PRESET_SEEDS.length);
      expect(fixture.componentInstance.noticeLine()).toBe('足りない既定のエフェクトはありません');
    });

    it('builds nothing for a guest, who changes nothing in the room', () => {
      PeerCursor.myCursor.role = PeerRole.Guest;
      fixture.detectChanges();
      const panel = fixture.componentInstance as unknown as { addMissingDefaults(): void };

      expect(button().disabled).toBe(true);
      panel.addMissingDefaults();

      expect(defaultsHere()).toHaveLength(0);
      expect(fixture.componentInstance.noticeLine()).toBe('');
      PeerCursor.myCursor.role = PeerRole.Player;
    });
  });

  describe('holding an effect ready', () => {
    let targeting: EffectTargetingService;
    let selection: SelectionSignalService;
    let fired: MockInstance<EffectCastService['fire']>;
    let pieces: GameCharacter[];

    beforeEach(() => {
      targeting = TestBed.inject(EffectTargetingService);
      selection = TestBed.inject(SelectionSignalService);
      fired = vi.spyOn(TestBed.inject(EffectCastService), 'fire');
      preset.targeting = 'multi';
      preset.maxTargets = 2;
      pieces = ['ミナ', 'ゴブリン', 'オーク', 'ドラゴン'].map((name, index) => {
        const piece = GameCharacter.create(name, 1, '');
        piece.location.x = index * 200;
        piece.location.y = 0;
        return piece;
      });
    });

    afterEach(() => {
      targeting.cancel();
      for (const piece of pieces) piece.destroy();
    });

    function host(): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    function part(name: string): HTMLElement {
      return host().querySelector<HTMLElement>(`[data-testid="effect-library-${name}"]`)!;
    }

    function tile(): HTMLButtonElement {
      return Array.from(host().querySelectorAll<HTMLButtonElement>('[data-testid="effect-library-list"] button')).find(
        (button) => button.textContent?.includes('爆炎')
      )!;
    }

    function press(piece: GameCharacter): void {
      selection.selectObject(piece.identifier, piece.aliasName);
      TestBed.tick();
      fixture.detectChanges();
    }

    function chips(): string[] {
      return Array.from(host().querySelectorAll('[data-testid="effect-library-target-chip"]')).map(
        (chip) => chip.textContent?.trim() ?? ''
      );
    }

    /** The boxes whose sizes are fixed by their classes, as they are laid out now. */
    function layout(): string {
      const boxes = [
        'filters',
        'stance',
        'preview',
        'stance-name',
        'stance-caster',
        'stance-targets',
        'target-chips',
        'fire',
        'cancel',
        'list',
        'index',
        'rows',
        'notice',
      ];
      return boxes.map((name) => `${name}:${part(name).className}`).join('\n');
    }

    it('lays out the same four regions, each of a fixed height, with nothing chosen, at no target, at one, at the limit and after the cast', () => {
      fixture.detectChanges();
      const regions = ['filters', 'stance', 'list', 'notice'].map((name) => part(name));
      const idle = layout();
      const sameRegions = () => {
        const now = Array.from(host().firstElementChild!.children);
        return now.length === regions.length && now.every((region, index) => region === regions[index]);
      };
      expect(regions.every((region) => region != null)).toBe(true);
      expect(sameRegions()).toBe(true);
      expect(part('stance').className.split(/\s+/)).toContain('shrink-0');
      expect(part('preview').className.split(/\s+/)).toEqual(expect.arrayContaining(['h-22.5', 'w-32', 'shrink-0']));
      expect(part('stance-name').className.split(/\s+/)).toEqual(expect.arrayContaining(['h-7', 'shrink-0']));
      expect(part('stance-caster').className.split(/\s+/)).toEqual(expect.arrayContaining(['h-7', 'shrink-0']));
      expect(part('stance-targets').className.split(/\s+/)).toEqual(expect.arrayContaining(['h-8.5', 'shrink-0']));
      expect(part('notice').className.split(/\s+/)).toEqual(expect.arrayContaining(['h-7', 'shrink-0', 'truncate']));
      expect(part('list').className.split(/\s+/)).toEqual(expect.arrayContaining(['flex-1', 'min-h-0']));
      expect(part('rows').className.split(/\s+/)).toEqual(expect.arrayContaining(['flex-1', 'overflow-y-auto']));
      expect(part('list').contains(part('index'))).toBe(true);
      expect(part('list').contains(part('rows'))).toBe(true);

      const steps: (() => void)[] = [
        () => tile().click(),
        () => press(pieces[1]),
        () => press(pieces[2]),
        () => part('fire').click(),
      ];
      for (const step of steps) {
        step();
        fixture.detectChanges();

        expect(sameRegions()).toBe(true);
        expect(layout()).toBe(idle);
      }
      expect(fired).toHaveBeenCalledTimes(1);
    });

    it('says to choose an effect in the same box while nothing is held ready, with its buttons there but unusable', () => {
      fixture.detectChanges();

      expect(part('stance').getAttribute('data-stance')).toBe('idle');
      expect(part('stance-name').textContent).toContain('エフェクトを選んでください');
      expect((part('fire') as HTMLButtonElement).disabled).toBe(true);
      expect((part('cancel') as HTMLButtonElement).disabled).toBe(true);
      expect(part('preview').children).toHaveLength(0);
    });

    it('holds the effect ready at a click of its tile without casting, and calls it off at a second click', () => {
      fixture.detectChanges();

      tile().click();
      fixture.detectChanges();

      expect(fired).not.toHaveBeenCalled();
      expect(targeting.preset()).toBe(preset);
      expect(part('stance').getAttribute('data-stance')).toBe('aiming');
      expect(part('stance-name').textContent).toContain('爆炎');
      expect(part('stance-count').textContent?.trim()).toBe('0/2');
      expect((part('fire') as HTMLButtonElement).disabled).toBe(true);
      expect((part('cancel') as HTMLButtonElement).disabled).toBe(false);

      tile().click();
      fixture.detectChanges();

      expect(targeting.isPicking()).toBe(false);
      expect(fired).not.toHaveBeenCalled();
    });

    it('holds an effect cast on yourself ready too, casting it only at the button', () => {
      preset.targeting = 'self';
      selection.selectObject(pieces[0].identifier, pieces[0].aliasName);
      TestBed.tick();
      fixture.detectChanges();

      tile().click();
      TestBed.tick();
      fixture.detectChanges();

      expect(fired).not.toHaveBeenCalled();
      expect(targeting.isPicking()).toBe(true);
      expect(chips()).toEqual(['ミナ']);

      part('fire').click();
      fixture.detectChanges();

      expect(fired).toHaveBeenCalledTimes(1);
      expect(fired.mock.calls[0][1].map((target) => target.identifier)).toEqual([pieces[0].identifier]);
      expect(part('notice').textContent).toContain('ミナ');
    });

    it('casts nothing on the limit being filled, and once at its button, saying whom at on the line of notices', () => {
      fixture.detectChanges();
      tile().click();
      press(pieces[1]);
      press(pieces[2]);

      expect(part('stance-count').textContent?.trim()).toBe('2/2');
      expect(fired).not.toHaveBeenCalled();
      expect(targeting.isPicking()).toBe(true);

      part('fire').click();
      fixture.detectChanges();

      expect(fired).toHaveBeenCalledTimes(1);
      expect(targeting.isPicking()).toBe(false);
      expect(part('notice').textContent).toContain('ゴブリン');
      expect(part('notice').textContent).toContain('オーク');
    });

    it('calls the effect off at its cancel button', () => {
      fixture.detectChanges();
      tile().click();
      press(pieces[1]);

      part('cancel').click();
      fixture.detectChanges();

      expect(targeting.isPicking()).toBe(false);
      expect(pieces[1].targeted).toBe(false);
      expect(fired).not.toHaveBeenCalled();
    });

    it('shows the selected piece as the caster to be, and not as a target, before an effect is chosen', () => {
      press(pieces[0]);

      expect(part('stance-caster').textContent).toContain('撃ち手（予定）');
      expect(part('caster-name').textContent?.trim()).toBe('ミナ');
      expect(chips()).toEqual([]);
      expect(part('stance-targets').textContent).toContain('なし');
    });

    it('names before an effect is chosen the pieces already aimed at, which it would start with', () => {
      pieces[2].targeted = true;
      fixture.detectChanges();

      expect(chips()).toEqual(['オーク']);
    });

    it('names the caster fixed when the effect was held ready, however many targets are pressed after', () => {
      press(pieces[0]);
      tile().click();
      fixture.detectChanges();
      expect(part('stance-caster').textContent).not.toContain('予定');

      press(pieces[1]);
      expect(part('caster-name').textContent?.trim()).toBe('ミナ');
      press(pieces[2]);
      expect(part('caster-name').textContent?.trim()).toBe('ミナ');

      expect(chips()).toEqual(['ゴブリン', 'オーク']);
      expect(fixture.componentInstance.casterName()).toBe('ミナ');
    });

    it('takes the next piece pressed as the caster once asked to change it, leaving it out of the targets', () => {
      press(pieces[0]);
      tile().click();
      press(pieces[1]);

      part('change-caster').click();
      fixture.detectChanges();
      expect(part('change-caster').getAttribute('aria-pressed')).toBe('true');
      expect(part('caster-name').textContent).toContain('卓のコマを押してください');

      press(pieces[3]);

      expect(part('caster-name').textContent?.trim()).toBe('ドラゴン');
      expect(part('change-caster').getAttribute('aria-pressed')).toBe('false');
      expect(chips()).toEqual(['ゴブリン']);
      expect(targeting.casterMark()?.identifier).toBe(pieces[3].identifier);
    });

    it('stops waiting for a caster at a second press of the button that asked for one', () => {
      fixture.detectChanges();
      tile().click();
      fixture.detectChanges();

      part('change-caster').click();
      part('change-caster').click();
      press(pieces[1]);

      expect(targeting.casterIdentifier()).toBe('');
      expect(chips()).toEqual(['ゴブリン']);
    });

    it('casts from no piece once the caster is set to none', () => {
      press(pieces[0]);
      tile().click();
      fixture.detectChanges();
      expect((part('no-caster') as HTMLButtonElement).disabled).toBe(false);

      part('no-caster').click();
      fixture.detectChanges();

      expect(targeting.casterIdentifier()).toBe('');
      expect(part('caster-name').textContent?.trim()).toBe('なし');
      expect((part('no-caster') as HTMLButtonElement).disabled).toBe(true);
    });

    it('names every target on one line that scrolls sideways, none shrunk, wrapped or folded into a count', () => {
      preset.maxTargets = 4;
      const names = ['とても長い名前のゴブリンの王', 'とても長い名前のオークの将軍', 'とても長い名前のドラゴンの長老'];
      pieces.slice(1).forEach((piece, index) => (piece.name = names[index]));
      fixture.detectChanges();
      tile().click();
      for (const piece of pieces.slice(1)) press(piece);
      const row = part('target-chips');

      expect(chips()).toEqual(names);
      expect(row.className.split(/\s+/)).toEqual(
        expect.arrayContaining(['flex-nowrap', 'overflow-x-auto', 'overflow-y-hidden', 'min-w-0'])
      );
      for (const chip of Array.from(row.children)) {
        expect(chip.className.split(/\s+/)).toEqual(expect.arrayContaining(['shrink-0', 'whitespace-nowrap']));
        expect(chip.className).not.toContain('truncate');
      }
      expect(row.textContent).not.toMatch(/\+\d/);
    });

    it('gives the buttons that cast and call off a height a finger can press on a touch screen', () => {
      fixture.detectChanges();

      for (const name of ['fire', 'cancel']) {
        expect(part(name).className.split(/\s+/)).toContain('pointer-coarse:h-11');
      }
    });

    it('lists the effects left standing in a headed group at the end of the list, where each can be taken away', () => {
      const fields = TestBed.inject(EffectFieldService);
      fixture.detectChanges();
      expect(host().querySelector('[data-testid="effect-library-fields"]')).toBeNull();

      const field = fields.place(preset, 0, 0, 0);
      fixture.detectChanges();
      try {
        const list = part('rows');
        const group = part('fields');
        expect(list.lastElementChild).toBe(group);
        expect(group.previousElementSibling).toBe(part('fields-heading'));
        expect(part('fields-heading').textContent).toContain('置いてある演出');
        expect(group.textContent).toContain('爆炎');

        group.querySelector('button')!.click();
        fixture.detectChanges();

        expect(fields.fields()).toEqual([]);
        expect(host().querySelector('[data-testid="effect-library-fields"]')).toBeNull();
      } finally {
        if (fields.fields().includes(field)) field.destroy();
      }
    });

    it('says whom a cast confirmed away from the panel was at, by Enter or from the band, on the line of notices', () => {
      fixture.detectChanges();
      tile().click();
      press(pieces[1]);
      press(pieces[2]);

      targeting.confirm();
      fixture.detectChanges();

      expect(part('notice').textContent).toContain('ゴブリン');
      expect(part('notice').textContent).toContain('オーク');
    });

    it('says nothing on opening of a cast made before it was open', () => {
      targeting.begin(preset);
      targeting.pick(pieces[1].identifier);
      targeting.confirm();
      const later = TestBed.createComponent(EffectLibraryPanelComponent);

      later.detectChanges();

      expect(later.componentInstance.noticeLine()).toBe('');
      later.destroy();
    });

    it('changes and takes away the caster by buttons that say what they do, of a fixed height, leaving the row to the name', () => {
      press(pieces[0]);
      tile().click();
      fixture.detectChanges();

      expect(part('change-caster').getAttribute('aria-label')).toBe('撃ち手を変える');
      expect(part('no-caster').getAttribute('aria-label')).toBe('撃ち手をなしにする');
      expect(part('change-caster').textContent?.replace(/\s+/g, '')).toBe('touch_app変える');
      expect(part('no-caster').textContent?.replace(/\s+/g, '')).toBe('blockなしにする');
      for (const name of ['change-caster', 'no-caster']) {
        expect(part(name).className.split(/\s+/)).toEqual(expect.arrayContaining(['h-6', 'shrink-0']));
        expect(part(name).querySelector('.material-icons')?.getAttribute('aria-hidden')).toBe('true');
        expect(part(name).getAttribute('title')).toBeTruthy();
      }
      expect(part('caster-name').className.split(/\s+/)).toEqual(expect.arrayContaining(['min-w-0', 'flex-1']));
    });

    it('says a notice and whom the last cast was at on the one line, the later of the two', () => {
      fixture.detectChanges();
      const line = part('notice');
      expect(line.textContent?.trim()).toBe('');

      fixture.componentInstance.notice.set('書き出しました');
      fixture.detectChanges();
      expect(part('notice')).toBe(line);
      expect(line.textContent?.trim()).toBe('書き出しました');

      tile().click();
      press(pieces[1]);
      part('fire').click();
      fixture.detectChanges();
      expect(part('notice')).toBe(line);
      expect(line.textContent).toContain('ゴブリン');
      expect(line.textContent).not.toContain('書き出しました');

      (fixture.componentInstance as unknown as { insertToken(preset: EffectPreset): void }).insertToken(preset);
      fixture.detectChanges();
      expect(line.textContent).not.toContain('ゴブリン');
      expect(host().querySelectorAll('[data-testid="effect-library-notice"]')).toHaveLength(1);
    });
  });

  describe('the preview in the box an effect is held ready in', () => {
    let targeting: EffectTargetingService;
    let canHover: WritableSignal<boolean>;
    let other: EffectPreset;

    beforeEach(() => {
      targeting = TestBed.inject(EffectTargetingService);
      canHover = (TestBed.inject(ViewportService) as unknown as { _canHover: WritableSignal<boolean> })._canHover;
      canHover.set(true);
      other = new EffectPreset();
      other.name = '氷結';
      other.tagName = '氷';
      ObjectStore.instance.add(other, false);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    afterEach(() => {
      vi.useRealTimers();
      targeting.cancel();
      canHover.set(false);
      ObjectStore.instance.remove(other);
    });

    function host(): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    function box(): HTMLElement {
      return host().querySelector<HTMLElement>('[data-testid="effect-library-preview"]')!;
    }

    function tileOf(name: string): HTMLButtonElement {
      return Array.from(host().querySelectorAll<HTMLButtonElement>('[data-effect-tile]')).find((button) =>
        button.textContent?.includes(name)
      )!;
    }

    function previews(): EffectPreviewComponent[] {
      return fixture.debugElement
        .queryAll(By.directive(EffectPreviewComponent))
        .map((preview) => preview.componentInstance as EffectPreviewComponent);
    }

    function rest(ms = EFFECT_TILE_PREVIEW_DELAY_MS): void {
      vi.advanceTimersByTime(ms);
      fixture.detectChanges();
    }

    it('is not made until there is an effect to play, then is the one canvas of the panel in a box that stays as it was', () => {
      fixture.detectChanges();
      const shape = box().className;
      expect(previews()).toHaveLength(0);
      expect(host().querySelectorAll('canvas')).toHaveLength(0);

      tileOf('爆炎').click();
      fixture.detectChanges();

      expect(previews()).toHaveLength(1);
      expect(previews()[0].preset()).toBe(preset);
      expect(previews()[0].fill()).toBe(true);
      expect(host().querySelectorAll('canvas')).toHaveLength(1);
      expect(box().querySelectorAll('canvas')).toHaveLength(1);
      expect(box().className).toBe(shape);
    });

    it('plays the effect held ready, another once that is held instead, and nothing once it is called off, on the one preview', () => {
      fixture.detectChanges();
      tileOf('爆炎').click();
      fixture.detectChanges();
      const [preview] = previews();

      tileOf('氷結').click();
      fixture.detectChanges();
      expect(previews()).toEqual([preview]);
      expect(preview.preset()).toBe(other);

      targeting.cancel();
      fixture.detectChanges();
      expect(previews()).toEqual([preview]);
      expect(preview.preset()).toBeNull();
      expect(host().querySelectorAll('canvas')).toHaveLength(1);
    });

    it('plays an effect held ready from somewhere other than the list', () => {
      fixture.detectChanges();

      targeting.begin(other);
      fixture.detectChanges();

      expect(previews().map((preview) => preview.preset())).toEqual([other]);
    });

    it('plays the effect of a tile the pointer has rested on for a moment, until the pointer leaves it', () => {
      fixture.detectChanges();
      const tile = tileOf('氷結').parentElement!;

      tile.dispatchEvent(new MouseEvent('mouseenter'));
      rest(EFFECT_TILE_PREVIEW_DELAY_MS - 1);
      expect(previews()).toHaveLength(0);

      rest(1);
      expect(previews().map((preview) => preview.preset())).toEqual([other]);

      tile.dispatchEvent(new MouseEvent('mouseleave'));
      fixture.detectChanges();
      expect(previews().map((preview) => preview.preset())).toEqual([null]);
    });

    it('plays nothing for a tile the pointer only passes over', () => {
      fixture.detectChanges();
      const tile = tileOf('氷結').parentElement!;

      tile.dispatchEvent(new MouseEvent('mouseenter'));
      rest(EFFECT_TILE_PREVIEW_DELAY_MS - 1);
      tile.dispatchEvent(new MouseEvent('mouseleave'));
      rest(EFFECT_TILE_PREVIEW_DELAY_MS);

      expect(previews()).toHaveLength(0);
    });

    it('plays the effect of a tile the keyboard’s focus has rested on, until the focus leaves it', () => {
      fixture.detectChanges();

      tileOf('氷結').dispatchEvent(new FocusEvent('focus'));
      rest();
      expect(previews().map((preview) => preview.preset())).toEqual([other]);

      tileOf('氷結').dispatchEvent(new FocusEvent('blur'));
      fixture.detectChanges();
      expect(previews().map((preview) => preview.preset())).toEqual([null]);
    });

    it('keeps to the effect held ready whatever tile is pointed at', () => {
      fixture.detectChanges();
      tileOf('爆炎').click();
      fixture.detectChanges();

      tileOf('氷結').parentElement!.dispatchEvent(new MouseEvent('mouseenter'));
      rest();

      expect(previews().map((preview) => preview.preset())).toEqual([preset]);
    });

    it('plays only the effect held ready where the main pointer cannot hover', () => {
      canHover.set(false);
      fixture.detectChanges();

      tileOf('氷結').parentElement!.dispatchEvent(new MouseEvent('mouseenter'));
      tileOf('氷結').dispatchEvent(new FocusEvent('focus'));
      rest();
      expect(previews()).toHaveLength(0);

      tileOf('氷結').click();
      fixture.detectChanges();
      expect(previews().map((preview) => preview.preset())).toEqual([other]);
    });

    it('follows the values of the effect it plays as they are changed', () => {
      fixture.detectChanges();
      tileOf('爆炎').click();
      fixture.detectChanges();
      const before = previews()[0].version();

      TestBed.inject(ObjectChangeService).notifyChanged(preset.identifier);
      fixture.detectChanges();

      expect(previews()[0].version()).not.toBe(before);
    });
  });

  describe('the keyboard among the tiles', () => {
    let targeting: EffectTargetingService;
    let fired: MockInstance<EffectCastService['fire']>;
    let other: EffectPreset;
    let piece: GameCharacter;
    let onDocument: ReturnType<typeof vi.fn<(event: KeyboardEvent) => void>>;

    beforeEach(() => {
      targeting = TestBed.inject(EffectTargetingService);
      fired = vi.spyOn(TestBed.inject(EffectCastService), 'fire');
      other = new EffectPreset();
      other.name = '氷結';
      other.tagName = '氷';
      ObjectStore.instance.add(other, false);
      piece = GameCharacter.create('ゴブリン', 1, '');
      onDocument = vi.fn<(event: KeyboardEvent) => void>();
      document.addEventListener('keydown', onDocument);
    });

    afterEach(() => {
      document.removeEventListener('keydown', onDocument);
      targeting.cancel();
      piece.destroy();
      ObjectStore.instance.remove(other);
    });

    function tiles(): HTMLButtonElement[] {
      return Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[data-effect-tile]')
      );
    }

    function key(target: HTMLElement, name: string): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      fixture.detectChanges();
      return event;
    }

    it('gives the Tab key one stop among the tiles, the first until another is focused', () => {
      fixture.detectChanges();
      expect(tiles().map((tile) => tile.getAttribute('tabindex'))).toEqual(['0', '-1']);

      tiles()[1].dispatchEvent(new FocusEvent('focus'));
      fixture.detectChanges();

      expect(tiles().map((tile) => tile.getAttribute('tabindex'))).toEqual(['-1', '0']);
    });

    it('falls back to the first tile once the one that held the stop is narrowed away', () => {
      fixture.detectChanges();
      tiles()[1].dispatchEvent(new FocusEvent('focus'));
      fixture.componentInstance.query.set('爆炎');
      fixture.detectChanges();

      expect(tiles().map((tile) => tile.getAttribute('tabindex'))).toEqual(['0']);
    });

    it('moves the focus from tile to tile by the arrows, Home and End, keeping the keys from the table', () => {
      fixture.detectChanges();
      const [first, second] = tiles();
      first.focus();

      const right = key(first, 'ArrowRight');
      expect(document.activeElement).toBe(second);
      expect(right.defaultPrevented).toBe(true);

      key(second, 'ArrowRight');
      expect(document.activeElement).toBe(second);
      key(second, 'ArrowLeft');
      expect(document.activeElement).toBe(first);
      key(first, 'End');
      expect(document.activeElement).toBe(second);
      key(second, 'Home');
      expect(document.activeElement).toBe(first);
      expect(onDocument).not.toHaveBeenCalled();
    });

    it('leaves the arrows alone outside the tiles and with a modifier held', () => {
      fixture.detectChanges();
      const [first] = tiles();
      first.focus();

      const held = new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true, cancelable: true });
      first.dispatchEvent(held);
      const heading = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-family-heading]')!;
      const outside = key(heading, 'ArrowRight');

      expect(held.defaultPrevented).toBe(false);
      expect(outside.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(first);
    });

    it('holds a tile’s effect ready at Enter without the key reaching the table, which would cast at the same press', () => {
      piece.targeted = true;
      fixture.detectChanges();

      const enter = key(tiles()[0], 'Enter');

      expect(targeting.preset()).toBe(preset);
      expect(enter.defaultPrevented).toBe(true);
      expect(onDocument).not.toHaveBeenCalled();
      expect(fired).not.toHaveBeenCalled();
    });

    it('holds another tile’s effect ready at Enter in place of the one held, casting neither', () => {
      piece.targeted = true;
      fixture.detectChanges();
      tiles()[0].click();
      fixture.detectChanges();
      const second = tiles().find((tile) => tile.textContent?.includes('氷結'))!;

      key(second, 'Enter');

      expect(targeting.preset()).toBe(other);
      expect(onDocument).not.toHaveBeenCalled();
      expect(fired).not.toHaveBeenCalled();
    });

    it('leaves Enter on the tile of the effect held ready to the table, neither calling it off nor casting it itself', () => {
      piece.targeted = true;
      fixture.detectChanges();
      tiles()[0].click();
      fixture.detectChanges();
      const heldTile = tiles().find((tile) => tile.getAttribute('aria-pressed') === 'true')!;

      const enter = key(heldTile, 'Enter');

      expect(onDocument).toHaveBeenCalledTimes(1);
      expect(enter.defaultPrevented).toBe(false);
      expect(targeting.preset()).toBe(preset);
      expect(fired).not.toHaveBeenCalled();
    });
  });

  describe('for a guest, who changes nothing in the room', () => {
    type Commands = Record<'createPreset' | 'restoreDefaults', () => void> &
      Record<'duplicatePreset' | 'removePreset' | 'openEditor' | 'placeField', (preset: EffectPreset) => void> & {
        removeField(field: unknown): void;
      };

    let commands: Commands;
    let piece: GameCharacter;

    function presetsHere(): EffectPreset[] {
      return ObjectStore.instance.getObjects<EffectPreset>(EffectPreset);
    }

    beforeEach(() => {
      PeerCursor.createMyCursor().role = PeerRole.Guest;
      commands = fixture.componentInstance as unknown as Commands;
      piece = GameCharacter.create('的', 1, '');
      TestBed.inject(SelectionSignalService).selectObject(piece.identifier, piece.aliasName);
    });

    afterEach(() => {
      PeerCursor.myCursor.role = PeerRole.Player;
      TestBed.inject(SelectionSignalService).selectedObject.set(null);
      for (const each of presetsHere()) if (each !== preset) ObjectStore.instance.remove(each);
      ObjectStore.instance.remove(piece);
    });

    it('offers no button that makes an effect, brings the defaults up to date, edits one or clears one left standing', () => {
      const fields = TestBed.inject(EffectFieldService);
      const field = fields.place(preset, 0, 0, 0);
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      try {
        host.querySelector<HTMLButtonElement>('[data-testid="effect-library-menu-button"]')!.click();
        fixture.detectChanges();
        for (const name of ['create', 'restore-defaults', 'add-missing']) {
          expect(host.querySelector<HTMLButtonElement>(`[data-testid="effect-library-${name}"]`)!.disabled).toBe(true);
        }
        for (const name of ['export', 'auto-play', 'collapse-all', 'expand-all']) {
          expect(host.querySelector<HTMLButtonElement>(`[data-testid="effect-library-${name}"]`)!.disabled).toBe(false);
        }
        expect(host.querySelector('[data-testid="effect-library-fields"] button')).toBeNull();
        expect(
          Array.from(host.querySelectorAll('button')).some((button) => button.getAttribute('title') === '編集')
        ).toBe(false);

        PeerCursor.myCursor.role = PeerRole.Player;
        TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
        fixture.detectChanges();

        expect(host.querySelector<HTMLButtonElement>('[data-testid="effect-library-create"]')!.disabled).toBe(false);
        expect(host.querySelector('[data-testid="effect-library-fields"] button')).not.toBeNull();
        expect(
          Array.from(host.querySelectorAll('button')).some((button) => button.getAttribute('title') === '編集')
        ).toBe(true);
      } finally {
        field.destroy();
      }
    });

    it('makes, copies, deletes and refreshes no effect, and opens none for editing', async () => {
      const openPanel = vi.spyOn(TestBed.inject(PanelService), 'open');
      const asked = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
      const before = presetsHere();

      commands.createPreset();
      commands.duplicatePreset(preset);
      commands.restoreDefaults();
      commands.openEditor(preset);
      commands.removePreset(preset);
      await Promise.resolve();

      expect(presetsHere()).toEqual(before);
      expect(openPanel).not.toHaveBeenCalled();
      expect(asked).not.toHaveBeenCalled();
      expect(fixture.componentInstance.noticeLine()).toBe('');
    });

    it('deletes nothing for a seat made a guest while it was asked whether to', async () => {
      PeerCursor.myCursor.role = PeerRole.Player;
      let answer: (ok: boolean) => void = () => undefined;
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockReturnValue(
        new Promise<boolean>((resolve) => (answer = resolve))
      );

      commands.removePreset(preset);
      PeerCursor.myCursor.role = PeerRole.Guest;
      answer(true);
      await Promise.resolve();
      await Promise.resolve();

      expect(presetsHere()).toContain(preset);
    });

    it('leaves no effect standing on the table and clears none away', () => {
      const fields = TestBed.inject(EffectFieldService);
      PeerCursor.myCursor.role = PeerRole.Player;
      const field = fields.place(preset, 0, 0, 0);
      PeerCursor.myCursor.role = PeerRole.Guest;
      try {
        commands.placeField(preset);
        commands.removeField(field);

        expect(fields.fields()).toEqual([field]);
      } finally {
        field.destroy();
      }
    });

    it('is offered in the right-click menu of a tile only what leaves the room as it is', () => {
      const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
      fixture.detectChanges();

      const tile = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-effect-tile]')!;
      tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      const menu = open.mock.calls[0][1] as ContextMenuAction[];

      expect(menu.filter((entry) => entry.name).map((entry) => entry.name)).toEqual([
        '試し撃ち',
        'チャット記法を入力欄へ',
        'ホットバーに入れる',
        '書き出す',
      ]);
    });
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

  it('tries an effect out on the table from the first entry of the right-click menu of its tile, beside the preview in the panel', () => {
    const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
    const tried = vi.spyOn(TestBed.inject(EffectCastService), 'preview').mockReturnValue(null);
    fixture.detectChanges();

    const tile = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-effect-tile]')!;
    tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const menu = open.mock.calls[0][1] as ContextMenuAction[];
    expect(menu.filter((entry) => entry.name)).toHaveLength(8);
    menu[0].action!();
    fixture.detectChanges();

    expect(tried).toHaveBeenCalledWith(preset);
    expect(fixture.componentInstance.noticeLine()).toContain('対象がいません');
  });

  describe('the shelf laid out', () => {
    let more: EffectPreset[];

    function add(name: string, tag: string, values: Partial<EffectPreset> = {}): EffectPreset {
      const made = new EffectPreset();
      made.name = name;
      made.tagName = tag;
      Object.assign(made, values);
      ObjectStore.instance.add(made, false);
      more.push(made);
      return made;
    }

    function host(): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    function part<T extends HTMLElement = HTMLElement>(name: string): T {
      return host().querySelector<T>(`[data-testid="effect-library-${name}"]`)!;
    }

    function rows(): HTMLElement[] {
      return Array.from(host().querySelectorAll<HTMLElement>('[data-effect-tile]'));
    }

    function rowNames(): string[] {
      return rows().map((row) => row.querySelector('[data-effect-name]')!.textContent!.replace(/\s+/g, ''));
    }

    function rowOf(name: string): HTMLElement {
      return rows().find((row) => row.querySelector('[data-effect-name]')!.textContent!.includes(name))!;
    }

    function index(): { tag: string; text: string; element: HTMLButtonElement }[] {
      return Array.from(host().querySelectorAll<HTMLButtonElement>('[data-family-entry]')).map((element) => ({
        tag: element.getAttribute('data-family') ?? '',
        text: element.textContent!.replace(/\s+/g, '').replace(/(\d+)$/, ' $1'),
        element,
      }));
    }

    function openMenu(): HTMLElement {
      part<HTMLButtonElement>('menu-button').click();
      fixture.detectChanges();
      return part('menu');
    }

    beforeEach(() => {
      PeerCursor.createMyCursor().role = PeerRole.Player;
      more = [];
      // 爆炎, the effect of every spec here, takes one piece at grade 2 and is drawn as a burst.
      add('大爆発', '炎', { grade: 3, kind: 'nova', targeting: 'multi', maxTargets: 8, areaRadius: 3 });
      add('業火', '炎', { grade: 3, kind: 'mushroom', targeting: 'multi', maxTargets: 8, areaRadius: 4 });
      add('絶対零度', '氷', { grade: 3, kind: 'frost', targeting: 'multi', maxTargets: 8, areaRadius: 3 });
      add('氷のブレス', '氷', { grade: 2, kind: 'breath', targeting: 'multi', maxTargets: 4 });
      add('闘気', '強化', { grade: 1, kind: 'aura', targeting: 'self' });
      add('自作の技', '', { grade: 1, kind: 'slash' });
    });

    afterEach(() => {
      for (const made of more) ObjectStore.instance.remove(made);
      TestBed.inject(ButtonGuideService).hide();
      localStorage.removeItem(STORAGE_KEYS.effectLibrarySize);
    });

    describe('the rows', () => {
      it('show each effect’s grade in stars, whom it reaches and the name of its kind', () => {
        fixture.detectChanges();
        const facts = (name: string) => {
          const row = rowOf(name);
          return [
            row.querySelector('[data-effect-grade]')!.textContent,
            row.querySelector('[data-effect-reach]')!.textContent!.replace(/\s+/g, ''),
            row.querySelector('[data-effect-kind]')!.textContent!.trim(),
          ];
        };

        expect(facts('爆炎')).toEqual(['★★★', 'person単体', '爆発']);
        expect(facts('大爆発')).toEqual(['★★★', 'blur_circular範囲3マス', '閃光']);
        expect(facts('業火')).toEqual(['★★★', 'blur_circular範囲4マス', 'きのこ雲']);
        expect(facts('氷のブレス')).toEqual(['★★★', 'groups4体まで', 'ブレス']);
        expect(facts('闘気')).toEqual(['★★★', 'self_improvement自分', '闘気']);
      });

      it('fill as many stars as the grade and leave the rest faint', () => {
        fixture.detectChanges();
        const filled = (name: string) => {
          const grade = rowOf(name).querySelector('[data-effect-grade]')!;
          return [grade.firstChild!.textContent, grade.querySelector('span')!.textContent];
        };

        expect(filled('闘気')).toEqual(['★', '★★']);
        expect(filled('爆炎')).toEqual(['★★', '★']);
        expect(filled('大爆発')).toEqual(['★★★', '']);
      });

      it('pick out a reach that takes in an area from the others', () => {
        fixture.detectChanges();
        const reach = (name: string) => rowOf(name).querySelector('[data-effect-reach]')!;

        expect(reach('大爆発').getAttribute('data-reach')).toBe('area');
        expect(reach('大爆発').className.split(/\s+/)).toContain('text-ui-notable');
        expect(reach('氷のブレス').getAttribute('data-reach')).toBe('multi');
        expect(reach('氷のブレス').className.split(/\s+/)).not.toContain('text-ui-notable');
      });

      it('draw each effect’s mark 28 pixels square and say everything of the row in its name', () => {
        fixture.detectChanges();
        const row = rowOf('大爆発');
        const glyph = row.querySelector('[data-effect-glyph]')!;

        expect(glyph.className.split(/\s+/)).toEqual(expect.arrayContaining(['size-7', 'shrink-0']));
        expect(glyph.querySelector('svg')).not.toBeNull();
        expect(row.getAttribute('aria-label')).toBe('大爆発 — 上級 / 範囲3マス / 閃光');
        expect(row.getAttribute('title')).toBe(row.getAttribute('aria-label'));
      });

      it('let a long name run onto a second line rather than cutting it short', () => {
        add('とても長い名前のエフェクトをここに置いてみる', '炎');
        fixture.detectChanges();
        const name = rowOf('とても長い名前').querySelector('[data-effect-name]')!;

        expect(name.className.split(/\s+/)).toEqual(expect.arrayContaining(['line-clamp-2', 'wrap-anywhere']));
        expect(name.className.split(/\s+/)).not.toContain('truncate');
      });
    });

    describe('the index of families', () => {
      it('lists every family with its count, in the order of the list, the effects of no family last', () => {
        fixture.detectChanges();

        expect(index().map((entry) => entry.text)).toEqual(['炎 3', '氷 2', '強化 1', 'その他 1']);
        expect(part('index').getAttribute('aria-label')).toBe('系統の索引');
      });

      it('marks each family in its own colour, the same on its heading, as the theme on screen takes it', () => {
        const theme = TestBed.inject(ThemeService);
        const swatches = () => [
          index()[0].element.querySelector('span')!.style.background,
          host().querySelector<HTMLElement>('[data-family-heading] span')!.style.background,
        ];
        theme.theme.set('dark');
        fixture.detectChanges();
        expect(swatches()).toEqual([effectFamilyColor('炎').dark, effectFamilyColor('炎').dark]);

        theme.theme.set('light');
        fixture.detectChanges();

        expect(swatches()).toEqual([effectFamilyColor('炎').light, effectFamilyColor('炎').light]);
        theme.theme.set('auto');
      });

      it('counts what the list is narrowed to, and keeps a family narrowed out of it in its place, faint', () => {
        fixture.componentInstance.reachFilter.set('area');
        fixture.detectChanges();

        expect(index().map((entry) => entry.text)).toEqual(['炎 2', '氷 1', '強化 0', 'その他 0']);
        const [fire, , buff] = index();
        expect(buff.element.getAttribute('aria-disabled')).toBe('true');
        expect(buff.element.className.split(/\s+/)).toContain('opacity-45');
        expect(fire.element.getAttribute('aria-disabled')).toBeNull();
        expect(fire.element.className.split(/\s+/)).not.toContain('opacity-45');
      });

      it('marks the first family the list shows as the one it stands at, and the family pressed after that', () => {
        fixture.detectChanges();
        const current = () => index().filter((entry) => entry.element.getAttribute('aria-current') === 'true');
        expect(current().map((entry) => entry.tag)).toEqual(['炎']);

        index()[1].element.click();
        fixture.detectChanges();

        expect(current().map((entry) => entry.tag)).toEqual(['氷']);
        expect(rowNames()).toHaveLength(7);
      });

      it('leaves the list as it is narrowed when a family is pressed: nothing is taken out of it', () => {
        fixture.detectChanges();
        const before = rowNames();

        index()[2].element.click();
        fixture.detectChanges();

        expect(rowNames()).toEqual(before);
        expect(fixture.componentInstance.hasFilter()).toBe(false);
      });

      it('opens a family folded away as it is pressed in the index', () => {
        fixture.detectChanges();
        const heading = () => host().querySelector<HTMLElement>('[data-family-section="氷"] [data-family-heading]')!;
        heading().click();
        fixture.detectChanges();
        expect(heading().getAttribute('aria-expanded')).toBe('false');

        index()[1].element.click();
        fixture.detectChanges();

        expect(heading().getAttribute('aria-expanded')).toBe('true');
      });

      it('does nothing at a family the list shows nothing of', () => {
        fixture.componentInstance.reachFilter.set('area');
        fixture.detectChanges();

        index()[2].element.click();
        fixture.detectChanges();

        expect(index().find((entry) => entry.element.getAttribute('aria-current') === 'true')?.tag).toBe('炎');
      });

      it('marks the family whose heading has reached the top of the list as it is scrolled', () => {
        fixture.detectChanges();
        const list = part('rows');
        const sections = Array.from(list.querySelectorAll<HTMLElement>('[data-family-section]'));
        sections.forEach((section, at) => vi.spyOn(section, 'offsetTop', 'get').mockReturnValue(at * 200));

        list.scrollTop = 410;
        list.dispatchEvent(new Event('scroll'));
        fixture.detectChanges();

        expect(index().find((entry) => entry.element.getAttribute('aria-current') === 'true')?.tag).toBe('強化');
      });

      it('marks the family at the top of the list once the list shows others under it without a scroll', async () => {
        const laidOut = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
        const tops = vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
          this: HTMLElement
        ) {
          const sections = Array.from(this.parentElement?.querySelectorAll(':scope > [data-family-section]') ?? []);
          return Math.max(sections.indexOf(this), 0) * 200;
        });
        try {
          const current = () => index().find((entry) => entry.element.getAttribute('aria-current') === 'true')?.tag;
          fixture.componentInstance.reachFilter.set('area');
          fixture.detectChanges();
          index()[1].element.click();
          fixture.detectChanges();
          await fixture.whenStable();
          expect(current()).toBe('氷');

          part('rows').scrollTop = 0;
          fixture.componentInstance.reachFilter.set(null);
          fixture.detectChanges();
          await fixture.whenStable();
          fixture.detectChanges();

          expect(current()).toBe('炎');
        } finally {
          laidOut.mockRestore();
          tops.mockRestore();
        }
      });

      it('gives the Tab key one stop in the index, and moves among the families by the arrows, Home and End', () => {
        const onDocument = vi.fn();
        document.addEventListener('keydown', onDocument);
        fixture.detectChanges();
        const key = (target: HTMLElement, name: string) => {
          const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
          target.dispatchEvent(event);
          return event;
        };
        try {
          expect(index().map((entry) => entry.element.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
          const entries = index().map((entry) => entry.element);
          entries[0].focus();

          expect(key(entries[0], 'ArrowDown').defaultPrevented).toBe(true);
          expect(document.activeElement).toBe(entries[1]);
          key(entries[1], 'End');
          expect(document.activeElement).toBe(entries[3]);
          key(entries[3], 'ArrowDown');
          expect(document.activeElement).toBe(entries[3]);
          key(entries[3], 'Home');
          expect(document.activeElement).toBe(entries[0]);
          expect(onDocument).not.toHaveBeenCalled();

          expect(key(entries[0], 'ArrowRight').defaultPrevented).toBe(false);
        } finally {
          document.removeEventListener('keydown', onDocument);
        }
      });
    });

    describe('narrowing', () => {
      function pressed(group: string): string[] {
        return Array.from(part(group).querySelectorAll('button'))
          .filter((button) => button.getAttribute('aria-pressed') === 'true')
          .map((button) => button.textContent!.replace(/\s+/g, ''));
      }

      it('offers the grades and the reaches as two named rows of buttons, all of each chosen at first', () => {
        fixture.detectChanges();
        const labels = (group: string) =>
          Array.from(part(group).querySelectorAll('button')).map((button) => button.textContent!.replace(/\s+/g, ''));

        expect(labels('grades')).toEqual(['すべて', '初級', '中級', '上級']);
        expect(labels('reaches')).toEqual(['すべて', 'person単体', 'groups複数', 'blur_circular範囲']);
        expect(part('grades').parentElement!.getAttribute('aria-label')).toBe('等級');
        expect(part('reaches').parentElement!.getAttribute('aria-label')).toBe('対象');
        expect(pressed('grades')).toEqual(['すべて']);
        expect(pressed('reaches')).toEqual(['すべて']);
      });

      it('keeps only what reaches an area when that reach is chosen: two of the fire family', () => {
        fixture.detectChanges();

        part('reaches').querySelector<HTMLButtonElement>('[data-reach="area"]')!.click();
        fixture.detectChanges();

        expect(pressed('reaches')).toEqual(['blur_circular範囲']);
        expect(rowNames()).toEqual(['業火', '大爆発', '絶対零度']);
        expect(
          host().querySelector('[data-family-section="炎"] [data-family-heading]')!.textContent!.replace(/\s+/g, '')
        ).toContain('炎2件');
      });

      it('narrows by a grade, and lets everything back with the first button of the row', () => {
        fixture.detectChanges();
        const grades = () => Array.from(part('grades').querySelectorAll<HTMLButtonElement>('button'));

        grades()[1].click();
        fixture.detectChanges();
        expect(rowNames()).toEqual(['闘気', '自作の技']);

        grades()[0].click();
        fixture.detectChanges();
        expect(rowNames()).toHaveLength(7);
      });

      it('says how many are found in the search field while the list is narrowed, and not otherwise', () => {
        fixture.detectChanges();
        expect(host().querySelector('[data-testid="effect-library-count"]')).toBeNull();

        fixture.componentInstance.query.set('氷');
        fixture.detectChanges();

        expect(part('count').textContent!.trim()).toBe('2件');
        expect(part('clear').getAttribute('aria-label')).toBe('絞り込みを解除');
      });

      it('finds an effect by the name of its kind and by kana for katakana, and marks what was typed as written', () => {
        fixture.componentInstance.query.set('ぶれす');
        fixture.detectChanges();

        expect(rowNames()).toEqual(['氷のブレス']);
        const marks = Array.from(rowOf('氷のブレス').querySelectorAll('mark')).map((mark) => mark.textContent);
        expect(marks).toEqual(['ブレス', 'ブレス']);

        fixture.componentInstance.query.set('閃光');
        fixture.detectChanges();
        expect(rowNames()).toEqual(['大爆発']);
        expect(rowOf('大爆発').querySelector('[data-effect-kind] mark')!.textContent).toBe('閃光');
      });

      it('finds an effect named in kanji by its reading, with nothing marked', () => {
        fixture.componentInstance.query.set('ぜったいれいど');
        fixture.detectChanges();

        expect(rowNames()).toEqual(['絶対零度']);
        expect(rowOf('絶対零度').querySelector('mark')).toBeNull();
      });

      it('finds the effects of a family by the family’s name and its reading', () => {
        fixture.componentInstance.query.set('こおり');
        fixture.detectChanges();
        expect(rowNames()).toEqual(['氷のブレス', '絶対零度']);

        fixture.componentInstance.query.set('炎');
        fixture.componentInstance.reachFilter.set('area');
        fixture.detectChanges();
        expect(rowNames()).toEqual(['業火', '大爆発']);
      });

      it('lets everything back with the button in the search field', () => {
        fixture.componentInstance.query.set('氷');
        fixture.componentInstance.gradeFilter.set(3);
        fixture.componentInstance.reachFilter.set('area');
        fixture.detectChanges();
        expect(rowNames()).toEqual(['絶対零度']);

        part<HTMLButtonElement>('clear').click();
        fixture.detectChanges();

        expect(rowNames()).toHaveLength(7);
        expect(fixture.componentInstance.hasFilter()).toBe(false);
      });

      it('offers the grade and the reach as two lists on a narrow screen, each named, the area among the reaches', () => {
        vi.spyOn(TestBed.inject(ViewportService), 'isCompact').mockReturnValue(true);
        fixture.detectChanges();
        const reach = part<HTMLSelectElement>('reach-select');

        expect(host().querySelector('[data-testid="effect-library-reaches"]')).toBeNull();
        expect(part('grade-select').getAttribute('aria-label')).toBe('等級');
        expect(reach.getAttribute('aria-label')).toBe('対象');
        expect(Array.from(reach.options).map((option) => option.textContent!.replace(/\s+/g, ''))).toEqual([
          '対象:すべて',
          '対象:単体',
          '対象:複数',
          '対象:範囲',
        ]);

        reach.selectedIndex = 3;
        reach.dispatchEvent(new Event('change'));
        fixture.detectChanges();

        expect(fixture.componentInstance.reachFilter()).toBe('area');
        expect(rowNames()).toEqual(['業火', '大爆発', '絶対零度']);
      });
    });

    describe('the top bar and its menu', () => {
      it('names the two buttons in words, each with a name for a screen reader too', () => {
        fixture.detectChanges();

        expect(part('create').textContent!.replace(/\s+/g, '')).toBe('add追加');
        expect(part('create').getAttribute('aria-label')).toBe('エフェクトを追加');
        expect(part('create').getAttribute('title')).toBe('エフェクトを追加');
        expect(part('menu-button').textContent!.replace(/\s+/g, '')).toBe('more_vertメニュー');
        expect(part('menu-button').getAttribute('aria-label')).toBe('メニュー');
        expect(part('menu-button').getAttribute('aria-expanded')).toBe('false');
      });

      it('holds every other command of the list in the menu, each with an icon and its name', () => {
        fixture.detectChanges();
        const menu = openMenu();
        const items = Array.from(menu.querySelectorAll('button'));

        expect(part('menu-button').getAttribute('aria-expanded')).toBe('true');
        expect(items.map((item) => item.textContent!.replace(/\s+/g, ''))).toEqual([
          'restore既定を反映',
          'library_add足りない既定を追加',
          'file_downloadエフェクト集を書き出す',
          'check_box_outline_blankHPの増減に演出を出す（自分の画面だけ）',
          'unfold_less系統をすべて畳む',
          'unfold_more系統をすべて開く',
        ]);
        expect(items.map((item) => item.getAttribute('role'))).toEqual([
          'menuitem',
          'menuitem',
          'menuitem',
          'menuitemcheckbox',
          'menuitem',
          'menuitem',
        ]);
        expect(
          items.every((item) => item.querySelector('.material-icons')?.getAttribute('aria-hidden') === 'true')
        ).toBe(true);
      });

      it('closes the menu as a command is run from it, and at a press anywhere else', () => {
        fixture.detectChanges();
        openMenu();
        part<HTMLButtonElement>('export').click();
        fixture.detectChanges();
        expect(host().querySelector('[data-testid="effect-library-menu"]')).toBeNull();
        expect(fixture.componentInstance.noticeLine()).toContain('書き出しました');

        openMenu();
        part('stance').dispatchEvent(new Event('pointerdown', { bubbles: true }));
        fixture.detectChanges();
        expect(host().querySelector('[data-testid="effect-library-menu"]')).toBeNull();

        openMenu();
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        fixture.detectChanges();
        expect(host().querySelector('[data-testid="effect-library-menu"]')).toBeNull();
      });

      it('ticks the effect on a change of health in the menu, which stays open to show it', () => {
        fixture.detectChanges();
        openMenu();
        const before = fixture.componentInstance.autoPlayEnabled();

        part<HTMLButtonElement>('auto-play').click();
        fixture.detectChanges();

        expect(fixture.componentInstance.autoPlayEnabled()).toBe(!before);
        expect(part('auto-play').getAttribute('aria-checked')).toBe(String(!before));
        expect(part('auto-play').textContent).toContain(before ? 'check_box_outline_blank' : 'check_box');

        part<HTMLButtonElement>('auto-play').click();
        fixture.detectChanges();
        expect(fixture.componentInstance.autoPlayEnabled()).toBe(before);
      });

      it('folds every family away and opens them all again from the menu', () => {
        fixture.detectChanges();
        openMenu();
        part<HTMLButtonElement>('collapse-all').click();
        fixture.detectChanges();

        expect(rows()).toHaveLength(0);
        expect(host().querySelectorAll('[data-family-heading][aria-expanded="false"]')).toHaveLength(4);

        openMenu();
        part<HTMLButtonElement>('expand-all').click();
        fixture.detectChanges();

        expect(rows()).toHaveLength(7);
      });

      it('closes the menu at Escape without the key reaching the table, which would call off an effect held ready', () => {
        const onDocument = vi.fn();
        document.addEventListener('keydown', onDocument);
        fixture.detectChanges();
        try {
          const menu = openMenu();
          const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
          menu.querySelector('button')!.dispatchEvent(escape);
          fixture.detectChanges();

          expect(host().querySelector('[data-testid="effect-library-menu"]')).toBeNull();
          expect(onDocument).not.toHaveBeenCalled();
          expect(document.activeElement).toBe(part('menu-button'));
        } finally {
          document.removeEventListener('keydown', onDocument);
        }
      });

      it('moves among the items of the menu by the arrows, past one that is not offered', () => {
        PeerCursor.myCursor.role = PeerRole.Guest;
        fixture.detectChanges();
        const menu = openMenu();
        const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        items[0].focus();

        items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));

        expect(items[0].getAttribute('data-testid')).toBe('effect-library-export');
        expect(document.activeElement).toBe(items[1]);
        PeerCursor.myCursor.role = PeerRole.Player;
      });
    });

    describe('the names of the buttons', () => {
      it('gives every button of the panel a name: its words, or a label where it is drawn as a mark alone', () => {
        const fields = TestBed.inject(EffectFieldService);
        const field = fields.place(preset, 0, 0, 0);
        const piece = GameCharacter.create('戦士', 1, '');
        TestBed.inject(SelectionSignalService).selectObject(piece.identifier, piece.aliasName);
        fixture.componentInstance.query.set('炎');
        fixture.detectChanges();
        rowOf('爆炎').click();
        fixture.detectChanges();
        openMenu();
        try {
          const unnamed = Array.from(host().querySelectorAll('button')).filter((button) => {
            const words = Array.from(button.childNodes)
              .filter((node) => !(node instanceof HTMLElement && node.classList.contains('material-icons')))
              .map((node) => node.textContent ?? '')
              .join('')
              .trim();
            return words.length < 1 && !button.getAttribute('aria-label');
          });

          expect(host().querySelectorAll('button').length).toBeGreaterThan(20);
          expect(unnamed.map((button) => button.outerHTML.slice(0, 120))).toEqual([]);
          expect(
            Array.from(host().querySelectorAll('.material-icons')).filter(
              (icon) => icon.getAttribute('aria-hidden') !== 'true' && icon.getAttribute('role') !== 'img'
            )
          ).toEqual([]);
        } finally {
          TestBed.inject(EffectTargetingService).cancel();
          TestBed.inject(SelectionSignalService).selectedObject.set(null);
          field.destroy();
          piece.destroy();
        }
      });

      it('writes the name beside each button drawn as a mark alone while the names of the buttons are asked for', () => {
        fixture.componentInstance.query.set('炎');
        fixture.detectChanges();
        const written = () =>
          Array.from(host().querySelectorAll('[data-testid="button-guide-label"]')).map((label) =>
            label.textContent!.trim()
          );
        expect(written()).toEqual([]);

        TestBed.inject(ButtonGuideService).show();
        fixture.detectChanges();

        expect(written()).toContain('絞り込みを解除');
        expect(written().filter((name) => name === '編集')).toHaveLength(rows().length);
        expect(part('menu-button').querySelector('span')!.className.split(/\s+/)).toContain('inline!');
      });
    });

    describe('the size the reader leaves the panel at', () => {
      it('is kept in this browser as the panel is resized, and nowhere in the room', () => {
        fixture.detectChanges();
        const before = JSON.stringify(preset.toContext());

        TestBed.inject(PanelService).resized$.emit({ width: 720, height: 640 });

        expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.effectLibrarySize)!)).toEqual({ width: 720, height: 640 });
        expect(JSON.stringify(preset.toContext())).toBe(before);
      });

      it('is kept no longer once the panel has gone', () => {
        fixture.detectChanges();
        fixture.destroy();

        TestBed.inject(PanelService).resized$.emit({ width: 720, height: 640 });

        expect(localStorage.getItem(STORAGE_KEYS.effectLibrarySize)).toBeNull();
      });
    });

    describe('for a guest, who changes nothing in the room', () => {
      beforeEach(() => {
        PeerCursor.myCursor.role = PeerRole.Guest;
      });

      afterEach(() => {
        PeerCursor.myCursor.role = PeerRole.Player;
      });

      it('still searches, narrows, goes to a family, folds families and switches the effect on its own screen', () => {
        fixture.detectChanges();
        fixture.componentInstance.query.set('氷');
        fixture.detectChanges();
        expect(rowNames()).toEqual(['氷のブレス', '絶対零度']);

        part('reaches').querySelector<HTMLButtonElement>('[data-reach="area"]')!.click();
        fixture.detectChanges();
        expect(rowNames()).toEqual(['絶対零度']);

        part<HTMLButtonElement>('clear').click();
        fixture.detectChanges();
        index()[1].element.click();
        fixture.detectChanges();
        expect(index()[1].element.getAttribute('aria-current')).toBe('true');

        openMenu();
        const before = fixture.componentInstance.autoPlayEnabled();
        part<HTMLButtonElement>('auto-play').click();
        fixture.detectChanges();
        expect(fixture.componentInstance.autoPlayEnabled()).toBe(!before);
        part<HTMLButtonElement>('auto-play').click();
        part<HTMLButtonElement>('collapse-all').click();
        fixture.detectChanges();
        expect(rows()).toHaveLength(0);
      });

      it('is offered no button that edits a row, and the menu of a row on a touch screen all the same', () => {
        fixture.detectChanges();

        expect(host().querySelector('[data-effect-edit]')).toBeNull();
        expect(host().querySelectorAll('[data-effect-more]')).toHaveLength(rows().length);
      });
    });
  });
});
