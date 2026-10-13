import { TestBed } from '@angular/core/testing';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Config } from '@axe/domain/peer/config';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { LineOfFirePanelComponent } from '@axe/features/character/line-of-fire-panel/line-of-fire-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('LineOfFirePanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LineOfFirePanelComponent], providers: [...TEST_PROVIDERS] });
    Config.instance.zoneEnabled = true;
    const table = new GameTable();
    table.width = 30;
    table.height = 30;
    table.gridSize = GRID;
    table.initialize();
  });

  afterEach(() => {
    Config.instance.zoneEnabled = null;
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(name: string, col: number, row: number, npc = false): GameCharacter {
    const piece = GameCharacter.create(name, 1, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    piece.isNpc = npc;
    return piece;
  }

  it('shows the distance to each piece aimed at, and what stands in the way', async () => {
    const shooter = pieceAt('射手', 0, 0);
    const target = pieceAt('標的', 10, 0, true);
    pieceAt('壁役', 5, 0, true);
    target.targeted = true;
    const fixture = TestBed.createComponent(LineOfFirePanelComponent);
    fixture.componentInstance.shooterIdentifier.set(shooter.identifier);
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('[data-testid="line-of-fire-row"]')).toHaveLength(1);
    expect(host.querySelector('[data-testid="line-of-fire-distance"]')!.textContent).toContain('10.0');
    expect(host.querySelector('[data-testid="line-of-fire-blocked"]')!.textContent).toContain('壁役');
  });

  it('follows the aim as it moves from piece to piece while it is open', async () => {
    const shooter = pieceAt('射手', 0, 0);
    const first = pieceAt('一番', 10, 0, true);
    const second = pieceAt('二番', 0, 10, true);
    first.targeted = true;
    const fixture = TestBed.createComponent(LineOfFirePanelComponent);
    fixture.componentInstance.shooterIdentifier.set(shooter.identifier);
    await fixture.whenStable();
    const rows = () =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="line-of-fire-row"]')].map(
        (row) => row.textContent
      );
    expect(rows().join()).toContain('一番');

    first.targeted = false;
    second.targeted = true;
    TestBed.inject(UiSignalService).notifyTargetChange(second.identifier, GameCharacter.aliasName);
    await fixture.whenStable();

    expect(rows()).toHaveLength(1);
    expect(rows().join()).toContain('二番');
  });

  it('picks one of everybody in a zone fired into, at random in chat as the shooter', async () => {
    const sent = vi.spyOn(TestBed.inject(CharacterMacroService), 'sendAsCharacter').mockResolvedValue(null);
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockReturnValue(null as never);
    const shooter = pieceAt('射手', 0, 10);
    const hero = pieceAt('味方', 10, 10);
    const foe = pieceAt('敵', 10, 10, true);
    TestBed.inject(EngagementZoneService).declare(hero, foe);
    foe.targeted = true;
    const fixture = TestBed.createComponent(LineOfFirePanelComponent);
    fixture.componentInstance.shooterIdentifier.set(shooter.identifier);
    await fixture.whenStable();

    (fixture.nativeElement.querySelector('[data-testid="line-of-fire-random"]') as HTMLButtonElement).click();

    expect(sent).toHaveBeenCalledWith(shooter, expect.stringMatching(/^choice\[(味方,敵|敵,味方)\]$/));
  });
});
