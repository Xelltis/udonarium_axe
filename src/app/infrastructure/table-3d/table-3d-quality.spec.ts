import { TABLE_3D_QUALITY, table3dQualityOf } from '@axe/infrastructure/table-3d/table-3d-quality';

describe('the qualities the table is drawn at', () => {
  it('draws at the quality chosen, whatever the screen', () => {
    expect(table3dQualityOf('high', true)).toBe('high');
    expect(table3dQualityOf('light', false)).toBe('light');
  });

  it('left to the screen, draws lightly where the seat asked for it, high where a graphics card draws, and at standard elsewhere', () => {
    expect(table3dQualityOf('auto', true)).toBe('light');
    expect(table3dQualityOf('auto', true, true)).toBe('light');
    expect(table3dQualityOf('auto', false, true)).toBe('high');
    expect(table3dQualityOf('auto', false)).toBe('standard');
  });

  it('shades no corners at any quality, as the shading darkened a flat board from a distance on', () => {
    for (const plan of Object.values(TABLE_3D_QUALITY)) expect(plan.ambientOcclusion).toBe(false);
  });

  it('casts fewer shadows the lighter it draws', () => {
    expect(TABLE_3D_QUALITY.high.shadowedLights).toBeGreaterThan(TABLE_3D_QUALITY.standard.shadowedLights);
    expect(TABLE_3D_QUALITY.light.shadowedLights).toBe(0);
  });
});
