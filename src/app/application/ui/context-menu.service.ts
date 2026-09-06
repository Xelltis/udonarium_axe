import { ComponentRef, inject, Injectable, ViewContainerRef } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { PanelRotationDegrees } from '@axe/application/ui/panel.service';
import { DEFAULT_RADIAL_MENU_ROTATION_SPEED } from '@axe/domain/tabletop/radial-menu';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export interface ContextMenuPoint {
  x: number;
  y: number;
}

export enum ContextMenuType {
  ACTION = 'action',
  SEPARATOR = 'separator',
}

export const ContextMenuSeparator: ContextMenuAction = {
  name: '',
  enabled: true,
  type: ContextMenuType.SEPARATOR,
};

export interface ContextMenuAction {
  name: string;
  action?: () => void;
  enabled?: boolean;
  altitudeHandle?: TabletopObject;
  type?: ContextMenuType;
  subActions?: ContextMenuAction[];
}

export interface ContextMenuRadialGroup {
  name: string;
  icon: string;
  actions: ContextMenuAction[];
}

export interface ContextMenuOpenOptions {
  layer?: number;
  parentViewContainerRef?: ViewContainerRef;
}

type ContextMenuComponentClass = { new (...args: unknown[]): unknown };

@Injectable()
export class ContextMenuService {
  static defaultParentViewContainerRef: ViewContainerRef;
  static ContextMenuComponentClass: ContextMenuComponentClass = null!;
  static FourWayRadialMenuComponentClass: ContextMenuComponentClass = null!;
  private readonly rolePermission = inject(RolePermissionService);
  private panelComponentRef: ComponentRef<unknown> | null = null;

  title: string = '';
  actions: ContextMenuAction[] = [];
  radialGroups: ContextMenuRadialGroup[] = [];
  radialMenuEnabled: boolean = false;
  radialMenuRotationSpeed: number = DEFAULT_RADIAL_MENU_ROTATION_SPEED;
  radialMenuClearanceRadius: number = 0;
  radialMenuOcclusionHalfExtent: number = 0;
  rotationDegrees: PanelRotationDegrees = 0;
  /** Multiplies the menu text size. One keeps the sizes a menu outside the 2D table uses. */
  fontScale: number = 1;
  position: ContextMenuPoint = { x: 0, y: 0 };
  radialAnchorPosition: ContextMenuPoint | null = null;
  /** Where the menu sits, for a caller that lives above where menus usually go. Zero is the usual place. */
  layer: number = 0;

  get isShow(): boolean {
    return this.panelComponentRef !== null;
  }

  open(position: ContextMenuPoint, actions: ContextMenuAction[], title?: string, options?: ContextMenuOpenOptions) {
    this.openComponent(
      ContextMenuService.ContextMenuComponentClass,
      position,
      actions,
      [],
      0,
      true,
      DEFAULT_RADIAL_MENU_ROTATION_SPEED,
      1,
      0,
      0,
      undefined,
      title,
      options?.parentViewContainerRef,
      options?.layer ?? 0
    );
  }

  openDirectional(
    position: ContextMenuPoint,
    actions: ContextMenuAction[],
    rotationDegrees: PanelRotationDegrees,
    title?: string,
    parentViewContainerRef?: ViewContainerRef,
    layer = 0
  ) {
    this.openComponent(
      ContextMenuService.ContextMenuComponentClass,
      position,
      actions,
      [],
      rotationDegrees,
      true,
      DEFAULT_RADIAL_MENU_ROTATION_SPEED,
      this.fontScale,
      0,
      0,
      undefined,
      title,
      parentViewContainerRef,
      layer
    );
  }

  openRadial(
    position: ContextMenuPoint,
    actions: ContextMenuAction[],
    radialGroups: ContextMenuRadialGroup[],
    title?: string,
    radialMenuEnabled = false,
    radialMenuRotationSpeed = DEFAULT_RADIAL_MENU_ROTATION_SPEED,
    fontScale = 1,
    radialMenuClearanceRadius = 0,
    radialMenuOcclusionHalfExtent = 0,
    radialAnchorPosition?: ContextMenuPoint,
    parentViewContainerRef?: ViewContainerRef,
    layer = 0
  ) {
    this.openComponent(
      ContextMenuService.FourWayRadialMenuComponentClass,
      position,
      actions,
      radialGroups,
      0,
      radialMenuEnabled,
      radialMenuRotationSpeed,
      fontScale,
      radialMenuClearanceRadius,
      radialMenuOcclusionHalfExtent,
      radialAnchorPosition,
      title,
      parentViewContainerRef,
      layer
    );
  }

  private openComponent(
    componentClass: ContextMenuComponentClass,
    position: ContextMenuPoint,
    actions: ContextMenuAction[],
    radialGroups: ContextMenuRadialGroup[],
    rotationDegrees: PanelRotationDegrees,
    radialMenuEnabled: boolean,
    radialMenuRotationSpeed: number,
    fontScale: number,
    radialMenuClearanceRadius: number,
    radialMenuOcclusionHalfExtent: number,
    radialAnchorPosition?: ContextMenuPoint,
    title?: string,
    parentViewContainerRef?: ViewContainerRef,
    layer = 0
  ) {
    this.close();
    if (!this.rolePermission.canEditTabletop) return;

    const parent = parentViewContainerRef ?? ContextMenuService.defaultParentViewContainerRef;
    const injector = parent.injector;

    const panelComponentRef = parent.createComponent(componentClass, {
      index: parent.length,
      injector,
    });

    const childPanelService: ContextMenuService = panelComponentRef.injector.get(ContextMenuService);

    childPanelService.panelComponentRef = panelComponentRef;
    if (actions) {
      childPanelService.actions = actions;
    }
    childPanelService.radialGroups = radialGroups;
    childPanelService.radialMenuEnabled = radialMenuEnabled;
    childPanelService.radialMenuRotationSpeed = radialMenuRotationSpeed;
    childPanelService.radialMenuClearanceRadius = radialMenuClearanceRadius;
    childPanelService.radialMenuOcclusionHalfExtent = radialMenuOcclusionHalfExtent;
    childPanelService.rotationDegrees = rotationDegrees;
    childPanelService.fontScale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
    if (position) {
      childPanelService.position.x = position.x;
      childPanelService.position.y = position.y;
    }
    childPanelService.radialAnchorPosition = radialAnchorPosition
      ? { x: radialAnchorPosition.x, y: radialAnchorPosition.y }
      : null;

    childPanelService.title = title != null ? title : '';
    childPanelService.layer = layer;

    panelComponentRef.onDestroy(() => {
      childPanelService.panelComponentRef = null;
    });
  }

  close() {
    if (this.panelComponentRef) {
      this.panelComponentRef.destroy();
      this.panelComponentRef = null;
    }
  }
}
