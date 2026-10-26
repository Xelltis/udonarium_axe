import { liftImageReferences } from '@axe/domain/chat/chat-image-references';
import { DataElement, DataElementFieldType } from '@axe/domain/data/data-element';

describe('liftImageReferences', () => {
  let root: DataElement;

  beforeEach(() => {
    root = DataElement.create('detail', '');
    const profile = DataElement.create('プロフィール', '');
    profile.appendChild(DataElement.create('立ち絵', 'portrait-id', { fieldType: DataElementFieldType.IMAGE }));
    profile.appendChild(DataElement.create('地図', 'map-id', { fieldType: DataElementFieldType.IMAGE }));
    profile.appendChild(DataElement.create('空の画像', '', { fieldType: DataElementFieldType.IMAGE }));
    profile.appendChild(DataElement.create('HP', 10));
    root.appendChild(profile);
  });

  afterEach(() => root.destroy());

  it('takes a picture field out of the words and attaches the picture', () => {
    expect(liftImageReferences('これを見て {立ち絵} どう？', root, [])).toEqual({
      text: 'これを見て どう？',
      attachmentImageIdentifiers: ['portrait-id'],
    });
  });

  it('reads full-width braces and a full-path reference', () => {
    expect(liftImageReferences('｛プロフィール/地図｝', root, []).attachmentImageIdentifiers).toEqual(['map-id']);
  });

  it('adds the pictures after those already attached, each once', () => {
    const lifted = liftImageReferences('{立ち絵}{地図}{立ち絵}', root, ['dropped-id', 'map-id']);

    expect(lifted.attachmentImageIdentifiers).toEqual(['dropped-id', 'map-id', 'portrait-id']);
  });

  it('leaves in the line a field that is not a picture, a name that is no field, and one aimed at a target', () => {
    expect(liftImageReferences('{HP} {なし} t{立ち絵}', root, [])).toEqual({
      text: '{HP} {なし} t{立ち絵}',
      attachmentImageIdentifiers: [],
    });
  });

  it('takes an empty picture field out of the words with nothing to attach', () => {
    expect(liftImageReferences('前 {空の画像} 後', root, [])).toEqual({
      text: '前 後',
      attachmentImageIdentifiers: [],
    });
  });

  it('leaves the line as it was for a speaker with no data', () => {
    expect(liftImageReferences('  {立ち絵}  ', null, ['a'])).toEqual({
      text: '  {立ち絵}  ',
      attachmentImageIdentifiers: ['a'],
    });
  });
});
