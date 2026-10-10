import { TranslateFn } from '@axe/application/i18n/translate.token';
import { FileTooLarge } from '@axe/core/event/domain-events';

const MEGA_BYTE = 1024 * 1024;

/**
 * What to tell the reader about the files a load left out for being too large: the first one by
 * name, how many more there were, and how large each kind among them may be.
 */
export function filesTooLargeMessage(files: readonly FileTooLarge[], t: TranslateFn): string {
  const [first] = files;
  if (!first) return '';
  const limits = new Map<FileTooLarge['kind'], number>();
  for (const file of files) if (!limits.has(file.kind)) limits.set(file.kind, file.limitBytes);
  const said = [...limits].map(([kind, bytes]) =>
    t(`feature.file.tooLarge.${kind}Limit`, { mb: Math.round((bytes / MEGA_BYTE) * 10) / 10 })
  );
  const params = { name: first.name, count: files.length - 1, limits: said.join(t('feature.file.tooLarge.separator')) };
  return files.length === 1 ? t('feature.file.tooLarge.one', params) : t('feature.file.tooLarge.many', params);
}
