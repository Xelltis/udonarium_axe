import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Network } from '@axe/core/index';
import {
  Disclosable,
  DisclosureMode,
  normalizeDisclosureMode,
  toggleDisclosureUserId,
} from '@axe/domain/disclosure/disclosure';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole, roleBadgeClass, roleShortLabelKey } from '@axe/domain/peer/peer-role';
import { TranslocoModule } from '@jsverse/transloco';

interface DisclosableObject extends Disclosable {
  identifier: string;
  owner?: string;
  update(): void;
}

interface OwnerCandidate {
  userId: string;
  name: string;
}

interface AudienceCandidate {
  userId: string;
  name: string;
  role: PeerRole;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'disclosure-control',
  templateUrl: './disclosure-control.component.html',
  host: { class: 'block' },
  imports: [FormsModule, TranslocoModule],
})
export class DisclosureControlComponent {
  private readonly disclosureService = inject(DisclosureService);
  private readonly objectChange = inject(ObjectChangeService);

  readonly object = input.required<DisclosableObject>();

  protected readonly modes: DisclosureMode[] = [DisclosureMode.All, DisclosureMode.Selected, DisclosureMode.GameMaster];
  protected readonly roleBadgeClass = roleBadgeClass;
  protected readonly roleShortLabelKey = roleShortLabelKey;

  readonly canEdit = computed(() => {
    const object = this.object();
    this.objectChange.trackMyCursor();
    return this.disclosureService.canEdit(object);
  });

  readonly canSetOwner = computed(() => {
    const object = this.object();
    this.objectChange.versionOf(object.identifier)();
    this.objectChange.trackMyCursor();
    return this.disclosureService.canSetOwner(object);
  });

  readonly mode = computed<DisclosureMode>(() => {
    const object = this.object();
    this.objectChange.versionOf(object.identifier)();
    return normalizeDisclosureMode(object.disclosureMode);
  });

  readonly owner = computed<string>(() => {
    const object = this.object();
    this.objectChange.versionOf(object.identifier)();
    return object.owner ?? '';
  });

  /**
   * Gives the object to the user chosen in the owner menu, or to nobody for an empty id, and shares
   * the change; ignored without permission to set the owner.
   */
  setOwner(userId: string): void {
    const object = this.object();
    if (!this.disclosureService.canSetOwner(object)) return;
    object.owner = userId;
    object.update();
  }

  /**
   * The users the owner menu offers: this user first, then every other connected user, each named
   * by their cursor or a short id.
   */
  ownerCandidates(): OwnerCandidate[] {
    const candidates: OwnerCandidate[] = [];
    const myCursor = PeerCursor.myCursor;
    if (myCursor) candidates.push({ userId: myCursor.userId, name: myCursor.name || myCursor.userId.slice(0, 6) });
    for (const context of Network.peerContexts) {
      const cursor = PeerCursor.findByPeerId(context.peerId);
      if (!cursor || cursor.isMine) continue;
      candidates.push({ userId: cursor.userId, name: cursor.name || cursor.userId.slice(0, 6) });
    }
    return candidates;
  }

  /** The translation key for a disclosure mode's button. */
  modeLabelKey(mode: DisclosureMode): string {
    switch (mode) {
      case DisclosureMode.GameMaster:
        return 'feature.disclosure.gmOnly';
      case DisclosureMode.Selected:
        return 'feature.disclosure.selected';
      default:
        return 'feature.disclosure.all';
    }
  }

  /**
   * Sets who the object is disclosed to (everyone, selected players or the game master only) and
   * shares the change; ignored without permission to edit it.
   */
  setMode(mode: DisclosureMode): void {
    const object = this.object();
    if (!this.disclosureService.canEdit(object)) return;
    object.disclosureMode = mode;
    object.update();
  }

  /**
   * Whether the object is disclosed to this user under the selected-players mode, which ticks their
   * checkbox.
   */
  isDisclosedTo(userId: string): boolean {
    this.objectChange.versionOf(this.object().identifier)();
    return this.object().disclosureUserIds.includes(userId);
  }

  /**
   * Adds a player to the object's selected audience or takes them off it, and shares the change;
   * ignored without permission to edit it.
   */
  toggleUser(userId: string): void {
    const object = this.object();
    if (!this.disclosureService.canEdit(object)) return;
    object.disclosureUserIds = toggleDisclosureUserId(object.disclosureUserIds, userId);
    object.update();
  }

  /**
   * The connected players who can be picked for the selected audience, leaving out this user and
   * game masters, who see everything anyway.
   */
  audienceCandidates(): AudienceCandidate[] {
    const candidates: AudienceCandidate[] = [];
    for (const context of Network.peerContexts) {
      const cursor = PeerCursor.findByPeerId(context.peerId);
      if (!cursor || cursor.isMine || cursor.isGameMaster) continue;
      candidates.push({ userId: cursor.userId, name: cursor.name || cursor.userId.slice(0, 6), role: cursor.role });
    }
    return candidates;
  }
}
