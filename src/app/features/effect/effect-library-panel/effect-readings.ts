/*
 * How the words the bundled effects are named with are read, so that an effect is found by typing
 * its name in kana. The tool carries no dictionary: this lists the words of the bundled names,
 * families and kinds, and a name made of them is read word by word. A word it does not list is left
 * as written, and is then found only as written.
 */

/** Each word as written, with its reading in hiragana. */
const WORD_READINGS: Readonly<Record<string, string>> = {
  // Families.
  物理: 'ぶつり',
  打撃: 'だげき',
  射撃: 'しゃげき',
  時空: 'じくう',
  回復: 'かいふく',
  状態異常: 'じょうたいいじょう',
  防御: 'ぼうぎょ',
  強化: 'きょうか',
  撃破: 'げきは',
  組み立て: 'くみたて',
  範囲: 'はんい',
  // Single characters, read as a word of their own.
  炎: 'ほのお',
  雷: 'かみなり',
  氷: 'こおり',
  土: 'つち',
  風: 'かぜ',
  闇: 'やみ',
  聖: 'せい',
  火: 'ひ',
  矢: 'や',
  光: 'ひかり',
  毒: 'どく',
  血: 'ち',
  剣: 'けん',
  // Kinds.
  斬撃: 'ざんげき',
  飛翔体: 'ひしょうたい',
  爆発: 'ばくはつ',
  閃光: 'せんこう',
  きのこ雲: 'きのこぐも',
  衝撃波: 'しょうげきは',
  岩石破砕: 'がんせきはさい',
  地隆: 'ちりゅう',
  落雷: 'らくらい',
  氷結: 'ひょうけつ',
  竜巻: 'たつまき',
  毒霧: 'どくぎり',
  闘気: 'とうき',
  障壁: 'しょうへき',
  吸収: 'きゅうしゅう',
  転移: 'てんい',
  重力: 'じゅうりょく',
  電流: 'でんりゅう',
  呪印: 'じゅいん',
  極太: 'ごくぶと',
  崩壊: 'ほうかい',
  両断: 'りょうだん',
  照射: 'しょうしゃ',
  弾道: 'だんどう',
  裁き: 'さばき',
  光輪: 'こうりん',
  聖域: 'せいいき',
  地割れ: 'じわれ',
  大地震: 'だいじしん',
  // Grades and reaches.
  初級: 'しょきゅう',
  中級: 'ちゅうきゅう',
  上級: 'じょうきゅう',
  単体: 'たんたい',
  自分: 'じぶん',
  // The words of the bundled names.
  一閃: 'いっせん',
  飛ぶ: 'とぶ',
  連斬: 'れんざん',
  兜割り: 'かぶとわり',
  大斬撃: 'だいざんげき',
  殴打: 'おうだ',
  強打: 'きょうだ',
  崩拳: 'ほうけん',
  光線銃: 'こうせんじゅう',
  銃弾: 'じゅうだん',
  岩弾: 'がんだん',
  気弾: 'きだん',
  連射: 'れんしゃ',
  呪弾: 'じゅだん',
  徹甲弾: 'てっこうだん',
  風弾: 'ふうだん',
  雷弾: 'らいだん',
  貫通: 'かんつう',
  極彩: 'ごくさい',
  重機関銃: 'じゅうきかんじゅう',
  狙撃: 'そげき',
  誘導弾: 'ゆうどうだん',
  流星: 'りゅうせい',
  火の粉: 'ひのこ',
  炎上: 'えんじょう',
  爆炎: 'ばくえん',
  大剣: 'たいけん',
  火炎: 'かえん',
  業火: 'ごうか',
  大爆発: 'だいばくはつ',
  電撃: 'でんげき',
  雷帝: 'らいてい',
  連鎖雷: 'れんさらい',
  氷礫: 'ひょうれき',
  絶対零度: 'ぜったいれいど',
  吹雪: 'ふぶき',
  氷棺: 'ひょうかん',
  大地: 'だいち',
  突風: 'とっぷう',
  砂塵: 'さじん',
  鎌鼬: 'かまいたち',
  真空波: 'しんくうは',
  大嵐: 'おおあらし',
  生命: 'せいめい',
  暗黒: 'あんこく',
  暗黒球: 'あんこくきゅう',
  影の棘: 'かげのとげ',
  奈落: 'ならく',
  蝕: 'しょく',
  呪い: 'のろい',
  聖印: 'せいいん',
  吐息: 'といき',
  聖光弾: 'せいこうだん',
  天罰: 'てんばつ',
  召喚陣: 'しょうかんじん',
  特異点: 'とくいてん',
  治癒: 'ちゆ',
  大治癒: 'だいちゆ',
  状態: 'じょうたい',
  治療: 'ちりょう',
  回復光: 'かいふくこう',
  暗闇: 'くらやみ',
  恐怖: 'きょうふ',
  拘束: 'こうそく',
  混乱: 'こんらん',
  出血: 'しゅっけつ',
  睡眠: 'すいみん',
  沈黙: 'ちんもく',
  鈍足: 'どんそく',
  燃焼: 'ねんしょう',
  麻痺: 'まひ',
  魅了: 'みりょう',
  石化: 'せきか',
  反射: 'はんしゃ',
  超必殺: 'ちょうひっさつ',
  散弾: 'さんだん',
  魔弾: 'まだん',
  追撃: 'ついげき',
  着弾: 'ちゃくだん',
  絨毯: 'じゅうたん',
};

const LONGEST_WORD = Math.max(...Object.keys(WORD_READINGS).map((word) => word.length));

/**
 * A text as it is read, word by word: at each place the longest word listed is read, and what no
 * word covers is left as written. Kana and letters come back as they were.
 */
export function readingOf(text: string): string {
  let read = '';
  for (let at = 0; at < text.length;) {
    let taken = 0;
    for (let length = Math.min(LONGEST_WORD, text.length - at); length > 0; length--) {
      const reading = WORD_READINGS[text.slice(at, at + length)];
      if (reading === undefined) continue;
      read += reading;
      taken = length;
      break;
    }
    if (taken < 1) {
      read += text[at];
      taken = 1;
    }
    at += taken;
  }
  return read;
}
