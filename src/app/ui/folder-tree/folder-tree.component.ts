import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, TemplateRef } from '@angular/core';
import type { FolderNode, FolderTree } from '@axe/domain/folder/folder-tree';
import { AutoFocusDirective } from '@axe/ui/directives/auto-focus.directive';
import type { FiledThing, FolderShelf } from '@axe/ui/folder-tree/folder-shelf';
import { TranslocoModule } from '@jsverse/transloco';

/** What a row of the tree is drawn with: the thing, and how deep in the folders it stands. */
export interface FolderTreeRowContext<T> {
  readonly $implicit: T;
  readonly depth: number;
}

/**
 * Things laid out in their folders, as the inventory lays out its characters: each folder a
 * heading that folds what is in it, the folders inside first and then the things, and the things in
 * no folder last. The row of each thing is drawn by the template given. Something dragged over a
 * heading, or over what lies open under it, is dropped into that folder, which `dropped` says.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-folder-tree',
  templateUrl: './folder-tree.component.html',
  imports: [NgTemplateOutlet, AutoFocusDirective, TranslocoModule],
})
export class FolderTreeComponent<T extends FiledThing> {
  readonly tree = input.required<FolderTree<T>>();
  readonly shelf = input.required<FolderShelf<T>>();
  readonly row = input.required<TemplateRef<FolderTreeRowContext<T>>>();
  /** Whether the reader may make, rename, delete and drop into folders. */
  readonly canEdit = input(false);
  /** Whether something is being dragged that a folder could take. */
  readonly dragging = input(false);
  /** A drop on a folder, by its path; empty for the things in no folder. */
  readonly dropped = output<string>();

  protected rowContext(item: T, depth: number): FolderTreeRowContext<T> {
    return { $implicit: item, depth };
  }

  protected folderContext(node: FolderNode<T>): { $implicit: FolderNode<T> } {
    return { $implicit: node };
  }

  protected allowDrop(event: DragEvent): void {
    if (this.canEdit() && this.dragging()) event.preventDefault();
  }

  protected drop(event: DragEvent, path: string): void {
    if (!this.canEdit() || !this.dragging()) return;
    event.preventDefault();
    event.stopPropagation();
    this.dropped.emit(path);
  }

  protected readonly iconButtonClass =
    'text-ui-dim hover:bg-ui-hover hover:text-ui-accent inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm border-none bg-transparent p-0 transition-[background,color] hover:shadow-none [&_.material-icons]:text-[14px]!';
}
