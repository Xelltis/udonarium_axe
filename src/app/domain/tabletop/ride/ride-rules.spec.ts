import {
  buffNameOf,
  cargoRoomOf,
  fallDistanceM,
  fallersWhenDown,
  fallFromM,
  freeSeats,
  frontRefusal,
  frontRidersOf,
  inTheWayOf,
  rideChangeRefusal,
  rideMoveRefusal,
  roundOfMark,
  seatHeightOf,
  seatOf,
  steers,
  turnCarrierOf,
  turnMarkOf,
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

  it('has the one riding in front take the turn for the mount and the second rider, and nobody else', () => {
    const pieces = [
      { id: 'horse', ridingOn: '', rideSeat: '', mountable: true },
      { id: 'knight', ridingOn: 'horse', rideSeat: '', mountable: false },
      { id: 'squire', ridingOn: 'horse', rideSeat: 'passenger', mountable: false },
      { id: 'crate', ridingOn: 'horse', rideSeat: 'cargo', mountable: false },
      { id: 'pony', ridingOn: '', rideSeat: '', mountable: true },
      { id: 'lad', ridingOn: 'pony', rideSeat: 'passenger', mountable: false },
    ];

    expect(turnCarrierOf('horse', pieces)).toBe('knight');
    expect(turnCarrierOf('squire', pieces)).toBe('knight');
    expect(turnCarrierOf('knight', pieces)).toBe('');
    expect(turnCarrierOf('crate', pieces)).toBe('');
    expect(turnCarrierOf('pony', pieces)).toBe('');
    expect(turnCarrierOf('lad', pieces)).toBe('');
    expect(turnCarrierOf('nobody', pieces)).toBe('');
  });

  it('leaves a mount and the one behind their own turns where the one in front takes none', () => {
    const pieces = [
      { id: 'horse', ridingOn: '', rideSeat: '', mountable: true },
      { id: 'knight', ridingOn: 'horse', rideSeat: '', mountable: false, takesTurns: false },
      { id: 'squire', ridingOn: 'horse', rideSeat: 'passenger', mountable: false },
    ];

    expect(turnCarrierOf('horse', pieces)).toBe('');
    expect(turnCarrierOf('squire', pieces)).toBe('');
  });

  it('pairs each mount with the one riding it in front, and nobody behind or carried', () => {
    const pieces = [
      { id: 'horse', ridingOn: '', rideSeat: '', mountable: true },
      { id: 'squire', ridingOn: 'horse', rideSeat: 'passenger', mountable: false },
      { id: 'knight', ridingOn: 'horse', rideSeat: '', mountable: false },
      { id: 'crate', ridingOn: 'cart', rideSeat: 'cargo', mountable: false },
      { id: 'cart', ridingOn: '', rideSeat: '', mountable: true },
      { id: 'statue', ridingOn: '', rideSeat: '', mountable: false },
      { id: 'boy', ridingOn: 'statue', rideSeat: '', mountable: false },
    ];

    expect([...frontRidersOf(pieces)]).toEqual([['horse', 'knight']]);
  });

  it('marks the turn being taken by its round and piece, and nothing while nobody is up', () => {
    expect(turnMarkOf(2, 'acting', 'knight')).toBe('2:knight');
    expect(turnMarkOf(2, 'roundStart', 'knight')).toBe('');
    expect(turnMarkOf(0, 'idle', '')).toBe('');
    expect(roundOfMark('2:knight')).toBe(2);
    expect(roundOfMark('12:a:b')).toBe(12);
    expect(roundOfMark('')).toBe(0);
    expect(roundOfMark('soon:knight')).toBe(0);
  });

  it('lets a piece get on or off once a turn, and as often as it likes outside turns', () => {
    expect(rideChangeRefusal('2:knight', '2:knight')).toBe('changedThisTurn');
    expect(rideChangeRefusal('1:knight', '2:knight')).toBeNull();
    expect(rideChangeRefusal('', '')).toBeNull();
  });

  describe('setting out on a move', () => {
    const base = {
      turn: '2:knight',
      onMount: false,
      mountMovedTurn: '',
      changedTurn: '',
      leftSeat: null,
      steers: true,
    } as const;

    it('moves a mount in one turn a round, and again in that turn', () => {
      expect(rideMoveRefusal({ ...base, onMount: true, mountMovedTurn: '2:horse' })).toBe('mountMoved');
      expect(rideMoveRefusal({ ...base, onMount: true, mountMovedTurn: '2:knight' })).toBeNull();
      expect(rideMoveRefusal({ ...base, onMount: true, mountMovedTurn: '1:knight' })).toBeNull();
    });

    it('lets one that got off this turn walk where it steered or was carried and the mount has stood still', () => {
      const left = { ...base, changedTurn: '2:knight' };

      expect(rideMoveRefusal({ ...left, leftSeat: 'rider' })).toBeNull();
      expect(rideMoveRefusal({ ...left, leftSeat: 'cargo', steers: false })).toBeNull();
      expect(rideMoveRefusal({ ...left, leftSeat: 'rider', mountMovedTurn: '2:knight' })).toBe('cannotAfterLeaving');
      expect(rideMoveRefusal({ ...left, leftSeat: 'rider', steers: false })).toBe('cannotAfterLeaving');
      expect(rideMoveRefusal({ ...left, leftSeat: 'passenger' })).toBe('cannotAfterLeaving');
    });

    it('lets one that got off in an earlier turn walk as it likes', () => {
      expect(rideMoveRefusal({ ...base, changedTurn: '1:knight', leftSeat: 'passenger' })).toBeNull();
    });

    it('stops nothing while turns are not being taken', () => {
      expect(rideMoveRefusal({ ...base, turn: '', onMount: true, mountMovedTurn: '2:horse' })).toBeNull();
      expect(rideMoveRefusal({ ...base, turn: '', changedTurn: '', leftSeat: 'passenger' })).toBeNull();
    });
  });

  describe('falling off a mount', () => {
    const pieces = [
      { id: 'horse', ridingOn: '', rideSeat: '', mountable: true },
      { id: 'knight', ridingOn: 'horse', rideSeat: '', mountable: false },
      { id: 'squire', ridingOn: 'horse', rideSeat: 'passenger', mountable: false },
      { id: 'crate', ridingOn: 'horse', rideSeat: 'cargo', mountable: false },
      { id: 'walker', ridingOn: '', rideSeat: '', mountable: false },
    ];

    it('throws everybody off a mount that goes down, and nobody off one nobody rides', () => {
      expect(fallersWhenDown('horse', pieces)).toEqual(['knight', 'squire', 'crate']);
      expect(fallersWhenDown('walker', pieces)).toEqual([]);
      expect(fallersWhenDown('nobody', pieces)).toEqual([]);
    });

    it('takes a load off with the one riding in front, and leaves whoever sits behind on', () => {
      expect(fallersWhenDown('knight', pieces)).toEqual(['knight', 'crate']);
      expect(fallersWhenDown('squire', pieces)).toEqual(['squire']);
      expect(fallersWhenDown('crate', pieces)).toEqual(['crate']);
    });

    it('measures a fall from the move set out on this turn, or else the one made in the last turn', () => {
      const base = { turn: '3:knight', movedTurn: '3:knight', movedM: 12, actedThisRound: false };

      expect(fallFromM(base)).toBe(12);
      expect(fallFromM({ ...base, movedTurn: '3:horse' })).toBe(12);
      expect(fallFromM({ ...base, movedTurn: '2:knight' })).toBe(12);
      expect(fallFromM({ ...base, movedTurn: '2:knight', actedThisRound: true })).toBe(0);
      expect(fallFromM({ ...base, movedTurn: '1:knight' })).toBe(0);
      expect(fallFromM({ ...base, turn: '', movedTurn: '1:knight' })).toBe(12);
      expect(fallFromM({ ...base, movedM: Number.NaN })).toBe(0);
    });

    it('falls a fifth of the way the mount was moving, rounded up, and never less than the shortest fall', () => {
      expect(fallDistanceM(0, 2)).toBe(2);
      expect(fallDistanceM(12, 2)).toBe(3);
      expect(fallDistanceM(15, 2)).toBe(3);
      expect(fallDistanceM(21, 2)).toBe(5);
      expect(fallDistanceM(21, 6)).toBe(6);
    });
  });

  it('reads the name of the buff a chat buff command gives, and none for one that gives none', () => {
    expect(buffNameOf('&ふたり乗り/判定-4/99')).toBe('ふたり乗り');
    expect(buffNameOf(' &!ふたり乗り/命中/-/4/99 ')).toBe('ふたり乗り');
    expect(buffNameOf('&+重ね/攻撃+1')).toBe('重ね');
    expect(buffNameOf('&ふたり乗り-')).toBeNull();
    expect(buffNameOf('&R-')).toBeNull();
    expect(buffNameOf('&D')).toBeNull();
    expect(buffNameOf('ふたり乗り')).toBeNull();
    expect(buffNameOf('&')).toBeNull();
  });

  it('lets a piece that is no mount walk onto a mount and those riding it, and a mount onto neither', () => {
    const pieces = [
      { id: 'knight', ridingOn: '', rideSeat: '', mountable: false },
      { id: 'horse', ridingOn: '', rideSeat: '', mountable: true },
      { id: 'squire', ridingOn: 'horse', rideSeat: 'passenger', mountable: false },
      { id: 'guard', ridingOn: '', rideSeat: '', mountable: false },
    ];

    expect(inTheWayOf(pieces[0], pieces).map((piece) => piece.id)).toEqual(['knight', 'guard']);
    expect(inTheWayOf(pieces[1], pieces).map((piece) => piece.id)).toEqual(['knight', 'horse', 'squire', 'guard']);
  });
});
