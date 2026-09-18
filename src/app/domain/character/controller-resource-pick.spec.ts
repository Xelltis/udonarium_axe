import {
  controllerShowsResource,
  pickControllerResource,
  readControllerResourcePick,
  writeControllerResourcePick,
} from '@axe/domain/character/controller-resource-pick';

describe('controller resource pick', () => {
  describe('reading what a room holds', () => {
    it('reads a room that never picked as showing everything', () => {
      expect(readControllerResourcePick('')).toBeNull();
      expect(readControllerResourcePick(undefined)).toBeNull();
      expect(readControllerResourcePick(null)).toBeNull();
    });

    it('reads the names back in the order they were written', () => {
      expect(readControllerResourcePick('["HP","MP"]')).toEqual(['HP', 'MP']);
    });

    it('holds on to a pick of nothing, which shows nothing', () => {
      expect(readControllerResourcePick('[]')).toEqual([]);
    });

    it('reads text that is not a list of names as showing everything, rather than nothing', () => {
      expect(readControllerResourcePick('HP MP')).toBeNull();
      expect(readControllerResourcePick('{"HP":true}')).toBeNull();
      expect(readControllerResourcePick('0')).toBeNull();
    });

    it('leaves out what is not a name', () => {
      expect(readControllerResourcePick('["HP",3,null," ","MP","HP"]')).toEqual(['HP', 'MP']);
    });
  });

  describe('writing a pick', () => {
    it('writes no pick as empty text', () => {
      expect(writeControllerResourcePick(null)).toBe('');
    });

    it('comes back as it went in', () => {
      const written = writeControllerResourcePick(['HP', '敏捷度', 'MP "予備"']);

      expect(readControllerResourcePick(written)).toEqual(['HP', '敏捷度', 'MP "予備"']);
    });

    it('keeps a pick of nothing apart from no pick', () => {
      expect(readControllerResourcePick(writeControllerResourcePick([]))).toEqual([]);
    });
  });

  describe('what the remote shows', () => {
    it('shows every item where the room has not picked', () => {
      expect(controllerShowsResource(null, 'HP')).toBe(true);
    });

    it('shows only the items picked', () => {
      expect(controllerShowsResource(['HP'], 'HP')).toBe(true);
      expect(controllerShowsResource(['HP'], 'MP')).toBe(false);
      expect(controllerShowsResource([], 'HP')).toBe(false);
    });

    it('matches a name however the sheet spaces it', () => {
      expect(controllerShowsResource(['HP'], ' HP ')).toBe(true);
    });
  });

  describe('showing or hiding one item', () => {
    const offered = ['HP', 'MP', '敏捷度'];

    it('starts from everything offered when the room has not picked', () => {
      expect(pickControllerResource(null, 'MP', false, offered)).toEqual(['HP', '敏捷度']);
    });

    it('adds an item back', () => {
      expect(pickControllerResource(['HP'], 'MP', true, offered)).toEqual(['HP', 'MP']);
    });

    it('keeps a picked name no sheet carries now', () => {
      expect(pickControllerResource(['侵蝕率', 'HP'], 'HP', false, offered)).toEqual(['侵蝕率']);
    });

    it('does not pick the same item twice', () => {
      expect(pickControllerResource(['HP'], 'HP', true, offered)).toEqual(['HP']);
    });
  });
});
