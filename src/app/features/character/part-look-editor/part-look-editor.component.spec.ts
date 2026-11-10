import { TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { maskCovers, partLayerOf, partMaskOf, writePartLayer } from '@axe/domain/character/part-look';
import { PartLookEditorComponent } from '@axe/features/character/part-look-editor/part-look-editor.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('PartLookEditorComponent', () => {
  let dragon: GameCharacter;
  let head: GameCharacter;
  let tail: GameCharacter;

  function picture(identifier: string): string {
    ImageStorage.instance.add({
      identifier,
      name: `${identifier}.png`,
      type: 'image/png',
      blob: null,
      url: `blob:${identifier}`,
      thumbnail: { type: '', blob: null, url: '' },
    });
    return identifier;
  }

  function partOf(name: string): GameCharacter {
    const part = GameCharacter.create(name, 1, picture(name));
    part.setLocation('table');
    part.ridingOn = dragon.identifier;
    part.rideSeat = 'part';
    return part;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PartLookEditorComponent], providers: [...TEST_PROVIDERS] });
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(true);
    dragon = GameCharacter.create('ドラゴン', 2, picture('dragon'));
    dragon.setLocation('table');
    head = partOf('head');
    tail = partOf('tail');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    for (const identifier of ['dragon', 'head', 'tail']) ImageStorage.instance.delete(identifier);
  });

  function open(part = '') {
    const fixture = TestBed.createComponent(PartLookEditorComponent);
    fixture.componentInstance.bodyIdentifier.set(dragon.identifier);
    if (part) fixture.componentInstance.partIdentifier.set(part);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const stage = root.querySelector<HTMLElement>('[data-testid="part-look-stage"]')!;
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
    } as DOMRect);
    const changed = () => {
      for (const piece of [dragon, head, tail]) TestBed.inject(ObjectChangeService).notifyChanged(piece.identifier);
      fixture.detectChanges();
    };
    return { fixture, root, changed };
  }

  function pointer(type: string, x: number, y: number): PointerEvent {
    return new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 });
  }

  it('lists the body’s parts and lays the one chosen over the body’s picture, sized and set forward or back', () => {
    const { root, changed } = open(tail.identifier);

    expect([...root.querySelectorAll('[data-testid="part-look-part"]')].map((one) => one.textContent?.trim())).toEqual([
      'head',
      'tail',
    ]);
    root.querySelector<HTMLButtonElement>('[data-testid="part-look-lay"]')!.click();
    expect(partLayerOf(tail.partLayer)).toEqual({ x: 0.5, y: 0.5, width: 0.5, order: 1 });
    expect(head.partLayer).toBe('');
    changed();

    const size = root.querySelector<HTMLInputElement>('[data-testid="part-look-size"]')!;
    size.value = '0.25';
    size.dispatchEvent(new Event('change'));
    changed();
    root.querySelector<HTMLButtonElement>('[data-testid="part-look-back"]')!.click();
    expect(partLayerOf(tail.partLayer)).toEqual({ x: 0.5, y: 0.5, width: 0.25, order: -1 });
  });

  it('moves the chosen part’s picture where it is dragged, keeping it as it is let go of', () => {
    tail.partLayer = writePartLayer({ x: 0.5, y: 0.5, width: 0.2, order: 1 });
    const { root } = open(tail.identifier);
    const layer = root.querySelector<HTMLElement>('[data-testid="part-look-layer"]')!;

    layer.dispatchEvent(pointer('pointerdown', 100, 50));
    layer.dispatchEvent(pointer('pointermove', 140, 30));
    expect(partLayerOf(tail.partLayer)?.x).toBe(0.5);
    layer.dispatchEvent(pointer('pointerup', 140, 30));

    expect(partLayerOf(tail.partLayer)).toMatchObject({ x: 0.7, y: 0.3 });
  });

  it('paints the chosen part’s piece of the body’s picture, and wipes it off', () => {
    const { root, fixture } = open(head.identifier);
    root.querySelector<HTMLButtonElement>('[data-testid="part-look-mode-paint"]')!.click();
    fixture.detectChanges();
    const canvas = root.querySelector<HTMLCanvasElement>('[data-testid="part-look-paint-layer"]')!;

    canvas.dispatchEvent(pointer('pointerdown', 50, 50));
    canvas.dispatchEvent(pointer('pointermove', 60, 50));
    canvas.dispatchEvent(pointer('pointerup', 60, 50));
    const painted = partMaskOf(head.partMask)!;
    expect(maskCovers(painted, 0.25, 0.5)).toBe(true);
    expect(maskCovers(painted, 0.9, 0.5)).toBe(false);

    root.querySelector<HTMLButtonElement>('[data-testid="part-look-clear"]')!.click();
    expect(head.partMask).toBe('');
  });
});
