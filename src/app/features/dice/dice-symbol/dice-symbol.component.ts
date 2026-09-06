import { NgStyle } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { CharacterDiceService } from '@axe/application/dice/character-dice.service';
import { DiceRollService } from '@axe/application/dice/dice-roll.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ContextMenuSeparator, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { sheetPanelBox } from '@axe/application/ui/sheet-panel';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { buildSurfaceSwitchContextMenu } from '@axe/application/ui/surface-switch-context-menu';
import { transientSignal } from '@axe/application/ui/transient-signal';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { imageFileEqual } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { buildDiceSymbolContextMenu } from '@axe/features/dice/dice-symbol/dice-symbol-context-menu';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { RotableOption } from '@axe/ui/directives/rotable.directive';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { makeBillboardTransform, makeLabelOrbitTransform } from '@axe/ui/tabletop/billboard-transform';
import { DoubleTap } from '@axe/ui/tabletop/double-tap';
import { hideIconWhileTouched } from '@axe/ui/tabletop/icon-hiding';
import { pieceImageView } from '@axe/ui/tabletop/piece-image-view';
import { setupInputHandler, setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import { translateZCss, Z_OFFSET_TALL_OBJECT_PX } from '@axe/ui/tabletop/z-offset';

/** How long the die rolls before it settles, which is the length of the tumble animation. */
const TUMBLE_MS = 800;
/** How long the callout stays up afterwards, which is the length of its own animation. */
const RESULT_POPUP_MS = 1300;
const TUMBLE_PATHS = 3;

@Component({
  selector: 'dice-symbol',
  templateUrl: './dice-symbol.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MovableDirective, RotableDirective, SelectableDirective, NgStyle, SafePipe],
  host: {
    '[style.display]': "isHiddenByFog() ? 'none' : null",
    '(dragstart)': 'onDragstart($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class DiceSymbolComponent {
  private readonly panelService = inject(PanelService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly diceRollService = inject(DiceRollService);
  private readonly characterDice = inject(CharacterDiceService);
  private readonly chat = inject(ChatMessageService);
  private readonly objectStore = inject(ObjectStore);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly imageService = inject(ImageService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly visionService = inject(VisionService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly tabletopService = inject(TabletopService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly disclosureService = inject(DisclosureService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);

  readonly isHiddenByFog = computed(() => {
    const piece = this.diceSymbol();
    if (!piece) return false;
    this.objectChange.versionOf(piece.identifier)();
    return this.visionService.isPieceHiddenByFog(piece, this.size());
  });

  readonly diceSymbol = input.required<DiceSymbol>();

  get face(): string {
    return this.diceSymbol().face;
  }
  set face(face: string) {
    this.diceSymbol().face = face;
  }
  get owner(): string {
    return this.diceSymbol().owner;
  }
  set owner(owner: string) {
    this.diceSymbol().owner = owner;
  }
  get rotate(): number {
    return this.diceSymbol().rotate;
  }
  set rotate(rotate: number) {
    this.diceSymbol().rotate = rotate;
  }

  readonly name = computed(() => {
    this.objectChange.versionOf(this.diceSymbol().identifier)();
    this.objectChange.networkVersion();
    if (this.diceSymbol().owner) {
      const cursor = PeerCursor.findByUserId(this.diceSymbol().owner);
      if (cursor) this.objectChange.versionOf(cursor.identifier)();
    }
    return this.diceSymbol().name;
  });
  readonly hideName = computed(() => {
    const diceSymbol = this.diceSymbol();
    this.objectChange.versionOf(diceSymbol.identifier)();
    this.objectChange.networkVersion();
    this.objectChange.trackMyCursor();
    return (diceSymbol.hideName || !diceSymbol.isVisible) && !this.rolePermission.canSeeHidden;
  });
  readonly size = computed(() => {
    this.objectChange.versionOf(this.diceSymbol().identifier)();
    return Math.max(0, this.diceSymbol().size);
  });

  readonly imageHeignt = computed(() => {
    this.objectChange.versionOf(this.diceSymbol().identifier)();
    return this.diceSymbol().komaImageHeight;
  });
  readonly specifyImageFlag = computed(() => {
    this.objectChange.versionOf(this.diceSymbol().identifier)();
    return this.diceSymbol().specifyKomaImageFlag;
  });

  get faces(): string[] {
    return this.diceSymbol().faces;
  }
  readonly imageFile = computed(
    () => {
      this.objectChange.fileVersion();
      const diceSymbol = this.diceSymbol();
      this.objectChange.versionOf(diceSymbol.identifier)();
      return this.imageService.getEmptyOr(diceSymbol.imageFile);
    },
    { equal: imageFileEqual() }
  );

  get isMine(): boolean {
    return this.diceSymbol().isMine;
  }
  get hasOwner(): boolean {
    return this.diceSymbol().hasOwner;
  }
  get ownerName(): string {
    return this.diceSymbol().ownerName;
  }
  get isVisible(): boolean {
    return this.diceSymbol().isVisible || this.rolePermission.canSeeHidden;
  }

  get isLock(): boolean {
    return this.diceSymbol().isLock;
  }
  set isLock(isLock: boolean) {
    this.diceSymbol().isLock = isLock;
  }

  readonly animeState = signal<'inactive' | 'active'>('inactive');
  /** Which of the three paths this throw takes, so a handful does not roll as one. */
  readonly tumble = signal(0);
  /** The face it came to rest on, called out over the die until the callout fades. */
  readonly rollResult = transientSignal<string | null>(null, RESULT_POPUP_MS);

  private rollTimers: ReturnType<typeof setTimeout>[] = [];

  private readonly iconHiding = hideIconWhileTouched(this.destroyRef);
  readonly isIconHidden = this.iconHiding.isHidden;

  get gridSize(): number {
    return this.tabletopService.gridSize();
  }

  readonly rotateSignal = computed(() => {
    this.objectChange.versionOf(this.diceSymbol().identifier)();
    return this.diceSymbol().rotate;
  });

  readonly isPoster = computed(() => {
    const dice = this.diceSymbol();
    this.objectChange.versionOf(dice.identifier)();
    return (dice.location.surface ?? 'floor') !== 'floor';
  });

  readonly billboardTransform = computed(() => (this.isPoster() ? '' : this.makeBillboardTransform(30)));
  readonly billboardTransformOwner = computed(() => (this.isPoster() ? '' : this.makeBillboardTransform(55)));
  readonly billboardTransformImage = computed(() => (this.isPoster() ? '' : this.makeBillboardTransform(0)));

  readonly imageBillboardEnabled = computed(() => {
    if (this.isPoster()) return true;
    const table = this.tabletopService.currentTable;
    this.objectChange.versionOf(table.identifier)();
    this.objectChange.versionOf(this.tabletopService.tableSelecter.identifier)();
    return table.imageBillboard || this.tabletopService.mode2d();
  });

  readonly imageView = pieceImageView({
    imageUrl: computed(() => this.imageFile().url),
    isPoster: this.isPoster,
    sizePx: computed(() => this.size() * this.gridSize),
    specifiedHeightPx: computed(() => (this.specifyImageFlag() ? +this.imageHeignt() : null)),
    billboardEnabled: this.imageBillboardEnabled,
    billboardTransform: this.billboardTransformImage,
  });

  readonly mode2dEnabled = computed(() => {
    if (this.isPoster()) return true;
    return this.tabletopService.mode2d();
  });

  private labelOrbitTransform(distance3d: number, distance2d: number): string {
    return makeLabelOrbitTransform({
      rotation: this.uiSignalService.tableViewRotation(),
      distance3d,
      distance2d,
      mode2d: this.mode2dEnabled(),
    });
  }

  readonly nameLabelOrbit = computed(() => {
    if (this.isPoster()) return `translateY(${-(this.size() * this.gridSize + 5)}px)`;
    return this.labelOrbitTransform(30, 60);
  });
  readonly ownerLabelOrbit = computed(() => {
    if (this.isPoster()) return `translateY(${-(this.size() * this.gridSize + 8)}px)`;
    return this.labelOrbitTransform(55, 90);
  });

  private makeBillboardTransform(verticalOffset3D: number): string {
    return makeBillboardTransform({
      rotation: this.uiSignalService.tableViewRotation(),
      pieceRotate: this.rotateSignal(),
      parentInverseRotation: 'rotateX(90deg)',
      verticalOffset3D,
      mode2d: this.mode2dEnabled(),
    });
  }

  readonly movableOption = signal<MovableOption>({});
  readonly rotableOption = signal<RotableOption>({});

  private readonly doubleTap = new DoubleTap(() => this.input);

  private readonly inputRef = setupInputHandler({
    elementRef: this.elementRef,
    destroyRef: this.destroyRef,
    onStart: (e) => this.onInputStart(e),
  });

  private get input() {
    return this.inputRef.current;
  }

  constructor() {
    this.objectChange.rollDiceSymbol$.subscribe((event) => {
      if (event.identifier === this.diceSymbol().identifier) this.startRoll();
    }, this.destroyRef);
    this.destroyRef.onDestroy(() => this.clearRollTimers());
    setupMovableRotableForPiece(this, {
      target: this.diceSymbol,
      collideLayers: ['terrain'],
      transformCssOffset: translateZCss(Z_OFFSET_TALL_OBJECT_PX),
    });
    this.destroyRef.onDestroy(() => {
      this.doubleTap.cancel();
    });
  }

  onDragstart(e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  onDiceRollEnd() {
    this.animeState.set('inactive');
  }

  /**
   * The throw: the die rolls, and what it came to rest on is called out over it.
   *
   * The callout waits for the die to settle. Shown while it is still turning it would
   * give the face away before the die does, and the roll would be over before it landed.
   */
  private startRoll(): void {
    this.clearRollTimers();
    this.rollResult.clear();
    this.tumble.update((path) => (path + 1) % TUMBLE_PATHS);
    this.animeState.set('inactive');

    this.rollTimers.push(setTimeout(() => this.animeState.set('active')));
    this.rollTimers.push(
      setTimeout(() => {
        // A die nobody may see calls nothing out; the face is the owner's to read.
        if (!this.isVisible) return;
        this.rollResult.show(this.diceSymbol().face);
      }, TUMBLE_MS)
    );
  }

  private onDiceRevealed(face: string): void {
    const opened = this.chat.discloseDieRolls(this.diceSymbol().identifier);
    if (opened < 1) this.announceRevealedFace(face);
  }

  /**
   * Says what a die that was somebody's alone came to rest on, now that it is everybody's.
   *
   * A hidden die is thrown without a callout, so the table only ever learns the face when
   * it is opened. Said only where there is no throw of it left to open - a face set by hand,
   * or a throw already opened - since an opened throw gives the number itself.
   */
  private announceRevealedFace(face: string): void {
    const name = this.diceSymbol().name.trim();
    const message =
      name.length > 0
        ? this.translateFn('feature.dice.log.reveal', { name, face })
        : this.translateFn('feature.dice.log.revealNoName', { face });
    this.chat.sendSystemMessageToMainTab(message);
  }

  private clearRollTimers(): void {
    for (const timer of this.rollTimers.splice(0)) clearTimeout(timer);
  }

  onInputStart(e: MouseEvent | TouchEvent) {
    this.startDoubleClickTimer(e);
    this.iconHiding.touch();
  }

  startDoubleClickTimer(e: MouseEvent | TouchEvent) {
    this.doubleTap.handle(e, () => this.onDoubleClick());
  }

  onDoubleClick() {
    this.doubleTap.cancel();
    if (!this.rolePermission.canEditTabletop) return;
    if (!this.doubleTap.isInPlace()) return;
    if (this.isVisible) this.diceRoll();
  }

  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const position = this.pointerDeviceService.pointers[0];
    if (this.pieceContextMenu.openForSelection(this.diceSymbol(), this.gridSize, position)) return;
    const baseMenu = buildDiceSymbolContextMenu(
      this.diceSymbol(),
      this.gridSize,
      {
        onDiceRoll: () => this.diceRoll(),
        onShowDetail: () => this.showDetail(this.diceSymbol()),
        ownerCandidates: this.tabletopService.characters.map((character) => ({
          identifier: character.identifier,
          name: character.name,
        })),
        onStoreToOwner: (ownerIdentifier) => this.storeToOwner(ownerIdentifier),
        onRevealed: (face) => this.onDiceRevealed(face),
        canRevealHidden: this.rolePermission.canSeeHidden,
      },
      this.translateFn
    );
    const surfaceEntries = buildSurfaceSwitchContextMenu(
      this.diceSymbol(),
      this.tabletopService.currentTable,
      this.translateFn
    );
    this.contextMenuService.open(
      position,
      surfaceEntries.length > 0 ? [...baseMenu, ContextMenuSeparator, ...surfaceEntries] : baseMenu,
      this.hideName() ? '' : this.name()
    );
  }

  onMove() {
    SoundEffect.play(PresetSound.dicePick);
  }

  onMoved() {
    SoundEffect.play(PresetSound.dicePut);
  }

  private storeToOwner(ownerIdentifier: string): void {
    const owner = this.objectStore.get<GameCharacter>(ownerIdentifier);
    if (owner instanceof GameCharacter) this.characterDice.store(owner, this.diceSymbol());
  }

  diceRoll(): string {
    const [rolled] = this.diceRollService.roll([this.diceSymbol()]);
    return rolled?.face ?? this.diceSymbol().face;
  }

  showDetail(gameObject: DiceSymbol) {
    if (!this.disclosureService.canView(gameObject)) return;
    this.selectionSignalService.selectObject(gameObject.identifier, gameObject.aliasName);
    const coordinate = this.pointerDeviceService.pointers[0];
    const title = sheetPanelTitle(this.translateFn('feature.dice.symbolSheet.title'), gameObject.name);
    const option: PanelOption = {
      title: title,
      ...sheetPanelBox(coordinate, 500, 600),
    };
    this.panelService.openLazy(
      () =>
        import('@axe/features/dice/dice-symbol-sheet/dice-symbol-sheet.component').then(
          (m) => m.DiceSymbolSheetComponent
        ),
      option,
      (component) => (component.diceSymbol = gameObject)
    );
  }
}
