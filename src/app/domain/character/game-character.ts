import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectStore } from '@axe/core/sync/object-store';
import { generateUuid } from '@axe/core/util/uuid';
import { BuffManager } from '@axe/domain/character/buff-manager';
import { CharacterTemplateFactory } from '@axe/domain/character/character-template-factory';
import { StatusAccessor } from '@axe/domain/character/status-accessor';
import { BuffPalette, ChatPalette } from '@axe/domain/chat/chat-palette';
import { DEFAULT_CHAT_BUBBLE_CODES, DEFAULT_CHAT_COLOR_CODES } from '@axe/domain/chat/constants';
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
  @SyncVar() disclosureMode: string = '';
  @SyncVar() disclosureUserIds: string[] = [];
  @SyncVar() overViewWidth: number = 270;
  @SyncVar() overViewMaxHeight: number = 250;

  @SyncVar() specifyKomaImageFlag: boolean = false;
  @SyncVar('komaImageHeignt') komaImageHeight: number = 100;

  @SyncVar() chatColorCode: string[] = [...DEFAULT_CHAT_COLOR_CODES];
  /** The bubble each colour is shown on, per theme. An empty entry is worked out instead. */
  @SyncVar() chatBubbleLight: string[] = [...DEFAULT_CHAT_BUBBLE_CODES];
  @SyncVar() chatBubbleDark: string[] = [...DEFAULT_CHAT_BUBBLE_CODES];
  @SyncVar() overViewDataTags: string[] = [];
  @SyncVar() syncDummyCounter: number = 0;

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
  get targeted(): boolean {
    return this._targeted;
  }
  set targeted(flag: boolean) {
    this._targeted = flag;
  }

  private _selectedPortraitIndex: number = 0;
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

  private getIconNumElement(): DataElement | null {
    if (!this.detailDataElement) return null;
    const iconNum = this.detailDataElement.getFirstElementByName('ICON');
    if (!iconNum || !iconNum.isNumberResource) return null;
    return iconNum;
  }

  override get imageFile(): ImageFile {
    if (!this.imageDataElement) return ImageFile.Empty;

    const iconNum = this.getIconNumElement();
    if (!iconNum) {
      const image = this.imageDataElement.getFirstElementByName('imageIdentifier');
      if (!image) return ImageFile.Empty;
      const file = ImageStorage.instance.get(image.value as string);
      return file ? file : ImageFile.Empty;
    } else {
      let n = iconNum.currentValue as number;
      if (n > this.imageDataElement.children.length - 1) n = this.imageDataElement.children.length - 1;
      if (n < 0 || this.imageDataElement.children.length === 0) return ImageFile.Empty;
      const image = this.imageDataElement.children[n];
      const file = ImageStorage.instance.get(image.value as string);
      return file ? file : ImageFile.Empty;
    }
  }

  get size(): number {
    return this.getCommonValue('size', 1);
  }
  set size(value: number) {
    this.setCommonValue('size', value);
  }
  get chatPalette(): ChatPalette | null {
    for (const child of this.children) {
      if (child instanceof ChatPalette) return child;
    }
    return null;
  }

  get remoteController(): BuffPalette | null {
    for (const child of this.children) {
      if (child instanceof BuffPalette) {
        return child;
      }
    }
    return null;
  }

  get buffDataElement(): DataElement | null {
    return this.getElement('buff');
  }

  toTopmost() {
    moveToTopmost(this);
  }

  toBottommost() {
    moveToBottommost(this);
  }

  addBuffDataElement() {
    if (!this.buffDataElement) {
      this.rootDataElement?.appendChild(DataElement.create('buff', '', {}, `buff_${this.identifier}`));
      this._buffs = null;
    }
  }

  private _buffs: BuffManager | null = null;
  private _status: StatusAccessor | null = null;

  get buffs(): BuffManager {
    return (this._buffs ??= new BuffManager(
      this.buffDataElement ?? null,
      () => ({ identifier: this.identifier, name: this.name }),
      () => this.status
    ));
  }

  get status(): StatusAccessor {
    return (this._status ??= new StatusAccessor(this.detailDataElement ?? null, () => this.name));
  }

  static create(name: string, size: number, imageIdentifier: string): GameCharacter {
    const gameCharacter: GameCharacter = new GameCharacter();
    gameCharacter.createDataElements();
    gameCharacter.initialize();

    CharacterTemplateFactory.createDefault(gameCharacter, name, size, imageIdentifier);

    return gameCharacter;
  }

  override parseInnerXml(element: Element): void {
    super.parseInnerXml(element);
    this.normalizeDetailDataElementHierarchy();
    this.convertLegacyCheckTableData();
    this.migrateOverviewDataTagsToElementAttributes();
  }

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
