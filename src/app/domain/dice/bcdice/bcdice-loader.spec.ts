import {
  BCDICE_GAME_SYSTEM_IMPORTERS,
  BCDICE_I18N_IMPORTERS,
} from '@axe/domain/dice/bcdice/bcdice-importers.generated';
import BCDiceLoader from '@axe/domain/dice/bcdice/bcdice-loader';
import gameSystemList from 'bcdice/lib/bcdice/game_system_list.json';
import i18nList from 'bcdice/lib/bcdice/i18n_list.json';

describe('BCDiceLoader', () => {
  it('loads one system on its own and hands its class back', async () => {
    const system = await new BCDiceLoader().dynamicLoad('Cthulhu7th');

    expect(system.ID).toBe('Cthulhu7th');
  });

  it('rolls with a system it loaded on its own', async () => {
    const system = await new BCDiceLoader().dynamicLoad('Cthulhu7th');

    expect(system.eval('CC<=50')?.text).toContain('1D100<=50');
  });

  it('loads a system whose id is not the name of its class', async () => {
    const system = await new BCDiceLoader().dynamicLoad('SwordWorld2.5');

    expect(system.ID).toBe('SwordWorld2.5');
  });

  it('loads the translations a system needs for its help', async () => {
    const system = await new BCDiceLoader().dynamicLoad('Amadeus');

    expect(system.HELP_MESSAGE.length).toBeGreaterThan(0);
  });

  it('refuses a system it has no chunk for', async () => {
    await expect(new BCDiceLoader().dynamicImport('NoSuchGameSystem')).rejects.toThrow();
  });
});

describe('the importers written out for BCDice', () => {
  it('cover every game system BCDice lists', () => {
    const listed = [...new Set(gameSystemList.gameSystems.map((info) => info.className))].sort();

    expect(Object.keys(BCDICE_GAME_SYSTEM_IMPORTERS).sort()).toEqual(listed);
  });

  it('cover every translation BCDice lists', () => {
    const listed = i18nList.i18nList
      .flatMap(({ baseClassName, locales }) => locales.map((locale) => `${baseClassName}.${locale}`))
      .sort();

    expect(Object.keys(BCDICE_I18N_IMPORTERS).sort()).toEqual(listed);
  });
});
