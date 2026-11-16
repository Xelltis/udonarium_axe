import { letGoOfWebglRenderer } from '@axe/infrastructure/three-kit/webgl-renderer';

describe('letGoOfWebglRenderer', () => {
  it('loses the drawing once the renderer has let go of what it built', () => {
    const order: string[] = [];
    const renderer = {
      dispose: () => order.push('disposed'),
      forceContextLoss: () => order.push('lost'),
    };

    letGoOfWebglRenderer(renderer);

    expect(order).toEqual(['disposed', 'lost']);
  });
});
