import {
  cargoRoomOf,
  freeSeats,
  frontRefusal,
  seatHeightOf,
  seatOf,
  steers,
  writtenSeat,
} from '@axe/domain/tabletop/ride/ride-rules';

describe('riding a mount', () => {
  it('reads a seat as it is written down, the front for anything else', () => {
    expect(seatOf('')).toBe('rider');
    expect(seatOf('passenger')).toBe('passenger');
    expect(seatOf('cargo')).toBe('cargo');
    expect(seatOf('roof')).toBe('rider');
    expect(writtenSeat('rider')).toBe('');
    expect(writtenSeat('cargo')).toBe('cargo');
  });

  it('frees the front, a second rider behind one in front, and room for loads', () => {
    expect(freeSeats({ passenger: true, cargo: 0 }, [])).toEqual(['rider']);
    expect(freeSeats({ passenger: true, cargo: 0 }, ['rider'])).toEqual(['passenger']);
    expect(freeSeats({ passenger: true, cargo: 0 }, ['rider', 'passenger'])).toEqual([]);
    expect(freeSeats({ passenger: false, cargo: 0 }, ['rider'])).toEqual([]);
  });

  it('takes no second rider on a mount that carries loads, and as many loads as it may', () => {
    expect(freeSeats({ passenger: true, cargo: 2 }, ['rider'])).toEqual(['cargo']);
    expect(freeSeats({ passenger: true, cargo: 2 }, ['rider', 'cargo', 'cargo'])).toEqual([]);
    expect(freeSeats({ passenger: false, cargo: 1 }, [])).toEqual(['rider', 'cargo']);
  });

  it('reads how many a mount carries and how high its rider stands, nothing for what cannot be read', () => {
    expect(cargoRoomOf('3')).toBe(3);
    expect(cargoRoomOf('2.7')).toBe(2);
    expect(cargoRoomOf('')).toBe(0);
    expect(cargoRoomOf('-1')).toBe(0);
    expect(cargoRoomOf('many')).toBe(0);
    expect(seatHeightOf('', 2)).toBe(1);
    expect(seatHeightOf('1.5', 2)).toBe(1.5);
    expect(seatHeightOf('0', 2)).toBe(0);
    expect(seatHeightOf('x', 3)).toBe(1.5);
  });

  it('lets anybody steer where the room names no skill for it, and only the skilled where it does', () => {
    expect(steers(false, null)).toBe(true);
    expect(steers(true, null)).toBe(false);
    expect(steers(true, 0)).toBe(false);
    expect(steers(true, 2)).toBe(true);
  });

  it('keeps one who cannot steer to mounts anybody may ride, and the skilled to mounts within their skill', () => {
    const base = { skillNamed: true, skill: null, anyone: false, required: null };

    expect(frontRefusal(base)).toBe('needsSkill');
    expect(frontRefusal({ ...base, anyone: true })).toBeNull();
    expect(frontRefusal({ ...base, skill: 3, required: 4 })).toBe('tooHard');
    expect(frontRefusal({ ...base, skill: 4, required: 4 })).toBeNull();
    expect(frontRefusal({ ...base, skillNamed: false })).toBeNull();
  });
});
