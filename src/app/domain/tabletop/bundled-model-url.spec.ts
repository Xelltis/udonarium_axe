import { bundledModelUrl } from '@axe/domain/tabletop/bundled-model-url';

describe('where a bundled model is served from', () => {
  it('finds each by its name among those of open country, furniture and doors, and towns', () => {
    expect(bundledModelUrl('tree_oak')).toBe('assets/models/nature/tree_oak.glb');
    expect(bundledModelUrl('door_saloon')).toBe('assets/models/props/door_saloon.glb');
    expect(bundledModelUrl('town_office')).toBe('assets/models/town/town_office.glb');
    expect(bundledModelUrl('nothing')).toBeNull();
  });
});
