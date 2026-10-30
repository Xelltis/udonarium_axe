import { TestBed } from '@angular/core/testing';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  BuffPalette,
  ChatPalette,
  DiceTablePalette,
  evaluateCharacterReferences,
  paletteVariableSite,
  textTargetsCharacter,
} from '@axe/domain/chat/chat-palette';
import { DataElement, DataElementFieldType } from '@axe/domain/data/data-element';
import { applyBuffEdit } from '@axe/domain/data/resource-edit-helpers';

describe('ChatPalette', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts with the default dice bot', () => {
      const palette = new ChatPalette();
      palette.initialize();
      expect(palette.dicebot).toBe('DiceBot');
    });
  });

  describe('getPalette / setPalette', () => {
    it('reads the palette it is given', () => {
      const palette = new ChatPalette();
      palette.initialize();
      palette.setPalette('2d6+3\n1d20\nCC<=50');
      const lines = palette.getPalette();
      expect(lines).toContain('2d6+3');
      expect(lines).toContain('1d20');
      expect(lines).toContain('CC<=50');
    });

    it('returns nothing for an empty one', () => {
      const palette = new ChatPalette();
      palette.initialize();
      palette.setPalette('');
      expect(palette.getPalette()).toEqual(['']);
    });
  });

  describe('paletteLines', () => {
    it('returns the rows without the variable lines', () => {
      const palette = new ChatPalette();
      palette.initialize();
      palette.setPalette('2d6\n//HP=10\n1d20');
      const lines = palette.paletteLines;
      expect(lines).toHaveLength(2);
      expect(lines[0].palette).toBe('2d6');
      expect(lines[1].palette).toBe('1d20');
    });
  });

  describe('paletteVariables', () => {
    it('reads a line that defines a variable', () => {
      const palette = new ChatPalette();
      palette.initialize();
      palette.setPalette('//HP=10\n//MP=20\n2d6');
      const vars = palette.paletteVariables;
      expect(vars).toHaveLength(2);
      expect(vars[0].name).toBe('HP');
      expect(vars[0].value).toBe('10');
      expect(vars[1].name).toBe('MP');
      expect(vars[1].value).toBe('20');
    });

    it('reads the full-width forms of both marks', () => {
      const palette = new ChatPalette();
      palette.initialize();
      palette.setPalette('／／ATK＝5');
      const vars = palette.paletteVariables;
      expect(vars).toHaveLength(1);
      expect(vars[0].name).toBe('ATK');
      expect(vars[0].value).toBe('5');
    });
  });

  describe('paletteIndex', () => {
    it('reads a heading in one form', () => {
      const palette = new ChatPalette();
      palette.initialize();
      palette.setPalette('//---戦闘---\n2d6\n//---探索---\n1d100');
      const index = palette.paletteIndex;
      expect(index).toHaveLength(2);
      expect(index[0].name).toBe('戦闘');
      expect(index[1].name).toBe('探索');
    });

    it('reads one in another', () => {
      const palette = new ChatPalette();
      palette.initialize();
      palette.setPalette('◆技能\n1d100\n◆ステータス\n2d6');
      const index = palette.paletteIndex;
      expect(index).toHaveLength(2);
      expect(index[0].name).toBe('技能');
      expect(index[1].name).toBe('ステータス');
    });
  });

  describe('paletteMatch()', () => {
    it('finds a row holding a piece of text', () => {
      const palette = new ChatPalette();
      palette.initialize();
      palette.setPalette('2d6+3 攻撃\n1d20 命中\n2d6 ダメージ');
      const matches = palette.paletteMatch('2d6');
      expect(matches).toHaveLength(2);
    });
  });

  describe('paletteMatchLine()', () => {
    it('returns which row the nth match falls in', () => {
      const palette = new ChatPalette();
      palette.initialize();
      palette.setPalette('line0\nmatch1\nline2\nmatch2');
      expect(palette.paletteMatchLine('match', 0)).toBe(1);
      expect(palette.paletteMatchLine('match', 1)).toBe(3);
    });

    it('returns nothing when none matches', () => {
      const palette = new ChatPalette();
      palette.initialize();
      palette.setPalette('abc');
      expect(palette.paletteMatchLine('xyz', 0)).toBe(-1);
    });
  });

  describe('checkTargetCharacter()', () => {
    it('finds one form of the target pattern', () => {
      const palette = new ChatPalette();
      palette.initialize();
      expect(palette.checkTargetCharacter('2d6 t{ATK}')).toBe(true);
    });

    it('finds the other', () => {
      const palette = new ChatPalette();
      palette.initialize();
      expect(palette.checkTargetCharacter('T:ターゲット名')).toBe(true);
    });

    it('is false when there is none', () => {
      const palette = new ChatPalette();
      palette.initialize();
      expect(palette.checkTargetCharacter('2d6+3')).toBe(false);
    });
  });

  it('lists the headings, but not the lines that open a tab', () => {
    const palette = new ChatPalette();
    palette.initialize();
    palette.setPalette('◆◆戦闘\n◆攻撃\n2d6\n◆◆◆飾り');

    expect(palette.paletteIndex.map((index) => index.name)).toEqual(['攻撃', '◆◆飾り']);
  });

  describe('evaluate()', () => {
    it('expands the variables', () => {
      const palette = new ChatPalette();
      palette.initialize();
      palette.setPalette('//HP=10\n2d6+{HP}');
      const result = palette.evaluate('2d6+{HP}');
      expect(result).toBe('2d6+10');
    });

    it('expands one it does not know to nothing', () => {
      const palette = new ChatPalette();
      palette.initialize();
      palette.setPalette('2d6');
      const result = palette.evaluate('2d6+{UNDEFINED}');
      expect(result).toBe('2d6+');
    });

    it('adds a buff appended to a roll where the sheet wears it, and leaves it out where it does not', () => {
      const palette = new ChatPalette();
      palette.initialize();
      palette.setPalette('2d+10{加護}');
      const sheet = DataElement.create('character', '');
      sheet.appendChild(DataElement.create('加護', 3, { type: 'numberResource', currentValue: '+10' }));

      expect(palette.evaluate('2d+10{加護}', sheet)).toBe('2d+10+10');
      expect(palette.evaluate('2d+10{加護}', DataElement.create('character', ''))).toBe('2d+10');
    });

    it('works from a row as well', () => {
      const palette = new ChatPalette();
      palette.initialize();
      palette.setPalette('//ATK=5\n2d6+{ATK}');
      const lines = palette.paletteLines;
      const attackLine = lines.find((l) => l.palette.includes('ATK'));
      if (attackLine) {
        const result = palette.evaluate(attackLine);
        expect(result).toBe('2d6+5');
      }
    });

    it('expands by the full path where two variables share a short name', () => {
      const palette = new ChatPalette();
      palette.initialize();
      const detail = DataElement.create('detail', '');
      const section = DataElement.create('戦闘特技', '');
      const skillA = DataElement.create('最終能力', '');
      const skillB = DataElement.create('Lv1', '');
      const nameA = DataElement.create('名称', 'オーバークリエイト');
      const nameB = DataElement.create('名称', 'ストラグチャアタック');
      detail.appendChild(section);
      section.appendChild(skillA);
      section.appendChild(skillB);
      skillA.appendChild(nameA);
      skillB.appendChild(nameB);

      expect(palette.evaluate('{名称}', detail)).toBe('');
      expect(palette.evaluate('{戦闘特技/最終能力/名称}', detail)).toBe('オーバークリエイト');
      expect(palette.evaluate('{戦闘特技/Lv1/名称}', detail)).toBe('ストラグチャアタック');
    });

    it('gathers a reference to an image field as an attached picture', () => {
      const palette = new ChatPalette();
      palette.initialize();
      const detail = DataElement.create('detail', '');
      const profile = DataElement.create('プロフィール', '');
      const basic = DataElement.create('基本', '');
      const image = DataElement.create('参考画像', 'image-stamp-id', { fieldType: DataElementFieldType.IMAGE });
      detail.appendChild(profile);
      profile.appendChild(basic);
      basic.appendChild(image);

      const result = palette.evaluateWithAttachments('確認 {プロフィール/基本/参考画像}', detail);

      expect(result.text).toBe('確認 ');
      expect(result.attachmentImageIdentifiers).toEqual(['image-stamp-id']);
      expect(palette.evaluate('確認 {プロフィール/基本/参考画像}', detail)).toBe('確認 image-stamp-id');
    });
  });

  describe('BuffPalette / DiceTablePalette', () => {
    it('the buff palette is a palette', () => {
      const bp = new BuffPalette();
      bp.initialize();
      expect(bp).toBeInstanceOf(ChatPalette);
    });

    it('the table palette is one too', () => {
      const dtp = new DiceTablePalette();
      dtp.initialize();
      expect(dtp).toBeInstanceOf(ChatPalette);
    });
  });

  describe('evaluateCharacterReferences()', () => {
    function makeCharacter(withPalette: boolean, hp = '13'): GameCharacter {
      const character = new GameCharacter();
      character.initialize();
      character.createDataElements();
      const detail = DataElement.create('detail', '');
      const status = DataElement.create('ステータス', '');
      status.appendChild(DataElement.create('HP', hp));
      detail.appendChild(status);
      character.rootDataElement?.appendChild(detail);

      if (withPalette) {
        const palette = new ChatPalette();
        palette.initialize();
        palette.setPalette('//ATK=7\n2d6+{ATK}');
        character.appendChild(palette);
      }
      return character;
    }

    it('reads the sheet of a piece that keeps no palette', () => {
      const character = makeCharacter(false);

      expect(evaluateCharacterReferences('2d6+{HP}', character).text).toBe('2d6+13');
    });

    it('reads the variables of a piece that keeps one', () => {
      const character = makeCharacter(true);

      expect(evaluateCharacterReferences('2d6+{ATK}', character).text).toBe('2d6+7');
    });

    it('reads the piece it is aimed at through t{}', () => {
      const speaker = makeCharacter(false);
      const target = makeCharacter(false, '4');

      expect(evaluateCharacterReferences('{HP} t{HP}', speaker, target).text).toBe('13 4');
    });

    describe('a buff named where a number is worked out', () => {
      function wearing(character: GameCharacter, command: string): GameCharacter {
        character.addBuffDataElement();
        applyBuffEdit({ command, object: character, targeted: false }, character);
        return character;
      }

      it('lends the number its note carries, to the amount the target is hit for', () => {
        const attacker = wearing(makeCharacter(false), '&練技/攻撃+2/3');
        const target = wearing(makeCharacter(false, '4'), '&守り/防護+3/3');

        expect(evaluateCharacterReferences('t:HP-{練技}', attacker, target).text).toBe('t:HP-2');
        expect(evaluateCharacterReferences('t:HP-({HP}+{練技}-t{守り})', attacker, target).text).toBe('t:HP-(13+2-3)');
      });

      it('brackets a number below nought after an operator, and keeps the sign of one joined on', () => {
        const cursed = wearing(wearing(makeCharacter(false), '&呪い/攻撃-1/3'), '&加護/+10/3');

        expect(evaluateCharacterReferences(':HP+{呪い}', cursed).text).toBe(':HP+(-1)');
        expect(evaluateCharacterReferences('2d6+10{加護}', cursed).text).toBe('2d6+10+10');
      });

      it('joins on a number written without a sign with a plus, so it is not run into the one before', () => {
        const guarded = wearing(makeCharacter(false), '&加護/防護3/3');

        expect(evaluateCharacterReferences('2d6+10{加護}', guarded).text).toBe('2d6+10+3');
        expect(evaluateCharacterReferences(':HP-10{加護}', guarded).text).toBe(':HP-10+3');
      });

      it('lends the number as it is where it stands inside a number of its own, after a letter or a mark', () => {
        const guarded = wearing(makeCharacter(false), '&加護/防護3/3');

        expect(evaluateCharacterReferences('2d{加護}', guarded).text).toBe('2d3');
        expect(evaluateCharacterReferences('K20@{加護}', guarded).text).toBe('K20@3');
        expect(evaluateCharacterReferences('choice[{加護},x]', guarded).text).toBe('choice[3,x]');
      });

      it('lends a number with a plus inside a number of its own without the plus', () => {
        const guarded = wearing(makeCharacter(false), '&加護/防護+3/3');

        expect(evaluateCharacterReferences('2d{加護}', guarded).text).toBe('2d3');
        expect(evaluateCharacterReferences('K20@{加護}', guarded).text).toBe('K20@3');
      });

      it('lends the number in a roll repeated by a count before it', () => {
        const attacker = wearing(makeCharacter(false), '&練技/攻撃+2/3');

        expect(evaluateCharacterReferences('3 2d6+{練技}', attacker).text).toBe('3 2d6+2');
      });

      it('lends the number in a roll that a stamp put right after it ends, as a space would', () => {
        const guarded = wearing(makeCharacter(false), '&加護/防護3/3');

        expect(evaluateCharacterReferences('2d6+{加護}［x:seal:ok］ 攻撃', guarded).text).toBe(
          '2d6+3［x:seal:ok］ 攻撃'
        );
      });

      it('takes a note with no number as nought after an operator, and as nothing joined on', () => {
        const poisoned = wearing(wearing(makeCharacter(false), '&毒/苦しい/3'), '&加護/攻撃+0/3');

        expect(evaluateCharacterReferences('2d6+{加護}', poisoned).text).toBe('2d6+0');
        expect(evaluateCharacterReferences(':HP-{毒}', poisoned).text).toBe(':HP-0');
        expect(evaluateCharacterReferences('2d6+10{加護}', poisoned).text).toBe('2d6+10');
      });

      it('still reads the words of the note anywhere else in the line', () => {
        const attacker = wearing(makeCharacter(false), '&練技/攻撃+2/3');

        expect(evaluateCharacterReferences('2d6 {練技}が効いている', attacker).text).toBe('2d6 攻撃+2が効いている');
      });
    });

    it('leaves the line alone when nobody is speaking it', () => {
      expect(evaluateCharacterReferences('2d6+{HP}', null).text).toBe('2d6+{HP}');
    });

    it('leaves what it cannot fill in rather than eating it', () => {
      const character = makeCharacter(false);

      expect(evaluateCharacterReferences('やった{歓喜}', character).text).toBe('やった{歓喜}');
    });

    it('adds a buff appended to a roll, carrying its own sign, where the piece wears it', () => {
      const character = makeCharacter(false);
      character.rootDataElement
        ?.getFirstElementByName('detail')
        ?.appendChild(DataElement.create('加護', 3, { type: 'numberResource', currentValue: '+10' }));

      expect(evaluateCharacterReferences('2d+10{加護}', character).text).toBe('2d+10+10');
    });

    it('leaves out a buff appended to a roll where the piece does not wear it, so the roll still goes', () => {
      const character = makeCharacter(false);

      expect(evaluateCharacterReferences('2d+10{加護}', character).text).toBe('2d+10');
      expect(evaluateCharacterReferences('2d+10{加護}{祝福} 攻撃', character).text).toBe('2d+10 攻撃');
      expect(evaluateCharacterReferences('CC<=(50){加護}', character).text).toBe('CC<=(50)');
    });

    it('still leaves what it cannot fill in where a roll waits on it, a letter runs into it, or words hold it', () => {
      const character = makeCharacter(false);

      expect(evaluateCharacterReferences('2d6+{攻撃力}', character).text).toBe('2d6+{攻撃力}');
      expect(evaluateCharacterReferences('2D{面数}', character).text).toBe('2D{面数}');
      expect(evaluateCharacterReferences('2d6 やった10{歓喜}', character).text).toBe('2d6 やった10{歓喜}');
      expect(evaluateCharacterReferences('やった10{歓喜}', character).text).toBe('やった10{歓喜}');
    });

    it('leaves a calculating field alone where the formula cannot be worked out', () => {
      const character = makeCharacter(false);
      const calc = DataElement.create('攻撃力', '', {
        fieldType: DataElementFieldType.CALC,
        formula: '存在しない項目 * 2',
      });
      character.rootDataElement?.getFirstElementByName('detail')?.appendChild(calc);

      // '?' reads as a hint on the sheet, but in a command it is only a broken roll.
      expect(evaluateCharacterReferences('2d6+{攻撃力}', character).text).toBe('2d6+{攻撃力}');
    });
  });

  describe('a calculating field among the references', () => {
    it('gives the result rather than the empty value it stores', () => {
      const palette = new ChatPalette();
      palette.initialize();
      const detail = DataElement.create('detail', '');
      detail.appendChild(DataElement.create('筋力', '8'));
      const calc = DataElement.create('攻撃力', '', {
        fieldType: DataElementFieldType.CALC,
        formula: '筋力 * 2',
      });
      detail.appendChild(calc);

      expect(palette.evaluate('2d6+{攻撃力}', detail)).toBe('2d6+16');
    });

    it('reads a resource it works from at what that is now', () => {
      const palette = new ChatPalette();
      palette.initialize();
      const detail = DataElement.create('detail', '');
      detail.appendChild(DataElement.create('HP', 20, { type: 'numberResource', currentValue: 7 }));
      const calc = DataElement.create('残り', '', { fieldType: DataElementFieldType.CALC, formula: 'HP' });
      detail.appendChild(calc);

      expect(palette.evaluate('{残り}', detail)).toBe('7');
    });
  });

  describe('textTargetsCharacter()', () => {
    it('counts a t{} reference as aiming at the marked pieces', () => {
      expect(textTargetsCharacter('2d6 t{ATK}')).toBe(true);
    });

    it('leaves a plain roll alone', () => {
      expect(textTargetsCharacter('2d6+3')).toBe(false);
    });

    it('counts a secret command aimed at targets as aiming, as the command is carried out', () => {
      expect(textTargetsCharacter('st&呪い-')).toBe(true);
      expect(textTargetsCharacter('攻撃 st:HP-1')).toBe(true);
      expect(textTargetsCharacter('S&W St&W')).toBe(false);
    });
  });
});

describe('paletteVariableSite', () => {
  it('places the name and the value of a variable line', () => {
    const line = ' //ＳＴＲ = 3+2';
    const site = paletteVariableSite(line)!;
    expect(site).toMatchObject({ name: 'STR', value: '3+2' });
    expect(line.slice(site.nameFrom, site.nameTo)).toBe('ＳＴＲ');
    expect(line.slice(site.valueFrom)).toBe('3+2');
  });

  it('answers null for a line that sets nothing', () => {
    expect(paletteVariableSite('2d6 //攻撃')).toBeNull();
  });

  describe('a line aimed at the pieces marked', () => {
    it('is aimed by a targeted command a stamp put right before it starts, as a space would', () => {
      expect(textTargetsCharacter('攻撃［いいね:seal:ok］t:HP-1')).toBe(true);
      expect(textTargetsCharacter('攻撃［いいね:seal:ok］t&加護/防護+2/3')).toBe(true);
      expect(textTargetsCharacter('攻撃t:HP-1')).toBe(false);
    });
  });
});
