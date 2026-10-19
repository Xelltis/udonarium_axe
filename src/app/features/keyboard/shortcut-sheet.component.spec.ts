import { DestroyRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { ShortcutScopeService } from '@axe/application/ui/shortcut-scope.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { latticeOf } from '@axe/domain/tabletop/first-person/first-person-lattice';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { ShortcutSheetComponent } from '@axe/features/keyboard/shortcut-sheet.component';
import { VisualNovelModeService } from '@axe/features/visual-novel/visual-novel-mode.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ShortcutSheetComponent', () => {
  let fixture: ComponentFixture<ShortcutSheetComponent> | undefined;

  function render(): HTMLElement {
    fixture = TestBed.createComponent(ShortcutSheetComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function headings(element: HTMLElement): string[] {
    return [...element.querySelectorAll<HTMLElement>('[data-testid^="shortcut-sheet-"]')].map((section) =>
      section.dataset['testid']!.replace('shortcut-sheet-', '')
    );
  }

  /** Something that lasts for as long as the test, to hold an editor open with. */
  const forever = { onDestroy: () => () => undefined } as unknown as DestroyRef;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ShortcutSheetComponent], providers: [...TEST_PROVIDERS] });
    if (!PeerCursor.myCursor) PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    TestBed.inject(VisualNovelModeService).deactivate();
    PeerCursor.myCursor.role = PeerRole.Player;
  });

  it('comes out with the names of the buttons and goes with them', () => {
    const element = render();
    expect(element.querySelector('[data-testid="shortcut-sheet"]')).toBeNull();

    TestBed.inject(ButtonGuideService).show();
    fixture!.detectChanges();
    expect(headings(element)).toEqual(['tabletop', 'selection', 'hotbar', 'chat', 'global']);

    TestBed.inject(ButtonGuideService).hide();
    fixture!.detectChanges();
    expect(element.querySelector('[data-testid="shortcut-sheet"]')).toBeNull();
  });

  it('stays away in novel mode, which lists its own keys', () => {
    TestBed.inject(VisualNovelModeService).activate();
    TestBed.inject(ButtonGuideService).show();

    expect(render().querySelector('[data-testid="shortcut-sheet"]')).toBeNull();
  });

  it('lists an open editor first', () => {
    TestBed.inject(ShortcutScopeService).hold('mapEditor', forever);
    TestBed.inject(ButtonGuideService).show();

    expect(headings(render())[0]).toBe('mapEditor');
  });

  it('keeps the game master’s editor off a player’s sheet', () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    TestBed.inject(ShortcutScopeService).hold('mapEditor', forever);
    TestBed.inject(ButtonGuideService).show();

    expect(headings(render())).not.toContain('mapEditor');
  });

  it('lists the first person view’s keys for its grid in place of the table’s', () => {
    TestBed.overrideProvider(FirstPersonService, {
      useValue: { showing: signal(true), lattice: signal(latticeOf(GridType.HEX_VERTICAL)) },
    });
    TestBed.inject(ButtonGuideService).show();
    const element = render();

    expect(headings(element)).toEqual(['firstPerson', 'hotbar', 'chat', 'global']);
    const moves = [...element.querySelectorAll('[data-testid="shortcut-sheet-firstPerson"] dd')].map((line) =>
      line.textContent?.trim()
    );
    expect(moves).toContain('斜め後ろに動く');
  });
});
