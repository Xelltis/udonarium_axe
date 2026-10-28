import type { ChatLintAnnotation } from '@axe/application/chat/chat-lint.service';
import { scanChatSyntax } from '@axe/domain/chat-syntax/chat-syntax';
import { previewDecorations } from '@axe/features/chat/chat-editor/chat-live-preview';

describe('previewDecorations', () => {
  function draw(text: string, options: { caret?: number; focused?: boolean; annotations?: ChatLintAnnotation[] } = {}) {
    const caret = options.caret ?? text.length;
    const ranges = previewDecorations({
      scan: scanChatSyntax(text),
      annotations: options.annotations ?? [],
      selection: [{ from: caret, to: caret }],
      focused: options.focused ?? false,
    });
    const slice = (range: { from: number; to: number }) => text.slice(range.from, range.to);
    return {
      hidden: ranges.filter((range) => range.value.point && range.from < range.to).map(slice),
      marked: (className: string) =>
        ranges.filter((range) => String(range.value.spec.class ?? '').includes(className)).map(slice),
      widgets: ranges.filter((range) => range.value.spec.widget).map((range) => range.from),
    };
  }

  it('hides the marks of a decoration while the caret is away, and draws the run decorated', () => {
    const drawn = draw('とても**強く**言う');
    expect(drawn.hidden).toEqual(['**', '**']);
    expect(drawn.marked('chat-deco-bold')).toEqual(['強く']);
  });

  it('shows both marks of a pair, faded, while the caret is between them', () => {
    const drawn = draw('とても**強く**言う', { focused: true, caret: 6 });
    expect(drawn.hidden).toEqual([]);
    expect(drawn.marked('cm-chat-marker')).toEqual(['**', '**']);
  });

  it('draws a ruby in place of its notation, and the notation once the caret is on it', () => {
    expect(draw('|漢字《かんじ》だ').hidden).toEqual(['|漢字《かんじ》']);
    expect(draw('|漢字《かんじ》だ', { focused: true, caret: 2 }).marked('cm-chat-marker')).toEqual(['|', '《', '》']);
  });

  it('colours each syntax by its kind', () => {
    const drawn = draw('2d6 :HP-1 &加護/3 《爆炎》');
    expect(drawn.marked('cm-chat-roll')).toEqual(['2d6']);
    expect(drawn.marked('cm-chat-resource')).toEqual([':HP-1']);
    expect(drawn.marked('cm-chat-buff')).toEqual(['&加護/3']);
    expect(drawn.marked('cm-chat-effect')).toEqual(['《爆炎》']);
  });

  it('colours the last word only where it names a cut-in', () => {
    expect(draw('行くぞ 爆発').marked('cm-chat-cut-in')).toEqual([]);
    const annotations: ChatLintAnnotation[] = [{ kind: 'cutIn', label: '爆発', from: 4, to: 6 }];
    expect(draw('行くぞ 爆発', { annotations }).marked('cm-chat-cut-in')).toEqual(['爆発']);
  });

  it('shows what a reference is filled in with after it', () => {
    const annotations: ChatLintAnnotation[] = [{ kind: 'value', label: '13', from: 0, to: 4 }];
    expect(draw('{HP}', { annotations }).widgets).toEqual([4]);
  });
});
