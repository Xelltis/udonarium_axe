import { filesTooLargeMessage } from '@axe/features/file/files-too-large/files-too-large-message';

describe('the message for files too large to take', () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    params
      ? `${key.replace('feature.file.tooLarge.', '')}${JSON.stringify(params)}`
      : key.replace('feature.file.tooLarge.', '');
  const MB = 1024 * 1024;

  it('names the one file left out and how large its kind may be', () => {
    const message = filesTooLargeMessage([{ name: 'long.ogg', kind: 'audio', limitBytes: 10 * MB }], t);

    expect(message).toBe('one{"name":"long.ogg","count":0,"limits":"audioLimit{\\"mb\\":10}"}');
  });

  it('names the first of several, counts the rest, and gives each kind’s limit once', () => {
    const message = filesTooLargeMessage(
      [
        { name: 'long.ogg', kind: 'audio', limitBytes: 10 * MB },
        { name: 'huge.png', kind: 'image', limitBytes: 2 * MB },
        { name: 'longer.ogg', kind: 'audio', limitBytes: 10 * MB },
      ],
      t
    );

    expect(message).toBe(
      'many{"name":"long.ogg","count":2,"limits":"audioLimit{\\"mb\\":10}separatorimageLimit{\\"mb\\":2}"}'
    );
  });

  it('says nothing for no files', () => {
    expect(filesTooLargeMessage([], t)).toBe('');
  });
});
