import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { InventoryViewPreferenceService } from '@axe/application/ui/inventory-view-preference.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { Network } from '@axe/core/index';
import { GameCharacter } from '@axe/domain/character/game-character';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { DataElement } from '@axe/domain/data/data-element';
import { DataSummarySetting } from '@axe/domain/data/data-summary-setting';
import { Party } from '@axe/domain/party/party';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameObjectInventoryComponent } from '@axe/features/inventory/game-object-inventory/game-object-inventory.component';
import { InventoryObjectDrag } from '@axe/features/inventory/game-object-inventory/inventory-object-drag';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { installPanelLayer } from '@axe/testing/panel-layer';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameObjectInventoryComponent', () => {
  function drag(panel: GameObjectInventoryComponent): InventoryObjectDrag {
    return (panel as unknown as { drag: InventoryObjectDrag }).drag;
  }

  let component: GameObjectInventoryComponent;
  let fixture: ComponentFixture<GameObjectInventoryComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GameObjectInventoryComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    // The way of reading it is remembered per browser, and the narrowing is shared by every
    // inventory window, so a spec that changes either would hand the next one its leavings.
    localStorage.removeItem('ui-inventory-view');
    localStorage.removeItem('ui-inventory-parts');
    fixture = TestBed.createComponent(GameObjectInventoryComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    localStorage.removeItem('ui-inventory-view');
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('registers its effect in the constructor, so nothing is set up outside an injection context', () => {
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(GameObjectInventoryComponent);
  });

  describe('the round shown side by side', () => {
    function putOnTable(name: string, party = ''): GameCharacter {
      const character = GameCharacter.create(name, 1, '');
      character.setLocation('table');
      character.partyIdentifier = party;
      return character;
    }

    it('shows no sides while the round is taken one piece at a time', () => {
      putOnTable('だれか');

      expect(component.turnSides()).toEqual([]);
      expect(component.currentTurnSide()).toBe('');
    });

    it('gathers the pieces under the party each is on', () => {
      const heroes = new Party();
      heroes.name = '味方';
      heroes.initialize();
      putOnTable('勇者', heroes.identifier);
      putOnTable('通りすがり');
      Config.instance.turnOrderMode = 'faction';

      const sides = component.turnSides();

      expect(sides.map((group) => group.name)).toEqual(['味方', '無所属']);
      expect(sides[0].members.map((piece) => piece.name)).toEqual(['勇者']);
      expect(sides[1].members.map((piece) => piece.name)).toEqual(['通りすがり']);
    });

    it('heads the round strip with each side, and marks the one whose phase it is', async () => {
      const heroes = new Party();
      heroes.name = '味方';
      heroes.initialize();
      const monsters = new Party();
      monsters.name = '敵';
      monsters.initialize();
      putOnTable('勇者', heroes.identifier);
      putOnTable('魔物', monsters.identifier);
      Config.instance.turnOrderMode = 'faction';
      Config.instance.factionSkipUnassigned = true;
      TestBed.inject(PanelService).isMinimized.set(true);

      fixture.detectChanges();
      await fixture.whenStable();

      const headings = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[title="味方"], [title="敵"]')];
      expect(headings.map((node) => node.getAttribute('title'))).toEqual(['味方', '敵']);
    });

    it('heads the full list with each side as well as the round strip', async () => {
      const heroes = new Party();
      heroes.name = '味方';
      heroes.initialize();
      const monsters = new Party();
      monsters.name = '敵';
      monsters.initialize();
      putOnTable('勇者', heroes.identifier);
      putOnTable('魔物', monsters.identifier);
      Config.instance.turnOrderMode = 'faction';
      Config.instance.factionSkipUnassigned = true;

      fixture.detectChanges();
      await fixture.whenStable();

      const headings = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll(
          '[data-testid="inventory-side-heading"] span:nth-child(2)'
        ),
      ];
      expect(headings.map((node) => node.textContent?.trim())).toEqual(['味方', '敵']);
    });

    it('heads the table view with each side too', async () => {
      const heroes = new Party();
      heroes.name = '味方';
      heroes.initialize();
      putOnTable('勇者', heroes.identifier);
      Config.instance.turnOrderMode = 'faction';
      Config.instance.factionSkipUnassigned = true;
      TestBed.inject(GameObjectInventoryService).tableDataTag = 'HP';
      component.setViewMode('table');

      fixture.detectChanges();
      await fixture.whenStable();

      const headings = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll(
          '[data-testid="inventory-table-side-heading"] span span:nth-child(2)'
        ),
      ];
      expect(headings.map((node) => node.textContent?.trim())).toEqual(['味方']);
    });

    it('leaves the list unheaded while the round is taken one piece at a time', async () => {
      putOnTable('だれか');

      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.sideBands()).toBeNull();
      expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="inventory-side-heading"]')).toBeNull();
    });

    it('takes the colour of the party for the side', () => {
      const heroes = new Party();
      heroes.name = '味方';
      heroes.color = '#7dd3fc';
      heroes.initialize();
      putOnTable('勇者', heroes.identifier);
      Config.instance.turnOrderMode = 'faction';

      expect(component.turnSides()[0].color).toBe('#7dd3fc');
    });
  });

  describe('searching the list', () => {
    function putOnTable(name: string): GameCharacter {
      const character = GameCharacter.create(name, 1, '');
      character.setLocation('table');
      return character;
    }

    function putInShared(name: string): GameCharacter {
      const character = GameCharacter.create(name, 1, '');
      character.setLocation('common');
      return character;
    }

    afterEach(() => {
      // Personal folders live on the device, so they outlive the store cleanup too.
      localStorage.clear();
      // The summary settings are a synced singleton, so its folders outlive the store cleanup.
      (DataSummarySetting as unknown as Record<string, unknown>)['_instance'] = undefined;
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('shows everything while the search is empty', () => {
      putOnTable('ゴブリン');
      putOnTable('村長');

      expect(component.hasQuery()).toBe(false);
      expect(
        component
          .filteredRows()
          .map((row) => row.object.name)
          .sort()
      ).toEqual(['ゴブリン', '村長']);
    });

    it('keeps only what the search matches', () => {
      putOnTable('ゴブリン');
      putOnTable('村長');

      component.searchQuery.set('村長');

      expect(component.filteredRows().map((row) => row.object.name)).toEqual(['村長']);
    });

    it('wants every word of the search', () => {
      putOnTable('ゴブリン戦士');
      putOnTable('ゴブリン魔術師');

      component.searchQuery.set('ゴブリン 戦士');

      expect(component.filteredRows().map((row) => row.object.name)).toEqual(['ゴブリン戦士']);
    });

    it('leaves the table flat, since that is the board rather than the stock', () => {
      const goblin = putOnTable('ゴブリン');
      goblin.folderName = '第1話';

      expect(component.selectTab()).toBe('table');
      expect(component.foldersApply()).toBe(false);
      expect(component.hasFolders()).toBe(true);
      expect(component.showTree()).toBe(false);
    });

    it('leaves the graveyard flat too, since it is what has already left the table', () => {
      component.selectTab.set('graveyard');

      expect(component.foldersApply()).toBe(false);
    });

    it('files what is shared apart from what is personal', () => {
      const shared = putInShared('ゴブリン');
      shared.folderName = '第1話';
      component.selectTab.set('common');
      component.createFolder();

      component.selectTab.set('graveyard');
      expect(component.declaredFolderPaths()).toEqual([]);

      component.selectTab.set('common');
      expect(component.declaredFolderPaths()).toEqual(['フォルダ1']);
      expect(component.knownFolderPaths()).toEqual(['フォルダ1', '第1話']);
    });

    it('gathers the rows into the folders they name', () => {
      const goblin = putInShared('ゴブリン');
      goblin.folderName = '第1話/洞窟';
      putInShared('村長');
      component.selectTab.set('common');

      expect(component.showTree()).toBe(true);
      expect(component.folderTree().roots.map((node) => node.path)).toEqual(['第1話']);
      expect(component.folderTree().roots[0].totalCount).toBe(1);
      expect(component.folderTree().loose.map((row) => row.object.name)).toEqual(['村長']);
    });

    it('leaves the list flat while nothing is in a folder', () => {
      putInShared('ゴブリン');
      putInShared('村長');
      component.selectTab.set('common');

      expect(component.hasFolders()).toBe(false);
      expect(component.showTree()).toBe(false);
    });

    it('folds a folder away and opens it again', () => {
      const goblin = putOnTable('ゴブリン');
      goblin.folderName = '第1話';

      component.toggleFolder('第1話');
      expect(component.isFolderCollapsed('第1話')).toBe(true);

      component.toggleFolder('第1話');
      expect(component.isFolderCollapsed('第1話')).toBe(false);
    });

    it('opens every folder while a search is on, without forgetting what was folded', () => {
      const goblin = putOnTable('ゴブリン');
      goblin.folderName = '第1話';
      component.toggleFolder('第1話');

      component.searchQuery.set('ゴブリン');
      expect(component.isFolderCollapsed('第1話')).toBe(false);

      component.clearSearch();
      expect(component.isFolderCollapsed('第1話')).toBe(true);
    });

    it('normalizes a rough folder before putting a character in it', () => {
      const goblin = putInShared('ゴブリン');
      component.selectTab.set('common');

      component.setFolder(goblin, ' 第1話 // 洞窟 ');

      expect(goblin.folderName).toBe('第1話/洞窟');
    });

    it('carries a renamed folder down through everything inside it', () => {
      const deep = putInShared('ゴブリン');
      deep.folderName = '第1話/洞窟';
      const shallow = putInShared('村長');
      shallow.folderName = '第1話';
      component.selectTab.set('common');

      component.renameFolder('第1話', '序章');

      expect(shallow.folderName).toBe('序章');
      expect(deep.folderName).toBe('序章/洞窟');
    });

    it('leaves a folder alone whose name merely starts the same way', () => {
      const lookalike = putInShared('ゴブリン');
      lookalike.folderName = '第1話大全';
      component.selectTab.set('common');

      component.renameFolder('第1話', '序章');

      expect(lookalike.folderName).toBe('第1話大全');
    });

    it('makes a folder with a name of its own and opens it for renaming', () => {
      const goblin = putInShared('ゴブリン');
      component.selectTab.set('common');

      component.createFolderFor(goblin);

      expect(goblin.folderName).toBe('フォルダ1');
      expect(component.isEditingFolder('フォルダ1')).toBe(true);
    });

    it('does not hand out a folder name that is already taken', () => {
      const taken = putInShared('村長');
      taken.folderName = 'フォルダ1';
      const goblin = putInShared('ゴブリン');
      component.selectTab.set('common');

      component.createFolderFor(goblin);

      expect(goblin.folderName).toBe('フォルダ2');
    });

    it('renames on commit and leaves the name alone when the edit is dropped', () => {
      const goblin = putInShared('ゴブリン');
      goblin.folderName = '第1話';
      component.selectTab.set('common');

      component.startFolderRename('第1話');
      component.cancelFolderRename();
      component.commitFolderRename('第1話', '序章');
      expect(goblin.folderName).toBe('第1話');

      component.startFolderRename('第1話');
      component.commitFolderRename('第1話', '序章');
      expect(goblin.folderName).toBe('序章');
    });

    it('makes a folder with nothing in it yet', () => {
      component.selectTab.set('common');
      component.createFolder();

      expect(component.declaredFolderPaths()).toEqual(['フォルダ1']);
      expect(component.hasFolders()).toBe(true);
      expect(component.folderTree().roots.map((node) => node.path)).toEqual(['フォルダ1']);
      expect(component.folderTree().roots[0].totalCount).toBe(0);
    });

    it('makes a folder inside the one it was asked from', () => {
      component.selectTab.set('common');
      component.createFolder();

      component.createFolder('フォルダ1');

      expect(component.declaredFolderPaths()).toEqual(['フォルダ1', 'フォルダ1/フォルダ2']);
      expect(component.folderTree().roots[0].children.map((node) => node.name)).toEqual(['フォルダ2']);
    });

    it('keeps an empty folder standing after the last character leaves it', () => {
      const goblin = putInShared('ゴブリン');
      component.selectTab.set('common');
      component.createFolderFor(goblin);

      component.setFolder(goblin, '');

      expect(component.folderTree().roots.map((node) => node.path)).toEqual(['フォルダ1']);
      expect(component.folderTree().loose.map((row) => row.object.name)).toEqual(['ゴブリン']);
    });

    it('deletes an empty folder without asking', () => {
      component.selectTab.set('common');
      component.createFolder();

      component.deleteFolder('フォルダ1');

      expect(component.declaredFolderPaths()).toEqual([]);
      expect(component.hasFolders()).toBe(false);
    });

    it('takes what is inside back to unfiled when a folder is deleted', async () => {
      const goblin = putInShared('ゴブリン');
      goblin.folderName = '第1話/洞窟';
      component.selectTab.set('common');
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      await component.deleteFolder('第1話');

      expect(goblin.folderName).toBe('');
    });

    it('leaves a folder alone when the deletion is called off', async () => {
      const goblin = putInShared('ゴブリン');
      goblin.folderName = '第1話';
      component.selectTab.set('common');
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);

      await component.deleteFolder('第1話');

      expect(goblin.folderName).toBe('第1話');
    });

    it('files what sits in a location nobody claimed, which the shared tab also lists', async () => {
      const orphan = GameCharacter.create('置き去り', 1, '');
      orphan.setLocation('some-peer-who-left');
      orphan.folderName = '第1話';
      component.selectTab.set('common');

      component.renameFolder('第1話', '序章');

      expect(orphan.folderName).toBe('序章');
    });

    it('refuses a rename that would push what is inside past the depth limit', () => {
      const deep = putInShared('ゴブリン');
      deep.folderName = '第1話/洞窟/最奥/宝物庫';
      component.selectTab.set('common');

      expect(component.renameFolder('第1話', '序章/導入')).toBe(false);
      expect(deep.folderName).toBe('第1話/洞窟/最奥/宝物庫');
    });

    it('keeps the editor open on a name it could not take', () => {
      const goblin = putInShared('ゴブリン');
      goblin.folderName = '第1話';
      component.selectTab.set('common');
      component.startFolderRename('第1話');

      component.commitFolderRename('第1話', '   ');

      expect(component.isEditingFolder('第1話')).toBe(true);
    });

    it('offers no folder inside one already at the depth limit', () => {
      const deep = putInShared('ゴブリン');
      deep.folderName = '第1話/洞窟/最奥/宝物庫';
      component.selectTab.set('common');

      expect(component.canNestInside('第1話/洞窟/最奥/宝物庫')).toBe(false);
      component.createFolder('第1話/洞窟/最奥/宝物庫');

      expect(component.declaredFolderPaths()).toEqual([]);
      expect(deep.folderName).toBe('第1話/洞窟/最奥/宝物庫');
    });

    it('ignores a fold while a search is holding everything open', () => {
      const goblin = putInShared('ゴブリン');
      goblin.folderName = '第1話';
      component.selectTab.set('common');
      component.searchQuery.set('ゴブリン');

      component.toggleFolder('第1話');
      component.clearSearch();

      expect(component.isFolderCollapsed('第1話')).toBe(false);
    });

    it('keeps personal folders off the room and out of the shared tab', () => {
      component.selectTab.set(component.inventoryTypes()[2]);
      component.createFolder();

      expect(component.declaredFolderPaths()).toEqual(['フォルダ1']);
      expect(TestBed.inject(GameObjectInventoryService).folderPaths).toEqual([]);

      component.selectTab.set('common');
      expect(component.declaredFolderPaths()).toEqual([]);
    });

    it('renames a character who has stepped out onto the table along with the folder', () => {
      const away = putInShared('ゴブリン');
      away.folderName = '第1話';
      away.setLocation('table');
      component.selectTab.set('common');

      component.renameFolder('第1話', '序章');

      expect(away.folderName).toBe('序章');
    });

    it('drops a name it could not take when the field is left rather than holding it', () => {
      const goblin = putInShared('ゴブリン');
      goblin.folderName = '第1話';
      component.selectTab.set('common');
      component.startFolderRename('第1話');

      component.commitFolderRename('第1話', '   ', true);

      expect(component.isEditingFolder('第1話')).toBe(false);
      expect(goblin.folderName).toBe('第1話');
    });

    it('forgets a drag whose release never arrives', () => {
      const goblin = putInShared('ゴブリン');
      component.selectTab.set('common');
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(folderHeading('第1話'));
      drag(component).down(pointerAt(0, 0), goblin);
      drag(component).move(pointerAt(40, 40));

      drag(component).cancel();
      drag(component).up(pointerAt(40, 40));

      expect(goblin.folderName).toBe('');
    });

    it('searches the shown side of a resource as well as its maximum', () => {
      const goblin = putInShared('ゴブリン');
      // Only what is on show is searched, so the item has to be one of the columns.
      TestBed.inject(GameObjectInventoryService).dataTag = 'HP';
      component.selectTab.set('common');
      const hp = goblin.detailDataElement?.getFirstElementByName('HP');
      expect(hp).toBeTruthy();
      hp!.currentValue = 7;

      component.searchQuery.set('7');

      expect(component.filteredRows().map((row) => row.object.name)).toEqual(['ゴブリン']);
    });

    it('leaves the other scope alone when a folder of the same name is renamed', () => {
      const shared = putInShared('ゴブリン');
      shared.folderName = '第1話';
      const mine = GameCharacter.create('相棒', 1, '');
      mine.setLocation(Network.peerId);
      mine.folderName = '第1話';

      component.selectTab.set(Network.peerId);
      component.renameFolder('第1話', '序章');

      expect(mine.folderName).toBe('序章');
      expect(shared.folderName).toBe('第1話');
    });

    it('leaves the other scope alone when a folder of the same name is deleted', async () => {
      const shared = putInShared('ゴブリン');
      shared.folderName = '第1話';
      const mine = GameCharacter.create('相棒', 1, '');
      mine.setLocation(Network.peerId);
      mine.folderName = '第1話';
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      component.selectTab.set(Network.peerId);
      await component.deleteFolder('第1話');

      expect(mine.folderName).toBe('');
      expect(shared.folderName).toBe('第1話');
    });

    it('holds still on collapse-all while a search is open', () => {
      component.selectTab.set('common');
      component.createFolder();
      component.createFolder();
      component.searchQuery.set('フォルダ1');

      component.collapseAllFolders();

      expect(component.collapsedFolders().size).toBe(0);
    });

    it('merges rather than doubles up when a folder is renamed onto another', () => {
      component.selectTab.set('common');
      component.createFolder();
      component.createFolder();

      component.renameFolder('フォルダ2', 'フォルダ1');

      expect(component.declaredFolderPaths()).toEqual(['フォルダ1']);
    });

    it('carries a rename through the folders it has been told about', () => {
      component.selectTab.set('common');
      component.createFolder();
      component.createFolder('フォルダ1');

      component.renameFolder('フォルダ1', '第1話');

      expect(component.declaredFolderPaths()).toEqual(['第1話', '第1話/フォルダ2']);
    });

    function folderHeading(path: string): HTMLElement {
      const heading = document.createElement('div');
      heading.setAttribute('data-folder-dropzone', '');
      heading.setAttribute('data-folder-path', path);
      // Only a heading this panel drew counts as a target, so it has to live inside the host.
      fixture.nativeElement.append(heading);
      return heading;
    }

    function pointerAt(x: number, y: number): PointerEvent {
      return {
        button: 0,
        clientX: x,
        clientY: y,
        pointerId: 1,
        target: document.createElement('div'),
        currentTarget: { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() },
      } as unknown as PointerEvent;
    }

    function dragOnto(character: GameCharacter, dropTarget: HTMLElement | null): void {
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(dropTarget);
      drag(component).down(pointerAt(0, 0), character);
      drag(component).move(pointerAt(40, 40));
      drag(component).up(pointerAt(40, 40));
    }

    it('moves a character dragged onto a folder into it', () => {
      const goblin = putInShared('ゴブリン');
      component.selectTab.set('common');

      dragOnto(goblin, folderHeading('第1話/洞窟'));

      expect(goblin.folderName).toBe('第1話/洞窟');
    });

    it('takes a character dragged onto the unfiled heading out of its folder', () => {
      const goblin = putInShared('ゴブリン');
      goblin.folderName = '第1話';
      component.selectTab.set('common');

      dragOnto(goblin, folderHeading(''));

      expect(goblin.folderName).toBe('');
    });

    it('leaves a character dropped nowhere where it was', () => {
      const goblin = putInShared('ゴブリン');
      goblin.folderName = '第1話';
      component.selectTab.set('common');

      dragOnto(goblin, document.createElement('div'));

      expect(goblin.folderName).toBe('第1話');
    });

    it('carries the whole ticked selection along', () => {
      const goblin = putInShared('ゴブリン');
      const village = putInShared('村長');
      component.selectTab.set('common');
      component.isMultiMove.set(true);
      component.multiMoveTargets.set(new Set([goblin.identifier, village.identifier]));

      dragOnto(goblin, folderHeading('第1話'));

      expect(goblin.folderName).toBe('第1話');
      expect(village.folderName).toBe('第1話');
    });

    it('carries only what was grabbed when it is not part of the selection', () => {
      const goblin = putInShared('ゴブリン');
      const village = putInShared('村長');
      component.selectTab.set('common');
      component.isMultiMove.set(true);
      component.multiMoveTargets.set(new Set([village.identifier]));

      dragOnto(goblin, folderHeading('第1話'));

      expect(goblin.folderName).toBe('第1話');
      expect(village.folderName).toBe('');
    });

    it('refuses to file a character dragged on a tab that does not use folders', () => {
      const goblin = putOnTable('ゴブリン');

      dragOnto(goblin, folderHeading('第1話'));

      expect(goblin.folderName).toBe('');
    });

    describe('the pieces the inventory hides', () => {
      const originalCursor = PeerCursor.myCursor;

      function beGameMaster(): void {
        PeerCursor.myCursor = { role: PeerRole.GameMaster, identifier: 'gm-cursor' } as PeerCursor;
      }

      function bePlayer(): void {
        PeerCursor.myCursor = { role: PeerRole.Player, identifier: 'pl-cursor' } as PeerCursor;
      }

      function putHiddenOnTable(name: string): GameCharacter {
        const character = putOnTable(name);
        character.hideInventory = true;
        return character;
      }

      afterEach(() => {
        PeerCursor.myCursor = originalCursor;
      });

      it('keeps every piece until the master filters', () => {
        beGameMaster();
        putOnTable('村長');
        putHiddenOnTable('伏せた敵');

        expect(component.filteredRows()).toHaveLength(2);
        expect(component.isHiddenFiltered()).toBe(false);
      });

      it('narrows the list to what is hidden', () => {
        beGameMaster();
        putOnTable('村長');
        putHiddenOnTable('伏せた敵');
        component.hiddenFilter.set('only');

        expect(component.filteredRows().map((row) => row.object.name)).toEqual(['伏せた敵']);
        expect(component.isHiddenFiltered()).toBe(true);
      });

      it('drops what is hidden from the list', () => {
        beGameMaster();
        putOnTable('村長');
        putHiddenOnTable('伏せた敵');
        component.hiddenFilter.set('exclude');

        expect(component.filteredRows().map((row) => row.object.name)).toEqual(['村長']);
      });

      it('narrows on the search as well as on what is hidden', () => {
        beGameMaster();
        putHiddenOnTable('伏せた敵');
        putHiddenOnTable('伏せた罠');
        component.hiddenFilter.set('only');
        component.searchQuery.set('罠');

        expect(component.filteredRows().map((row) => row.object.name)).toEqual(['伏せた罠']);
      });

      it('leaves a player the whole list, whatever the filter is set to', () => {
        bePlayer();
        putOnTable('村長');
        component.hiddenFilter.set('only');

        expect(component.activeHiddenFilter()).toBe('all');
        expect(component.filteredRows().map((row) => row.object.name)).toEqual(['村長']);
      });

      it('darkens a hidden piece and lifts it again on request', () => {
        beGameMaster();
        const hidden = putHiddenOnTable('伏せた敵');
        const shown = putOnTable('村長');

        expect(component.isHiddenRowDimmed(hidden)).toBe(true);
        expect(component.isHiddenRowDimmed(shown)).toBe(false);

        component.toggleHiddenDisplay();

        expect(component.hiddenDisplay()).toBe('full');
        expect(component.isHiddenRowDimmed(hidden)).toBe(false);
      });
    });

    describe('reading the cast as a table', () => {
      afterEach(() => {
        TestBed.inject(StatusAilmentService).save([]);
        (StatusAilmentCatalog as unknown as Record<string, unknown>)['_instance'] = undefined;
      });

      function tableRows(): HTMLElement[] {
        return [...fixture.nativeElement.querySelectorAll('[data-testid="inventory-table-row"]')];
      }

      function orderShown(row: HTMLElement): string {
        return (row.querySelector('td')?.textContent ?? '').replace('play_arrow', '').trim();
      }

      function setAbility(character: GameCharacter, value: number): void {
        DataElement.findElementByReference(character.rootDataElement!, '敏捷度')!.value = value;
      }

      it('draws one row a piece, with a column for each display item', () => {
        putOnTable('ゴブリン');
        putOnTable('オーク');
        TestBed.inject(GameObjectInventoryService).tableDataTag = 'HP MP';
        component.setViewMode('table');
        fixture.detectChanges();

        expect(component.inventoryTable().columns.map((column) => column.name)).toEqual(['HP', 'MP']);
        expect(tableRows()).toHaveLength(2);
      });

      it('gives the heading and every row the same columns', () => {
        // The heading and the rows have to agree on where a column starts. They did not while
        // each row was a grid of its own, sizing its columns to whatever it happened to hold.
        putOnTable('ゴブリン');
        putOnTable('オーク');
        TestBed.inject(GameObjectInventoryService).tableDataTag = 'HP MP 敏捷度';
        component.setViewMode('table');
        fixture.detectChanges();

        const headings = fixture.nativeElement.querySelectorAll('thead th');
        // The marker, the name (which the picture shares), and one for each display item.
        expect(headings).toHaveLength(2 + 3);
        expect((headings[1] as HTMLTableCellElement).colSpan).toBe(2);
        for (const row of tableRows()) {
          expect(row.querySelectorAll('td')).toHaveLength(3 + 3);
          expect(row.closest('table')).toBe(headings[0].closest('table'));
        }
      });

      it('numbers the rows down the left, letting a tie share a number', () => {
        const knight = putOnTable('騎士');
        putOnTable('斥候');
        putOnTable('盗賊');
        const goblin = putOnTable('ゴブリン');
        setAbility(knight, 32);
        setAbility(goblin, 6);
        const inventory = TestBed.inject(GameObjectInventoryService);
        inventory.sortTag = '敏捷度';
        inventory.tableDataTag = 'HP';
        component.setViewMode('table');
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('thead th')?.textContent?.trim()).toBe('順番');
        // The quickest first, the two of a speed together, the slowest last.
        expect(component.inventoryTable().rows.map((row) => row.order)).toEqual([1, 2, 2, 3]);
        expect(tableRows().map((row) => orderShown(row))).toEqual(['1', '2', '2', '3']);
      });

      it('offers a box to tick while several are being worked on', () => {
        const goblin = putOnTable('ゴブリン');
        TestBed.inject(GameObjectInventoryService).tableDataTag = 'HP';
        component.setViewMode('table');
        fixture.detectChanges();

        expect(tableRows()[0].querySelector('input[type="checkbox"]')).toBeNull();

        component.isMultiMove.set(true);
        fixture.detectChanges();

        const box = tableRows()[0].querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(box).toBeTruthy();
        // The heading keeps a cell of its own for the column the box stands in.
        expect(fixture.nativeElement.querySelectorAll('thead th')).toHaveLength(3 + 1);

        box.checked = true;
        box.dispatchEvent(new Event('change'));

        expect([...component.multiMoveTargets()]).toEqual([goblin.identifier]);
      });

      it('lines the value boxes up with the heading, whatever kind of field they are', () => {
        putOnTable('ゴブリン');
        TestBed.inject(GameObjectInventoryService).tableDataTag = 'HP 敏捷度';
        component.setViewMode('table');
        fixture.detectChanges();

        const boxes = [...(fixture.nativeElement as HTMLElement).querySelectorAll('tbody input')].filter(
          (input) => (input as HTMLInputElement).type !== 'checkbox'
        );
        expect(boxes.length).toBeGreaterThanOrEqual(2);
        for (const box of boxes) {
          expect(box.className).toContain('text-center');
          expect(box.className).toContain('w-16');
          expect(box.className).not.toContain('text-right');
        }
      });

      it('says so when there is nothing to make columns of', () => {
        putOnTable('ゴブリン');
        TestBed.inject(GameObjectInventoryService).tableDataTag = '';
        component.setViewMode('table');
        fixture.detectChanges();

        expect(tableRows()).toHaveLength(0);
        expect(fixture.nativeElement.textContent).toContain('表示項目');
      });

      it('puts a registered state on a piece when its box is ticked', () => {
        const goblin = putOnTable('ゴブリン');
        const ailments = TestBed.inject(StatusAilmentService);
        ailments.save([]);
        ailments.add('毒');
        TestBed.inject(GameObjectInventoryService).tableDataTag = '毒';
        component.setViewMode('table');
        fixture.detectChanges();

        const box = tableRows()[0].querySelector('input[type="checkbox"]') as HTMLInputElement;
        box.checked = true;
        box.dispatchEvent(new Event('change'));

        expect(ailments.isOn(goblin, '毒')).toBe(true);

        box.checked = false;
        box.dispatchEvent(new Event('change'));

        expect(ailments.isOn(goblin, '毒')).toBe(false);
      });
    });

    it('keeps a button for making a folder beside the list it makes one in', () => {
      // It stood in the search row, and went with it when the search moved to a panel of its own.
      putInShared('ゴブリン');
      component.selectTab.set('common');
      fixture.detectChanges();

      const icons = [...fixture.nativeElement.querySelectorAll('.material-icons')].map((icon) => icon.textContent);
      expect(icons).toContain('create_new_folder');
    });

    it('offers no folder on a tab that keeps none', () => {
      putOnTable('ゴブリン');
      component.selectTab.set('table');
      fixture.detectChanges();

      const icons = [...fixture.nativeElement.querySelectorAll('.material-icons')].map((icon) => icon.textContent);
      expect(icons).not.toContain('create_new_folder');
    });

    describe('a second window on the same table', () => {
      let closePanelLayer: (() => void) | null = null;
      let other: ComponentFixture<GameObjectInventoryComponent> | null = null;

      afterEach(() => {
        other?.destroy();
        other = null;
        closePanelLayer?.();
        closePanelLayer = null;
        localStorage.removeItem('ui-inventory-view');
      });

      it('is read its own way, and narrowed on its own', () => {
        putOnTable('ゴブリン');
        other = TestBed.createComponent(GameObjectInventoryComponent);
        fixture.detectChanges();
        other.detectChanges();

        component.setViewMode('table');
        component.searchQuery.set('ゴブリン');

        expect(other.componentInstance.viewMode()).toBe('rich');
        expect(other.componentInstance.searchQuery()).toBe('');
      });

      it('takes the settings window off the first when it opens its own', () => {
        closePanelLayer = installPanelLayer();
        other = TestBed.createComponent(GameObjectInventoryComponent);
        fixture.detectChanges();
        other.detectChanges();

        component.toggleEdit();
        expect(component.isEdit()).toBe(true);

        other.componentInstance.toggleEdit();

        expect(other.componentInstance.isEdit()).toBe(true);
        expect(component.isEdit()).toBe(false);
      });
    });

    describe('the strips above the list', () => {
      function strips(): string {
        return fixture.nativeElement.textContent ?? '';
      }

      function viewPreference(): InventoryViewPreferenceService {
        return fixture.debugElement.injector.get(InventoryViewPreferenceService);
      }

      afterEach(() => localStorage.removeItem('ui-inventory-parts'));

      it('shows them all until one is put away', () => {
        putOnTable('ゴブリン');
        fixture.detectChanges();

        expect(strips()).toContain('テーブル');
      });

      it('closes the space up when one is put away', () => {
        putOnTable('ゴブリン');
        fixture.detectChanges();
        const before = fixture.nativeElement.querySelectorAll('div').length;

        viewPreference().setShown('tabs', false);
        fixture.detectChanges();

        expect(strips()).not.toContain('テーブル');
        expect(fixture.nativeElement.querySelectorAll('div').length).toBeLessThan(before);
      });

      it('holds the round buttons to a width a hand can aim at, over on the right', () => {
        fixture.detectChanges();

        const buttons = [...fixture.nativeElement.querySelectorAll('button')].filter((button: HTMLElement) =>
          ['前へ', '次へ'].some((label) => button.textContent?.includes(label))
        );

        expect(buttons).toHaveLength(2);
        for (const button of buttons) expect(button.classList.contains('max-w-40')).toBe(true);
        expect(buttons[0].classList.contains('ml-auto')).toBe(true);
      });

      it('keeps a way into the settings, which goes with the tabs', () => {
        viewPreference().setShown('tabs', false);
        fixture.detectChanges();

        const settings = TestBed.inject(PanelService)
          .headerControls()
          .find((control) => control.icon === 'tune');
        expect(settings).toBeTruthy();
      });
    });

    describe('what is on a piece', () => {
      function badges(): HTMLElement[] {
        return [...fixture.nativeElement.querySelectorAll('[data-testid="inventory-buff-badge"]')];
      }

      it('shows a mark beside the name for each one', () => {
        const goblin = putOnTable('ゴブリン');
        goblin.addBuffDataElement();
        goblin.buffs.addRound('毒', '毎ラウンド HP-2', 3, { icon: '☠️', color: 'green', timing: 'roundEnd' });
        fixture.detectChanges();

        expect(badges()).toHaveLength(1);
        expect(badges()[0].textContent?.trim()).toBe('☠️');
        expect(badges()[0].getAttribute('title')).toContain('毒');
      });

      it('shows nothing for a piece nothing has been done to', () => {
        putOnTable('村長');
        fixture.detectChanges();

        expect(badges()).toHaveLength(0);
      });

      it('counts the rest rather than growing the row', () => {
        const goblin = putOnTable('ゴブリン');
        goblin.addBuffDataElement();
        for (const name of ['毒', '麻痺', '出血', '恐怖', '暗闇', '沈黙', '鈍足', '混乱']) {
          goblin.buffs.addRound(name, '', 3);
        }
        fixture.detectChanges();

        expect(badges()).toHaveLength(6);
        expect(fixture.nativeElement.textContent).toContain('+2');
      });
    });

    describe('the ways of reading it', () => {
      it('puts one button in the panel bar, wearing the way being read', () => {
        fixture.detectChanges();

        expect(
          TestBed.inject(PanelService)
            .headerControls()
            .map((control) => control.icon)
        ).toEqual(['view_agenda', 'tune']);

        component.setViewMode('table');
        fixture.detectChanges();

        expect(
          TestBed.inject(PanelService)
            .headerControls()
            .map((control) => control.icon)
        ).toEqual(['table_rows', 'opacity', 'tune']);
      });

      it('leaves nothing painting over the slab once the box is off', () => {
        putOnTable('ゴブリン');
        TestBed.inject(GameObjectInventoryService).tableDataTag = 'HP';
        component.setViewMode('table');
        fixture.detectChanges();

        const tabs = fixture.nativeElement.querySelector('form[name="game-object-inventory"]')
          ?.parentElement as HTMLElement;
        const heading = fixture.nativeElement.querySelector('thead th') as HTMLElement;
        expect(tabs.className).not.toContain('bg-transparent');

        TestBed.inject(PanelService).isGhost.set(true);
        fixture.detectChanges();

        // The strips sit on the ground the content carries; the heading keeps one of its own,
        // or the rows would scroll through it.
        expect(tabs.className).toContain('bg-transparent');
        expect(heading.closest('table')?.className).toContain('[&_thead_th]:bg-ui-ghost-header');
      });

      it('takes the floating ground from the theme rather than a fixed black', () => {
        putOnTable('ゴブリン');
        TestBed.inject(GameObjectInventoryService).tableDataTag = 'HP';
        component.setViewMode('table');
        TestBed.inject(PanelService).isGhost.set(true);
        fixture.detectChanges();

        const strip = fixture.nativeElement.querySelector('form[name="game-object-inventory"]')
          ?.parentElement as HTMLElement;
        const content = strip.parentElement as HTMLElement;
        const table = fixture.nativeElement.querySelector('thead th')?.closest('table') as HTMLElement;

        expect(content.className).toContain('bg-ui-ghost');
        expect(content.className).not.toContain('bg-black');
        expect(table.className).not.toContain('bg-black');
      });

      it('asks the frame for the size the whole list needs', () => {
        putOnTable('ゴブリン');
        TestBed.inject(GameObjectInventoryService).tableDataTag = 'HP';
        component.setViewMode('table');
        fixture.detectChanges();
        const asked: ({ width: number; height: number } | null)[] = [];
        TestBed.inject(PanelService).resizeRequest$.subscribe((size) => asked.push(size));

        // A window somebody has to scroll defeats the point of floating it over the map.
        component.fitToContent();

        expect(asked).toHaveLength(1);
        expect(asked[0]).toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
      });

      it('gives the size back when the box goes on again', () => {
        component.setViewMode('table');
        fixture.detectChanges();
        const ghostControl = () =>
          TestBed.inject(PanelService)
            .headerControls()
            .find((control) => control.icon === 'opacity')!;
        ghostControl().press();
        fixture.detectChanges();
        const asked: ({ width: number; height: number } | null)[] = [];
        TestBed.inject(PanelService).resizeRequest$.subscribe((size) => asked.push(size));

        ghostControl().press();

        expect(asked).toEqual([null]);
      });

      it('offers the box off only for the table, and puts it back on the way out', () => {
        fixture.detectChanges();
        const ghostControl = () =>
          TestBed.inject(PanelService)
            .headerControls()
            .find((control) => control.icon === 'opacity');

        expect(ghostControl()).toBeUndefined();

        component.setViewMode('table');
        fixture.detectChanges();
        ghostControl()!.press();

        expect(TestBed.inject(PanelService).isGhost()).toBe(true);

        component.setViewMode('rich');

        // A column of gauges over the map with nothing behind it reads as nothing at all.
        expect(TestBed.inject(PanelService).isGhost()).toBe(false);
      });

      it('walks round the ways of reading it and back again', () => {
        fixture.detectChanges();
        const asked: boolean[] = [];
        TestBed.inject(PanelService).minimizeRequest$.subscribe((minimized) => asked.push(minimized));

        TestBed.inject(PanelService).headerControls()[0].press();
        expect(component.viewMode()).toBe('table');

        fixture.detectChanges();
        TestBed.inject(PanelService).headerControls()[0].press();

        // The turn order is the panel shrunk to it, which is the frame's own doing.
        expect(asked).toEqual([false, true]);
      });

      it('asks the frame to shrink rather than shrinking itself', () => {
        fixture.detectChanges();
        const asked: boolean[] = [];
        TestBed.inject(PanelService).minimizeRequest$.subscribe((minimized) => asked.push(minimized));

        component.setViewMode('round');
        component.setViewMode('rich');

        expect(asked).toEqual([true, false]);
        expect(component.viewMode()).toBe('rich');
      });

      it('passes the turn order over on a phone, where a panel has nothing to shrink to', () => {
        const viewport = TestBed.inject(ViewportService) as unknown as {
          _isCompact: { set(value: boolean): void };
        };
        viewport._isCompact.set(true);
        fixture.detectChanges();

        component.setViewMode('round');

        expect(component.viewMode()).toBe('rich');
        viewport._isCompact.set(false);
      });
    });

    describe('working on several at once', () => {
      function actions(): HTMLButtonElement[] {
        return [...fixture.nativeElement.querySelectorAll('button')].filter((button) =>
          ['共有', '個人', '墓場', 'フォルダ'].some((label) => button.textContent?.trim().includes(label))
        );
      }

      it('offers nothing to do until something is picked', () => {
        putOnTable('ゴブリン');
        component.isMultiMove.set(true);
        fixture.detectChanges();

        // Moving nowhere used to close the bar and play a sound, which reads as a move that
        // happened.
        expect(actions().length).toBeGreaterThan(0);
        for (const action of actions()) expect(action.disabled).toBe(true);
      });

      it('offers them once something is picked', () => {
        const goblin = putOnTable('ゴブリン');
        component.isMultiMove.set(true);
        component.multiMoveTargets.set(new Set([goblin.identifier]));
        fixture.detectChanges();

        for (const action of actions()) expect(action.disabled).toBe(false);
      });
    });

    it('ticks only the rows the search left when everything is selected', () => {
      putOnTable('ゴブリン');
      putOnTable('村長');
      component.searchQuery.set('村長');
      component.isMultiMove.set(true);

      component.allTabBoxCheck();

      expect(component.multiMoveTargets().size).toBe(1);
      expect(component.filteredRows()[0].identifier).toBe([...component.multiMoveTargets()][0]);
    });
  });
});
