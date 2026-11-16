import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { buildEffectLibraryContextMenu } from '@axe/features/effect/effect-library-panel/effect-library-context-menu';

describe('buildEffectLibraryContextMenu()', () => {
  const t = ((key: string) => key) as never;

  function makePreset(): EffectPreset {
    const preset = new EffectPreset('preset');
    preset.name = '爆炎';
    return preset;
  }

  function names(menu: ContextMenuAction[]): string[] {
    return menu.map((entry) => entry.name);
  }

  it('offers a test fire, editing, copying, handing on and deleting', () => {
    const menu = buildEffectLibraryContextMenu(
      makePreset(),
      {
        onEdit: () => undefined,
        onDuplicate: () => undefined,
        onPreview: () => undefined,
        onInsertToken: () => undefined,
        onPlaceField: () => undefined,
        onAddToHotbar: () => undefined,
        onExport: () => undefined,
        onRemove: () => undefined,
      },
      t
    );

    expect(names(menu).filter((name) => name.length > 0)).toEqual([
      'feature.effect.preview',
      'feature.effect.insertToken',
      'feature.effect.placeField',
      'feature.hotbar.menu.fillFromHere',
      'feature.effect.editPreset',
      'feature.effect.duplicatePreset',
      'feature.effect.exportPreset',
      'feature.effect.removePreset',
    ]);
  });

  it('offers a reader who may not change the table only what leaves the room as it is', () => {
    const called: string[] = [];
    const menu = buildEffectLibraryContextMenu(
      makePreset(),
      {
        onEdit: () => called.push('edit'),
        onDuplicate: () => called.push('duplicate'),
        onPreview: () => called.push('preview'),
        onInsertToken: () => called.push('insertToken'),
        onPlaceField: () => called.push('placeField'),
        onAddToHotbar: () => called.push('addToHotbar'),
        onExport: () => called.push('export'),
        onRemove: () => called.push('remove'),
      },
      t,
      false
    );

    expect(names(menu).filter((name) => name.length > 0)).toEqual([
      'feature.effect.preview',
      'feature.effect.insertToken',
      'feature.hotbar.menu.fillFromHere',
      'feature.effect.exportPreset',
    ]);
    for (const entry of menu) entry.action?.();
    expect(called).toEqual(['preview', 'insertToken', 'addToHotbar', 'export']);
  });

  it('calls only what was chosen', () => {
    const called: string[] = [];
    const menu = buildEffectLibraryContextMenu(
      makePreset(),
      {
        onEdit: () => called.push('edit'),
        onDuplicate: () => called.push('duplicate'),
        onPreview: () => called.push('preview'),
        onInsertToken: () => called.push('insertToken'),
        onPlaceField: () => called.push('placeField'),
        onAddToHotbar: () => called.push('addToHotbar'),
        onExport: () => called.push('export'),
        onRemove: () => called.push('remove'),
      },
      t
    );

    for (const entry of menu) entry.action?.();

    expect(called).toEqual([
      'preview',
      'insertToken',
      'placeField',
      'addToHotbar',
      'edit',
      'duplicate',
      'export',
      'remove',
    ]);
  });
});
