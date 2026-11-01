import { TestBed } from '@angular/core/testing';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';

describe('TransientPlacementService', () => {
  let service: TransientPlacementService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TransientPlacementService);
  });

  it('shows a piece at the place it is given until it is let go of', () => {
    service.place('piece', { surface: 'floor', x: 10, y: 20, z: 0 });
    expect(service.placementOf('piece')).toEqual({ surface: 'floor', x: 10, y: 20, z: 0 });

    service.release('piece');
    expect(service.placementOf('piece')).toBeNull();
  });

  it('counts a change only when a place moves or is let go of', () => {
    const start = service.version();
    service.place('piece', { surface: 'floor', x: 10, y: 20, z: 0 });
    service.place('piece', { surface: 'floor', x: 10, y: 20, z: 0 });
    expect(service.version()).toBe(start + 1);

    service.place('piece', { surface: 'north-wall', x: 10, y: 20, z: 0 });
    service.release('piece');
    service.release('piece');
    expect(service.version()).toBe(start + 3);
  });

  it('shows the outline of where a dragged piece would land, and takes it away', () => {
    const outline = { surface: 'a-board', x: 5, y: 6, width: 50, height: 50 };
    service.showDropPreview(outline);
    expect(service.dropPreview()).toEqual(outline);

    service.showDropPreview({ ...outline });
    expect(service.dropPreview()).toBe(outline);

    service.showDropPreview(null);
    expect(service.dropPreview()).toBeNull();
  });
});
