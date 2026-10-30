import { TextareaChatField } from '@axe/features/chat/chat-input/chat-text-field';

describe('TextareaChatField', () => {
  it('puts a portrait picked in place of the one the line already ends with', () => {
    const box = document.createElement('textarea');
    box.value = 'hello @hide';
    const field = new TextareaChatField(box);

    field.insertChip({ kind: 'portrait', raw: '@face', command: { type: 'name', name: 'face' } }, 'end');

    expect(field.text()).toBe('hello @face');
  });
});
