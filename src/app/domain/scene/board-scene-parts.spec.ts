import { BoardScene } from '@axe/domain/scene/board-scene';
import {
  BOARD_SCENE_PARTS,
  captureTableLook,
  sceneBgmOf,
  sceneBgsOf,
  scenePartsOf,
  scenePeriodOf,
  sceneTableWrites,
  sceneWeatherOf,
} from '@axe/domain/scene/board-scene-parts';
import { FilterType, GameTable } from '@axe/domain/tabletop/game-table';

describe('the parts of a scene', () => {
  function scene(fields: Partial<BoardScene> = {}): BoardScene {
    return Object.assign(new BoardScene(), fields);
  }

  function table(fields: Partial<GameTable> = {}): GameTable {
    return Object.assign(new GameTable(), fields);
  }

  describe('which a scene changes', () => {
    it('changes nothing while every part is left empty, as from a peer that never sent them', () => {
      expect(scenePartsOf(scene())).toEqual([]);
      expect(scenePartsOf(Object.assign(new BoardScene(), { bgm: undefined, clockPeriod: undefined }))).toEqual([]);
    });

    it('lists each part it changes, in the order they are put on', () => {
      const every = scene({
        tableName: '村',
        floorImageIdentifier: 'none',
        backgroundFilter: 'black',
        wallsShown: '{"north":true}',
        foregroundImageIdentifier: 'mist',
        weather: '{"kind":"rain"}',
        darkness: 'on',
        fog: 'off',
        bgm: 'stop',
        bgs: 'stop',
        cutInIdentifiers: 'cut-1',
        clockPeriod: '0',
        text: '夜が来た',
        fade: 'true',
      });

      expect(scenePartsOf(every)).toEqual([...BOARD_SCENE_PARTS]);
    });

    it('reads the first part of the day as a part of the day, and an empty one as leaving the clock', () => {
      expect(scenePeriodOf('0')).toBe(0);
      expect(scenePeriodOf('3')).toBe(3);
      expect(scenePeriodOf('')).toBeNull();
      expect(scenePeriodOf(undefined)).toBeNull();
      expect(scenePeriodOf('-1')).toBeNull();
    });

    it('reads music that names nothing to play as leaving the music', () => {
      expect(sceneBgmOf(scene({ bgm: 'track' }))).toBeNull();
      expect(sceneBgmOf(scene({ bgm: 'track', bgmIdentifier: 'theme' }))).toEqual({
        mode: 'track',
        identifier: 'theme',
      });
      expect(sceneBgmOf(scene({ bgm: 'playlist', bgmPlaylistName: '戦闘' }))).toEqual({
        mode: 'playlist',
        identifier: '',
        name: '戦闘',
      });
      expect(sceneBgmOf(scene({ bgm: 'loud' }))).toBeNull();
    });

    it('counts the music as changed once a way of putting it on is chosen, a track still to be picked included', () => {
      expect(scenePartsOf(scene({ bgm: 'track' }))).toEqual(['bgm']);
      expect(scenePartsOf(scene({ bgm: 'playlist' }))).toEqual(['bgm']);
      expect(scenePartsOf(scene({ bgm: 'loud' }))).toEqual([]);
    });

    it('reads the background sounds it leaves playing', () => {
      expect(sceneBgsOf(scene({ bgs: 'replace', bgsIdentifiers: 'rain, fire,rain' }))).toEqual({
        mode: 'replace',
        identifiers: ['rain', 'fire'],
      });
      expect(sceneBgsOf(scene({ bgs: 'replace' }))).toEqual({ mode: 'replace', identifiers: [] });
      expect(sceneBgsOf(scene())).toBeNull();
    });

    it('reads weather it cannot make out as leaving the sky alone', () => {
      expect(sceneWeatherOf('not json')).toBeNull();
      expect(sceneWeatherOf('[]')).toBeNull();
      expect(sceneWeatherOf('{"kind":"snow","density":2}')).toEqual({ kind: 'snow', color: '', density: 1 });
    });
  });

  describe('what putting one on writes to a table', () => {
    it('writes nothing for a scene that changes nothing', () => {
      expect(sceneTableWrites(scene(), table({ imageIdentifier: 'day' }))).toEqual({});
    });

    it('writes only the fields that differ', () => {
      const writes = sceneTableWrites(
        scene({ floorImageIdentifier: 'night', backgroundImageIdentifier: 'sky', darkness: 'on' }),
        table({ imageIdentifier: 'day', backgroundImageIdentifier: 'sky', darknessEnabled: false })
      );

      expect(writes).toEqual({ imageIdentifier: 'night', darknessEnabled: true });
    });

    it('takes a picture away where the scene says none, and leaves a table that has none alone', () => {
      expect(sceneTableWrites(scene({ floorImageIdentifier: 'none' }), table({ imageIdentifier: 'day' }))).toEqual({
        imageIdentifier: 'null',
      });
      expect(
        sceneTableWrites(scene({ floorImageIdentifier: 'none' }), table({ imageIdentifier: 'imageIdentifier' }))
      ).toEqual({});
      expect(
        sceneTableWrites(scene({ foregroundImageIdentifier: 'none' }), table({ foregroundImageIdentifier: 'mist' }))
      ).toEqual({ foregroundImageIdentifier: '' });
    });

    it('stands and takes down the walls it names, leaving the others', () => {
      const writes = sceneTableWrites(
        scene({ wallsShown: '{"north":true,"west":false}', eastWallImageIdentifier: 'door' }),
        table({ showNorthWall: false, showWestWall: true, showEastWall: true })
      );

      expect(writes).toEqual({ showNorthWall: true, showWestWall: false, eastWallImageIdentifier: 'door' });
    });

    it('lays a picture in front as opaque and fitted as the scene says, or as the table had it', () => {
      expect(
        sceneTableWrites(
          scene({ foregroundImageIdentifier: 'mist', foregroundOpacity: '0.5', foregroundFit: 'contain' }),
          table()
        )
      ).toEqual({ foregroundImageIdentifier: 'mist', foregroundOpacity: 0.5, foregroundFit: 'contain' });
      expect(sceneTableWrites(scene({ foregroundImageIdentifier: 'mist' }), table({ foregroundOpacity: 0.3 }))).toEqual(
        {
          foregroundImageIdentifier: 'mist',
        }
      );
    });

    it('clears the sky for a scene whose weather has no kind', () => {
      expect(
        sceneTableWrites(scene({ weather: '{"kind":"","color":"","density":0.5}' }), table({ weatherKind: 'rain' }))
      ).toEqual({ weatherKind: '', weatherDensity: 0.5 });
    });
  });

  describe('the look of a table caught in a scene', () => {
    it('puts another table back to look just the same, a picture it lacks taken away', () => {
      const shown = table({
        imageIdentifier: 'night',
        backgroundImageIdentifier: 'imageIdentifier',
        backgroundFilterType: FilterType.BLACK,
        northWallImageIdentifier: 'gate',
        showNorthWall: true,
        foregroundImageIdentifier: 'mist',
        foregroundOpacity: 0.4,
        foregroundFit: 'fill',
        weatherKind: 'rain',
        weatherColor: '#88aaff',
        weatherDensity: 0.7,
        darknessEnabled: true,
        fogEnabled: false,
      });
      const other = table({
        imageIdentifier: 'day',
        backgroundImageIdentifier: 'sky',
        showNorthWall: false,
        showEastWall: true,
        darknessEnabled: false,
        fogEnabled: true,
      });

      Object.assign(other, sceneTableWrites(captureTableLook(shown), other));

      expect(other.imageIdentifier).toBe('night');
      expect(other.backgroundImageIdentifier).toBe('null');
      expect(other.backgroundFilterType).toBe(FilterType.BLACK);
      expect(other.northWallImageIdentifier).toBe('gate');
      expect([other.showNorthWall, other.showEastWall]).toEqual([true, false]);
      expect([other.foregroundImageIdentifier, other.foregroundOpacity, other.foregroundFit]).toEqual([
        'mist',
        0.4,
        'fill',
      ]);
      expect([other.weatherKind, other.weatherColor, other.weatherDensity]).toEqual(['rain', '#88aaff', 0.7]);
      expect([other.darknessEnabled, other.fogEnabled]).toEqual([true, false]);
    });

    it('takes the picture in front away from a table it is put on, when the table caught had none', () => {
      const other = table({ foregroundImageIdentifier: 'mist' });

      Object.assign(other, sceneTableWrites(captureTableLook(table()), other));

      expect(other.foregroundImageIdentifier).toBe('');
    });
  });
});
