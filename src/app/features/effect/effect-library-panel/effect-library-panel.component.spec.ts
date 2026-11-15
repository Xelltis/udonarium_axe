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
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
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
      expect(part('list').className.split(/\s+/)).toEqual(expect.arrayContaining(['flex-1', 'overflow-y-auto']));

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
        const list = part('list');
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

    it('changes and takes away the caster by icon buttons that say what they do, leaving the row to the name', () => {
      press(pieces[0]);
      tile().click();
      fixture.detectChanges();

      expect(part('change-caster').getAttribute('aria-label')).toBe('撃ち手を変える');
      expect(part('no-caster').getAttribute('aria-label')).toBe('撃ち手をなしにする');
      for (const name of ['change-caster', 'no-caster']) {
        expect(part(name).className.split(/\s+/)).toEqual(expect.arrayContaining(['size-6', 'shrink-0']));
        expect(part(name).textContent?.trim()).toMatch(/^[a-z_]+$/);
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
      const heading = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[role="button"]')!;
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
});
