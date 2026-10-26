import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ImageLinkList } from '@axe/domain/media/image-link-list';

/** A face of the dice the app carries, named after its file as the dice name it. */
const DICE_FACE = './assets/images/dice/6_dice/6_dice[1].png';

/** A picture held only as a link, as the sample pieces' pictures are. */
function linked(identifier: string, url: string): ImageFile {
  const context = ImageFile.createEmpty(identifier).toContext();
  context.url = url;
  return ImageStorage.instance.add(context);
}

describe('ImageLinkList', () => {
  afterEach(() => {
    const hash = 'c'.repeat(64);
    for (const identifier of ['sample-goblin', 'sample-knight', 'elsewhere', 'odd', DICE_FACE, hash]) {
      ImageStorage.instance.delete(identifier);
    }
  });

  it('writes down the pictures held only as a link to a file the app carries', () => {
    const goblin = linked('sample-goblin', './assets/images/piece_goblin.webp');
    const elsewhere = linked('elsewhere', 'https://example.com/a.png');

    const xml = ObjectSerializer.instance.toXml(ImageLinkList.create([goblin, elsewhere, goblin]));

    expect(xml).toContain('image="sample-goblin" url="./assets/images/piece_goblin.webp"');
    expect(xml.match(/<entry /g)).toHaveLength(1);
    expect(xml).not.toContain('example.com');
  });

  it('takes the links in again under the identifiers the room names them by', () => {
    const xml = ObjectSerializer.instance.toXml(
      ImageLinkList.create([linked('sample-knight', 'assets/images/piece_knight.webp')])
    );
    ImageStorage.instance.delete('sample-knight');
    expect(ImageStorage.instance.get('sample-knight')).toBeNull();

    ObjectSerializer.instance.parseXml(xml);

    expect(ImageStorage.instance.get('sample-knight')?.url).toBe('assets/images/piece_knight.webp');
  });

  it('takes in the faces of the dice the app carries, which are named with brackets', () => {
    const xml = ObjectSerializer.instance.toXml(ImageLinkList.create([linked(DICE_FACE, DICE_FACE)]));
    ImageStorage.instance.delete(DICE_FACE);

    ObjectSerializer.instance.parseXml(xml);

    expect(ImageStorage.instance.get(DICE_FACE)?.url).toBe(DICE_FACE);
  });

  it('takes no link in for a picture somebody added, named by its bytes', () => {
    const hash = 'c'.repeat(64);

    ObjectSerializer.instance.parseXml(
      `<image-link-list><entry image="${hash}" url="./assets/images/piece_goblin.webp"/></image-link-list>`
    );

    expect(ImageStorage.instance.get(hash)).toBeNull();
  });

  it('takes in nothing but a file the app carries', () => {
    ObjectSerializer.instance.parseXml(
      '<image-link-list>' +
        '<entry image="elsewhere" url="https://example.com/a.png"/>' +
        '<entry image="odd" url="./assets/../secret.png"/>' +
        '<entry url="./assets/images/piece_goblin.webp"/>' +
        '</image-link-list>'
    );

    expect(ImageStorage.instance.get('elsewhere')).toBeNull();
    expect(ImageStorage.instance.get('odd')).toBeNull();
  });
});
