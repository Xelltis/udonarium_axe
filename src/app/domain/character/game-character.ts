import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectStore } from '@axe/core/sync/object-store';
import { generateUuid } from '@axe/core/util/uuid';
import { BuffManager } from '@axe/domain/character/buff-manager';
import { CharacterTemplateFactory } from '@axe/domain/character/character-template-factory';
import { shownImageIdentifier } from '@axe/domain/character/shown-image';
import { StatusAccessor } from '@axe/domain/character/status-accessor';
import { BuffPalette, ChatPalette, SubPalette } from '@axe/domain/chat/chat-palette';
import { DEFAULT_CHAT_BUBBLE_CODES, DEFAULT_CHAT_COLOR_CODES } from '@axe/domain/chat/constants';
import { paletteRowsOf } from '@axe/domain/chat/palette-rows';
import { convertLegacyCheckTableElements } from '@axe/domain/data/check-table-converter';
import {
  DataElement,
  DataElementAttribute,
  DataElementRole,
  type DataElementRoleValue,
  DataElementType,
} from '@axe/domain/data/data-element';
import { OwnedTabletopObject } from '@axe/domain/tabletop/owned-tabletop-object';
import { moveToBottommost, moveToTopmost } from '@axe/domain/tabletop/tabletop-object-util';
import {
  asVisionShape,
  facingBearing,
  VISION_SHAPE_DEFAULTS,
  VisionShape,
  VisionSpec,
} from '@axe/domain/tabletop/vision-shape';
import {
  DEFAULT_LIGHT_COLOR,
  LightAnimation,
  LightCategory,
  LightPreset,
  LightSpec,
  VisionType,
} from '@axe/domain/tabletop/vision-types';
import {
  toPortraitSlot,
  VN_PORTRAIT_POS_UNSET,
  VN_PORTRAIT_SLOT_COUNT,
} from '@axe/domain/visual-novel/vn-portrait-position';

/** The name the memo kept with a piece goes by, as another fork names it. */
const INNER_NOTE_NAME = 'inner-note';

@SyncObject('character')
export class GameCharacter extends OwnedTabletopObject {
  @SyncVar() owner: string = '';
  @SyncVar() partyIdentifier: string = '';
  @SyncVar() folderName: string = '';
  @SyncVar() vnPortraitPos: number = VN_PORTRAIT_POS_UNSET;
  private static readonly MAX_DETAIL_GROUP_DEPTH = 2;

  constructor(identifier: string = generateUuid()) {
    super(identifier);
    this.isAltitudeIndicate = true;
  }

  @SyncVar() isLock: boolean = false;
  @SyncVar() zindex: number = 0;

  @SyncVar() rotate: number = 0;
  @SyncVar() roll: number = 0;
  @SyncVar() isDropShadow: boolean = false;

  @SyncVar() hideInventory: boolean = false;
  /** Kept out of the order of turns. The piece is still listed, and still carries its buffs. */
  @SyncVar() noTurn: boolean = false;
  @SyncVar() nonTalkFlag: boolean = false;
  @SyncVar() hideName: boolean = false;
  @SyncVar() hideBuff: boolean = false;
  @SyncVar() isNpc: boolean = false;
  /** The engagement zone the piece is in, as its identifier, or empty for none. */
  @SyncVar() engagementZone: string = '';
  /** `1` while the piece is taken out of the fight, so nothing counts it; empty otherwise. */
  @SyncVar() offField: string = '';
  /** The round the piece said it would leave its zone in, empty where it has not; `0` while no round is kept. */
  @SyncVar() zoneLeaveRound: string = '';
  /**
   * `1` while nobody can see the piece: no move of it can be stopped, and a move it stops makes a zone
   * there and then; empty otherwise.
   */
  @SyncVar() unseen: string = '';
  /**
   * `1` while the piece keeps out of sight of the table: only the game master, its owner and its
   * party see it; empty otherwise.
   */
  @SyncVar() stealth: string = '';
  /** `1` while the piece is down and cannot act, which keeps it out of every zone; empty otherwise. */
  @SyncVar() downed: string = '';
  /** `1` while the piece is held fast where it stands and cannot move; empty otherwise. */
  @SyncVar() heldFast: string = '';
  /** `1` while the move being worked out for the piece is one nobody may stop; empty otherwise. */
  @SyncVar() unstoppableMove: string = '';
  /**
   * The piece holding on to this one, as its identifier, or empty: one held on to cannot move of its
   * own will, and goes where the one holding it goes.
   */
  @SyncVar() grabbedBy: string = '';
  /** The mount the piece rides, as its identifier, or empty: it stands on that mount and goes where it goes. */
  @SyncVar() ridingOn: string = '';
  /** Where the piece rides its mount: empty in front, `passenger` behind, `cargo` carried as a load. */
  @SyncVar() rideSeat: string = '';
  /** `1` while the piece is a mount others may ride; empty otherwise. */
  @SyncVar() mountable: string = '';
  /** `1` where a mount takes a second rider behind the one in front; empty otherwise. */
  @SyncVar() mountPassenger: string = '';
  /** How many a mount may carry as a load, empty for none. A mount that carries any takes no second rider. */
  @SyncVar() mountCargo: string = '';
  /** `1` where anybody may ride a mount in front, skilled at steering or not; empty otherwise. */
  @SyncVar() mountAnyone: string = '';
  /**
   * Where a mount's riders stand above its base: a number of cells, a part of its height such as
   * `75%`, or empty for the top of its picture where it is given a height and half its size where not.
   */
  @SyncVar() mountSeatHeight: string = '';
  /** `1` while the piece lies where it fell, empty otherwise: it gets on no mount and no mount takes it. */
  @SyncVar() prone: string = '';
  /** The mark of the turn the piece fell in, where it was its own: it gets up no sooner than the next. */
  @SyncVar() proneTurn: string = '';
  /** The mark of the turn the piece last got on or off a mount in, or empty: it does so once a turn. */
  @SyncVar() rideChangedTurn: string = '';
  /** The mount the piece last got off, as its identifier, until it gets on one again; empty otherwise. */
  @SyncVar() rideLeftFrom: string = '';
  /** Where the piece sat on the mount it last got off, written as {@link rideSeat} is. */
  @SyncVar() rideLeftSeat: string = '';
  /** The mount whose buff for riding two up the piece was given, as its identifier, or empty. */
  @SyncVar() rideTwoUpFrom: string = '';
  /** The buff for riding two up the piece was given, as its identifier, or empty where none was. */
  @SyncVar() rideTwoUpBuff: string = '';
  /** The mark of the turn a mount last set out on a move in, or empty. */
  @SyncVar() rideMoveTurn: string = '';
  /** How far, in metres, a mount set out to move in that turn, or empty. */
  @SyncVar() rideMoveM: string = '';
  @SyncVar() disclosureMode: string = '';
  @SyncVar() disclosureUserIds: string[] = [];
  @SyncVar() overViewWidth: number = 270;
  @SyncVar() overViewMaxHeight: number = 250;

  @SyncVar() specifyKomaImageFlag: boolean = false;
  @SyncVar('komaImageHeignt') komaImageHeight: number = 100;
  /**
   * The width the picture is drawn at apart from its height, in pixels, while its height is set; 0,
   * or anything but a positive number, keeps the picture's own proportions.
   */
  @SyncVar() komaImageWidth: number = 0;

  @SyncVar() chatColorCode: string[] = [...DEFAULT_CHAT_COLOR_CODES];
  /** The bubble each colour is shown on, per theme. An empty entry is worked out instead. */
  @SyncVar() chatBubbleLight: string[] = [...DEFAULT_CHAT_BUBBLE_CODES];
  @SyncVar() chatBubbleDark: string[] = [...DEFAULT_CHAT_BUBBLE_CODES];
  @SyncVar() overViewDataTags: string[] = [];
  @SyncVar() syncDummyCounter: number = 0;
  /**
   * How each of the character's portraits sits in a cut-in's portrait slot, as
   * `cut-in-portrait-fit.ts` writes it. Empty leaves every portrait to the cut-in's own framing.
   */
  @SyncVar() cutInPortraitFits: string = '';
  /**
   * The side of the battle stage the master has put the piece on, `left` or `right`. Empty stands it
   * where its party does, and out of the lineup where its party stands on neither; `none` keeps it
   * out though its party stands on a side.
   */
  @SyncVar() battleSide: string = '';
  /**
   * Which way the picture of the piece faces, `left` or `right`, so the battle stage turns it to
   * face the one across from it; empty to stand it as drawn.
   */
  @SyncVar() battleFacing: string = '';
  /** The effect the piece strikes with on the battle stage, by name. Empty strikes with the stage's own. */
  @SyncVar() battleEffect: string = '';

  /**
   * How the piece is getting about, as one of MOVE_MODES. Empty walks.
   *
   * Held on the piece rather than asked each time it is moved: a dragon in the air stays in
   * the air until somebody says otherwise, and a reach worked out for it has to know.
   */
  @SyncVar() moveMode: string = '';

  @SyncVar() visionType: string = VisionType.NORMAL;
  @SyncVar() visionRange: number = 0;
  @SyncVar() castsShadow: boolean = true;

  @SyncVar() visionShape: string = VisionShape.DOME;
  @SyncVar() visionConeAngle: number = VISION_SHAPE_DEFAULTS[VisionShape.CONE].coneAngle;
  @SyncVar() visionConeCount: number = VISION_SHAPE_DEFAULTS[VisionShape.CONE_MULTI].coneCount;
  @SyncVar() visionBackAngle: number = VISION_SHAPE_DEFAULTS[VisionShape.CONE_BACK].backAngle;
  @SyncVar() visionBackScale: number = VISION_SHAPE_DEFAULTS[VisionShape.CONE_BACK].backScale;
  @SyncVar() visionPeripheralScale: number = VISION_SHAPE_DEFAULTS[VisionShape.CONE_PERIPHERAL].peripheralScale;
  @SyncVar() visionDirection: number = 0;
  @SyncVar() visionLobes: string = '';
  @SyncVar() showVisionRange: boolean = false;

  @SyncVar() lightEnabled: boolean = false;
  @SyncVar() lightPreset: string = LightPreset.CUSTOM;
  @SyncVar() lightBrightRadius: number = 0;
  @SyncVar() lightDimRadius: number = 0;
  @SyncVar() lightColor: string = DEFAULT_LIGHT_COLOR;
  @SyncVar() lightAngle: number = 360;
  @SyncVar() lightDirection: number = 0;
  @SyncVar() lightPitch: number = 0;
  @SyncVar() lightAnimation: string = LightAnimation.NONE;

  /** Where the portrait stands in chat. Null when the character has no such field yet. */
  get portraitPosition(): number | null {
    return toPortraitSlot(this.detailDataElement?.getFirstElementByName('POS')?.currentValue);
  }
  set portraitPosition(pos: number) {
    this.addExtendData();
    const element = this.detailDataElement?.getFirstElementByName('POS');
    if (!element) return;
    element.currentValue = Math.max(0, Math.min(VN_PORTRAIT_SLOT_COUNT - 1, Math.round(pos)));
    this.update();
  }

  /**
   * The shape of this piece's field of view, gathered from its vision settings. Its direction is
   * worked out from the piece's rotation and the facing set for its vision, so turning the piece
   * turns what it sees.
   */
  get visionSpec(): VisionSpec {
    return {
      shape: asVisionShape(this.visionShape),
      coneAngle: this.visionConeAngle,
      coneCount: this.visionConeCount,
      backAngle: this.visionBackAngle,
      backScale: this.visionBackScale,
      peripheralScale: this.visionPeripheralScale,
      direction: facingBearing(this.rotate, this.visionDirection),
      lobes: this.visionLobes,
    };
  }

  /**
   * The light this piece carries, as the vision renderer reads it.
   *
   * Its direction turns with the piece, and it is always a physical light that walls block and that
   * casts shadows.
   */
  get lightSpec(): LightSpec {
    return {
      enabled: this.lightEnabled,
      preset: this.lightPreset as LightPreset,
      brightRadius: this.lightBrightRadius,
      dimRadius: this.lightDimRadius,
      color: this.lightColor,
      angle: this.lightAngle,
      direction: this.rotate + this.lightDirection,
      pitch: this.lightPitch,
      animation: this.lightAnimation as LightAnimation,
      category: LightCategory.PHYSICAL,
      ignoreOcclusion: false,
      revealToAll: false,
      castShadows: true,
    };
  }

  chatBubbleAltitude: number = 0;

  private _targeted: boolean = false;
  /**
   * Whether this piece is ticked as a target in the remote controller. Kept in this browser alone
   * and never synced.
   */
  get targeted(): boolean {
    return this._targeted;
  }
  set targeted(flag: boolean) {
    this._targeted = flag;
  }

  private _selectedPortraitIndex: number = 0;
  /**
   * Which of the piece's pictures is chosen to speak with in chat, kept in this browser alone.
   *
   * An index past either end of the picture list is pulled back to the nearest picture, both when
   * it is set and when it is read.
   */
  get selectedPortraitIndex(): number {
    const childCount = this.imageDataElement?.children.length ?? 0;
    if (this._selectedPortraitIndex > childCount - 1) {
      this._selectedPortraitIndex = childCount - 1;
    }
    if (this._selectedPortraitIndex < 0) {
      this._selectedPortraitIndex = 0;
    }

    return this._selectedPortraitIndex;
  }

  set selectedPortraitIndex(num: number) {
    const childCount = this.imageDataElement?.children.length ?? 0;
    if (num > childCount - 1) num = childCount - 1;
    if (num < 0) num = 0;
    this._selectedPortraitIndex = num;
  }

  /**
   * The picture the piece shows on the table; see {@link shownImageIdentifier}. The empty image when
   * nothing is found.
   */
  override get imageFile(): ImageFile {
    const identifier = shownImageIdentifier(this.imageDataElement, this.detailDataElement);
    return (identifier.length > 0 ? ImageStorage.instance.get(identifier) : null) ?? ImageFile.Empty;
  }

  /** How many cells the piece spans, kept in its common data. 1 when unset. */
  get size(): number {
    return this.getCommonValue('size', 1);
  }
  set size(value: number) {
    this.setCommonValue('size', value);
  }
  /** The piece's chat palette: the first palette among its children, or null when it has none. */
  get chatPalette(): ChatPalette | null {
    for (const child of this.children) {
      if (child instanceof ChatPalette) return child;
    }
    return null;
  }

  /**
   * The memo kept with the piece, beside its sheet rather than in it, under the name another fork
   * keeps it by so that a room saved there brings it along; null until something is written.
   */
  get innerNote(): DataElement | null {
    for (const child of this.children) {
      if (child instanceof DataElement && child.getAttribute('name') === INNER_NOTE_NAME) return child;
    }
    return null;
  }

  /** What the memo kept with the piece says, empty while nothing is written. */
  get note(): string {
    return `${this.innerNote?.value ?? ''}`;
  }

  /** Writes the memo kept with the piece, making its element on the first write that says anything. */
  set note(text: string) {
    const held = this.innerNote;
    if (held) {
      held.value = text;
      return;
    }
    if (text.length < 1) return;
    this.appendChild(DataElement.create(INNER_NOTE_NAME, text, { type: 'note' }, `innernote_${this.identifier}`));
  }

  /**
   * The palette of buff commands the remote controller offers for this piece, or null until
   * `addExtendData` has given it one.
   */
  get remoteController(): BuffPalette | null {
    for (const child of this.children) {
      if (child instanceof BuffPalette) {
        return child;
      }
    }
    return null;
  }

  /** The `buff` element in the piece's data that holds its buffs, or null when it has none yet. */
  get buffDataElement(): DataElement | null {
    return this.getElement('buff');
  }

  /** Raises the piece above the other pieces it overlaps on the table. */
  toTopmost() {
    moveToTopmost(this);
  }

  /** Lowers the piece beneath the other pieces it overlaps on the table. */
  toBottommost() {
    moveToBottommost(this);
  }

  /**
   * Gives the piece a `buff` element to hold its buffs, and drops the cached buff manager so it
   * picks the element up. Does nothing when the piece already has one.
   */
  addBuffDataElement() {
    if (!this.buffDataElement) {
      this.rootDataElement?.appendChild(DataElement.create('buff', '', {}, `buff_${this.identifier}`));
      this._buffs = null;
    }
  }

  private _buffs: BuffManager | null = null;
  private _status: StatusAccessor | null = null;

  /**
   * The buff manager for this piece, bound to its buff element, its name and identifier, and its
   * statuses.
   *
   * It is made on first use and cached, so it only sees a buff element added later because
   * `addBuffDataElement` drops the cached one.
   */
  get buffs(): BuffManager {
    return (this._buffs ??= new BuffManager(
      this.buffDataElement ?? null,
      () => ({ identifier: this.identifier, name: this.name }),
      () => this.status
    ));
  }

  /**
   * Reads and writes the piece's statuses by name, for chat commands and buffs. Made on first use
   * and cached.
   */
  get status(): StatusAccessor {
    return (this._status ??= new StatusAccessor(this.detailDataElement ?? null, () => this.name));
  }

  /**
   * Makes and initializes a new character filled with the default sample sheet. It is not placed on
   * any table.
   */
  static create(name: string, size: number, imageIdentifier: string): GameCharacter {
    const gameCharacter: GameCharacter = new GameCharacter();
    gameCharacter.createDataElements();
    gameCharacter.initialize();

    CharacterTemplateFactory.createDefault(gameCharacter, name, size, imageIdentifier);

    return gameCharacter;
  }

  /**
   * Reads the piece from room data, then brings an older sheet up to the current shape: sections
   * and groups get their roles, legacy check tables are converted, and the old overview tags become
   * popup attributes.
   */
  override parseInnerXml(element: Element): void {
    super.parseInnerXml(element);
    this.normalizeDetailDataElementHierarchy();
    this.convertLegacyCheckTableData();
    this.migrateOverviewDataTagsToElementAttributes();
    this.foldSubPalettesIntoTabs();
  }

  /**
   * Folds the palettes another fork kept beside this one's, a tab apiece, into this piece's palette:
   * each goes after what is there as a `◆◆name` tab named by its first line, as that fork names it,
   * and the palettes kept beside are let go.
   */
  private foldSubPalettesIntoTabs(): void {
    const kept = this.children.filter((child): child is SubPalette => child instanceof SubPalette);
    if (kept.length < 1) return;
    const tabs: string[] = [];
    for (const sub of kept) {
      for (const child of sub.children) {
        if (!(child instanceof ChatPalette)) continue;
        const text = `${child.value ?? ''}`;
        tabs.push(`◆◆${subPaletteName(text)}\n${text}`);
      }
    }
    if (tabs.length > 0) {
      const palette = this.chatPalette ?? this.appendChatPalette();
      palette.setPalette([`${palette.value ?? ''}`, ...tabs].join('\n'));
    }
    for (const sub of kept) sub.destroy();
  }

  /** Gives the piece a palette of its own, for one that came without any. */
  private appendChatPalette(): ChatPalette {
    const palette = new ChatPalette(`ChatPalette_${this.identifier}`);
    palette.initialize();
    this.appendChild(palette);
    return palette;
  }

  /**
   * Adds what this tool expects every character to carry and an older or imported one may lack.
   *
   * That is the buff element and its container, the portrait position and piece picture fields, and
   * the buff command palette, followed by the same tidying a load does. Anything already there is
   * left as it is.
   */
  addExtendData() {
    this.addBuffDataElement();

    const detail = this.detailDataElement;
    if (!detail) return;

    const portraitPosEl = detail.getElementsByName('立ち絵位置');
    if (portraitPosEl.length == 0) {
      const testElement: DataElement = this.createDetailSectionElement('立ち絵位置', `立ち絵位置${this.identifier}`);
      const groupElement: DataElement = this.createDetailGroupElement('基本', `立ち絵位置基本${this.identifier}`);
      detail.appendChild(testElement);
      testElement.appendChild(groupElement);
      groupElement.appendChild(
        DataElement.create(
          'POS',
          11,
          {
            [DataElementAttribute.ROLE]: DataElementRole.FIELD,
            type: DataElementType.NUMBER_RESOURCE,
            currentValue: '0',
          },
          `POS_${this.identifier}`
        )
      );
    }

    const iconNum = detail.getElementsByName('コマ画像');
    if (iconNum.length == 0) {
      const elementKoma: DataElement = this.createDetailSectionElement('コマ画像', `コマ画像${this.identifier}`);
      const groupElement: DataElement = this.createDetailGroupElement('基本', `コマ画像基本${this.identifier}`);
      detail.appendChild(elementKoma);

      //puts the piece picture in after the portrait
      const portraitPosEls = detail.getElementsByName('立ち絵位置');
      if (portraitPosEls.length != 0) {
        const parentElement = portraitPosEls[0].parent;
        if (!parentElement) return;
        const index: number = parentElement.children.indexOf(portraitPosEls[0]);
        if (index < parentElement.children.length - 1) {
          const nextElement = parentElement.children[index + 1];

          parentElement.insertBefore(elementKoma, nextElement);
        }
      }
      elementKoma.appendChild(groupElement);
      groupElement.appendChild(
        DataElement.create(
          'ICON',
          (this.imageDataElement?.children.length ?? 1) - 1,
          {
            [DataElementAttribute.ROLE]: DataElementRole.FIELD,
            type: DataElementType.NUMBER_RESOURCE,
            currentValue: 0,
          },
          `ICON_${this.identifier}`
        )
      );
    }

    const buff = this.buffDataElement;
    if (!buff) return;
    const isbuff = buff.getElementsByName('バフ/デバフ');
    if (isbuff.length == 0) {
      const buffElement: DataElement = DataElement.create('バフ/デバフ', '', {}, `バフ/デバフ${this.identifier}`);
      buff.appendChild(buffElement);
    }
    if (this.remoteController == null) {
      const controller: BuffPalette = new BuffPalette(`RemotController_${this.identifier}`);
      controller.setPalette(`コントローラ入力例：
マッスルベアー DB+2 3
クリティカルレイ A 18
セイクリッドウェポン 命+1攻+2 18`);
      controller.initialize();
      this.appendChild(controller);
    }
    this.normalizeDetailDataElementHierarchy();
    this.convertLegacyCheckTableData();
    this.migrateOverviewDataTagsToElementAttributes();
  }

  private convertLegacyCheckTableData(): void {
    const detail = this.detailDataElement;
    if (!detail) return;
    convertLegacyCheckTableElements(detail);
  }

  private migrateOverviewDataTagsToElementAttributes(): void {
    const detail = this.detailDataElement;
    if (!detail || this.overViewDataTags.length < 1) return;

    const targetIds = new Set(this.overViewDataTags);
    const scan = (element: DataElement): void => {
      if (targetIds.has(element.identifier)) element.setAttribute(DataElementAttribute.POPUP, 'true');
      for (const child of element.children) scan(child);
    };
    scan(detail);
    this.overViewDataTags = [];
  }

  /**
   * Makes the sheet follow the section, group and field shape the character sheet expects.
   *
   * Loose fields sitting directly in a section are wrapped in generated `基本` groups, and a group
   * nested more than two levels deep is lifted out into its section.
   */
  normalizeDetailDataElementHierarchy(): void {
    const detail = this.detailDataElement;
    if (!detail) return;

    for (const section of [...detail.children]) {
      this.ensureFieldRole(section, DataElementRole.SECTION);
      this.normalizeSectionElement(section);
    }
    detail.update();
  }

  private normalizeSectionElement(section: DataElement): void {
    let generatedGroupCount = 0;
    let currentGeneratedGroup: DataElement | null = null;

    for (const child of [...section.children]) {
      if (this.shouldWrapSectionChildAsField(child)) {
        if (!currentGeneratedGroup) {
          currentGeneratedGroup = this.createDetailGroupElement(
            generatedGroupCount === 0 ? '基本' : `基本 ${generatedGroupCount + 1}`
          );
          section.insertBefore(currentGeneratedGroup, child);
          generatedGroupCount++;
        }
        this.ensureFieldRole(child, DataElementRole.FIELD);
        currentGeneratedGroup.appendChild(child);
      } else {
        currentGeneratedGroup = null;
        this.ensureFieldRole(child, DataElementRole.GROUP);
        this.normalizeGroupElement(child, section);
      }
    }
    section.update();
  }

  private normalizeGroupElement(group: DataElement, parentSection: DataElement, groupDepth: number = 1): void {
    let insertionTarget = group;

    for (const child of [...group.children]) {
      if (child.children.length > 0 && child.fieldRole !== DataElementRole.FIELD) {
        this.ensureFieldRole(child, DataElementRole.GROUP);
        this.normalizeGroupElement(child, parentSection, groupDepth + 1);
        if (groupDepth >= GameCharacter.MAX_DETAIL_GROUP_DEPTH) {
          this.insertElementAfter(child, insertionTarget, parentSection);
          insertionTarget = child;
        }
      } else {
        this.ensureFieldRole(child, DataElementRole.FIELD);
      }
    }
    group.update();
  }

  private shouldWrapSectionChildAsField(child: DataElement): boolean {
    const explicitRole = child.getAttribute(DataElementAttribute.ROLE);
    if (explicitRole === DataElementRole.SECTION || explicitRole === DataElementRole.GROUP) return false;
    return child.fieldRole === DataElementRole.FIELD || child.children.length === 0;
  }

  private createDetailSectionElement(name: string, identifier?: string): DataElement {
    return DataElement.create(
      name,
      '',
      {
        [DataElementAttribute.ROLE]: DataElementRole.SECTION,
      },
      identifier
    );
  }

  private createDetailGroupElement(name: string, identifier?: string): DataElement {
    return DataElement.create(
      name,
      '',
      {
        [DataElementAttribute.ROLE]: DataElementRole.GROUP,
      },
      identifier
    );
  }

  private ensureFieldRole(element: DataElement, role: DataElementRoleValue): void {
    if (element.getAttribute(DataElementAttribute.ROLE) !== role) element.setFieldRole(role);
  }

  private insertElementAfter(element: DataElement, targetElement: DataElement, parentElement: DataElement): void {
    const targetIndex = parentElement.children.indexOf(targetElement);
    const nextElement = parentElement.children[targetIndex + 1];
    if (nextElement) parentElement.insertBefore(element, nextElement);
    else parentElement.appendChild(element);
  }

  /**
   * Copies the piece and names the copy with the next free number, so copying `Goblin` when
   * `Goblin_2` exists makes `Goblin_3`.
   *
   * The numbers already taken are counted across every character outside the graveyard.
   */
  override clone(): this {
    const cloneObject = super.clone();

    let objectname: string;
    const reg = new RegExp('^(.*)_([0-9]+)$');
    let res = cloneObject.name.match(reg);

    let cloneNumber: number;
    if (res != null && res.length == 3) {
      objectname = res[1];
      cloneNumber = parseInt(res[2]) + 1;
    } else {
      objectname = cloneObject.name;
      cloneNumber = 2;
    }

    const list = ObjectStore.instance.getObjects(GameCharacter);
    for (const character of list) {
      if (character.location.name == 'graveyard') continue;

      res = character.name.match(reg);
      if (res != null && res.length == 3 && res[1] == objectname) {
        const numberChk = parseInt(res[2]) + 1;
        if (cloneNumber <= numberChk) {
          cloneNumber = numberChk;
        }
      }
    }

    cloneObject.name = `${objectname}_${cloneNumber}`;
    cloneObject.update();

    return cloneObject;
  }
}

/**
 * The name a palette kept beside a piece's own goes by as a tab: its first line, as the fork that
 * keeps it names it, without the diamonds a heading or a tab is written with, so that it opens a tab
 * of its own rather than reading as a heading.
 */
function subPaletteName(text: string): string {
  const first = paletteRowsOf(text.split('\n')).find(
    (row) => row.kind === 'command' || row.kind === 'heading' || row.kind === 'tab'
  );
  if (!first) return '';
  const name = first.kind === 'heading' ? first.headingName : first.kind === 'tab' ? first.tabName : first.text;
  return (name ?? '').replace(/^◆+/, '').trim();
}
