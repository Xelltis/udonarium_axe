import { parseChatRichText } from '@axe/domain/chat/chat-rich-text';
import { decorationOfMarks, docOfLines, textOfDoc } from '@axe/features/chat/chat-editor/chat-rich-convert';
import { CHAT_CHIP, CHAT_MARK, CHAT_RICH_EXTENSIONS } from '@axe/features/chat/chat-editor/chat-rich-schema';
import { getSchema } from '@tiptap/core';

describe('chat-rich-convert', () => {
  const schema = getSchema(CHAT_RICH_EXTENSIONS);
  const docOf = (text: string, mode: 'chat' | 'palette' = 'chat') =>
    docOfLines(schema, parseChatRichText(text, { mode, cutInNames: new Set(['爆発']) }).lines);

  it.each(['', '2d6+{筋力} **攻撃**', '[赤]a\nb[/赤]', '|漢字《かんじ》《爆炎》 @笑顔', '行くぞ 爆発', '> q\n\n  x  '])(
    'writes a document read from a text back as that text: %j',
    (text) => {
      expect(textOfDoc(docOf(text), 'ja', 'chat').text).toBe(text);
    }
  );

  it('holds decorations as marks and syntax shown whole as chips', () => {
    const doc = docOf('**強く** {HP} |漢字《かんじ》');
    const paragraph = doc.child(0);
    expect(paragraph.child(0).text).toBe('強く');
    expect(decorationOfMarks(paragraph.child(0).marks)).toMatchObject({ bold: true });
    expect(paragraph.child(0).marks.map((mark) => mark.type.name)).toEqual([CHAT_MARK.bold]);
    expect([paragraph.child(2).type.name, paragraph.child(4).type.name]).toEqual([CHAT_CHIP.reference, CHAT_CHIP.ruby]);
  });

  it('writes an edited document the canonical way', () => {
    const doc = schema.nodes['doc'].create(null, [
      schema.nodes['paragraph'].create(null, [
        schema.text('普通 '),
        schema.text('赤字', [schema.marks[CHAT_MARK.color].create({ value: '#e5484d' })]),
      ]),
    ]);
    expect(textOfDoc(doc, 'ja', 'chat').text).toBe('普通 [赤]赤字[/赤]');
    expect(textOfDoc(doc, 'en', 'chat').text).toBe('普通 [red]赤字[/red]');
  });

  it('maps places between the document and the text', () => {
    const doc = docOf('**ab**{HP}c\nd');
    const written = textOfDoc(doc, 'ja', 'chat');
    expect(written.toPos(3)).toBe(2);
    expect(written.toOffset(3, -1)).toBe(4);
    expect(written.toOffset(3, 1)).toBe(6);
    expect(written.toPos(12)).toBe(doc.child(0).nodeSize + 1);
    expect(written.toOffset(doc.child(0).nodeSize + 2)).toBe(13);
  });

  it('writes a palette a line at a time, keeping its variables and tabs', () => {
    const text = '//HP=**1**\n◆◆戦闘\n2d6 {HP}\n**殴る**';
    const written = textOfDoc(docOf(text, 'palette'), 'ja', 'palette');
    expect(written.text).toBe(text);
    expect(written.toOffset(written.toPos(text.indexOf('殴'), 1), 1)).toBe(text.indexOf('殴'));
  });
});
