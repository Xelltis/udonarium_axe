/**
 * Fetches the picture selector, for `ModalService.openLazy`: the table and most screens are drawn
 * without it, so it is fetched only when somebody goes to choose a picture.
 */
export const loadFileSelecter = () =>
  import('@axe/ui/components/file-selecter/file-selecter.component').then((loaded) => loaded.FileSelecterComponent);
