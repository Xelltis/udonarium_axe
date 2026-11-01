import { ScenarioText, scenarioTextSpeakerOf } from '@axe/domain/scenario-text/scenario-text';

describe('ScenarioText', () => {
  it('keeps the stamps put in its words beside them, each once, for a save to find their pictures', () => {
    const text = new ScenarioText();
    text.initialize();

    text.write('地図［地図:image:map-1］と鍵［鍵:image:key-1］、もう一度［地図:image:map-1］');

    expect(text.stamps).toBe('image:map-1 image:key-1');
    text.write('何もない');
    expect(text.stamps).toBe('');
  });

  it('says a text under its title where it names no way, or one this version does not know', () => {
    expect(scenarioTextSpeakerOf('')).toBe('title');
    expect(scenarioTextSpeakerOf(undefined)).toBe('title');
    expect(scenarioTextSpeakerOf('narrator')).toBe('title');
    expect(scenarioTextSpeakerOf('system')).toBe('system');
  });

  it('lists the texts in their order, after the last when one is added', () => {
    const later = new ScenarioText();
    later.order = 5;
    later.initialize();
    const first = new ScenarioText();
    first.order = 1;
    first.initialize();

    expect(ScenarioText.all()).toEqual([first, later]);
    expect(ScenarioText.nextOrder()).toBe(6);
  });

  it('goes into a save with its identifier and the stamps it holds', () => {
    const text = new ScenarioText('handout-1');
    text.initialize();
    text.write('［地図:image:map-1］');

    const xml = text.toXml();

    expect(xml).toContain('identifier="handout-1"');
    expect(xml).toContain('stamps="image:map-1"');
  });
});
