// キャラクターシート倉庫の各システム編集フォーム（{slug}/edit.html）から、JSONパス→ラベルの対応表を
// 抽出してsrc/app/domain/character/import/appspot-label-maps.generated.tsを生成する。
// フォームHTMLはCORSを返さないため、実行時には取得できない。ここでビルド前に静的化する。
// 専用プロファイルのある系統（PF系・dx3・stellar・bbt・kancolle）は各自でラベルを持つため対象外。
import { Window } from 'happy-dom';
import { writeFileSync } from 'fs';

const SLUGS = [
  'amadeus',
  '2s',
  'dlh',
  'dracurouge',
  'tenka',
  'tgs',
  'mgr',
  'mnt',
  'mar',
  'kenzen',
  'lostroyal',
  'owh',
  'satasupe',
  'cocorod',
  'krcry',
  'tiw',
  'lostrecord',
  'ainecadette',
  'skynauts2',
  'bakenokawa',
  'demonspike',
  'tensaigunshi',
  'neginegi',
  'mura',
  'bluebeatdown',
  'boa3',
  'boare',
  'boa',
  'tnd',
  'tnx',
  'tnm',
  'animaanimus',
  'lrq',
  'dgp',
  'gehenna',
  'colossalhunter',
  'nuekagami',
  'skynauts',
  'avandner',
  'tsb2',
  'blmythos',
  'divinecharger',
  'nerenai',
  'bloodpath',
  'steampunk',
  'juin',
  'unsung',
  'yu_myo_kishi',
  'shuumatsukikou',
  'ac6',
  'al2',
  'smbl',
  'begidol',
  'pkboo',
  'mglg',
  'monobeast',
];

const norm = (t) =>
  (t || '')
    .replace(/\s+/g, ' ')
    .replace(/[：:]\s*$/, '')
    .trim();
function prevDoc(n) {
  if (n.previousElementSibling) {
    let p = n.previousElementSibling;
    while (p.lastElementChild) p = p.lastElementChild;
    return p;
  }
  return n.parentElement;
}
function nearestTitle(el) {
  const table = el.closest('table');
  let fallback = '';
  let n = el;
  for (let i = 0; i < 800 && n; i++) {
    n = prevDoc(n);
    if (!n || (table && !table.contains(n))) break;
    if (n.tagName !== 'TH') continue;
    const t = norm(n.textContent);
    if (!t || !/[一-龠ぁ-んァ-ヶ]/.test(t) || t.length > 6) continue;
    if (/\btitle\b/.test(n.getAttribute('class') || '')) return t;
    if (fallback === '') fallback = t;
  }
  return fallback;
}

const win = new Window();
const maps = {};
for (const slug of SLUGS) {
  try {
    const res = await fetch(`https://character-sheets.appspot.com/${slug}/edit.html`);
    if (!res.ok) {
      console.error(slug, 'HTTP', res.status);
      continue;
    }
    const doc = new win.DOMParser().parseFromString(await res.text(), 'text/html');
    const map = {};
    for (const el of doc.querySelectorAll('[id]')) {
      const id = el.getAttribute('id') || '';
      const m = id.match(/^([a-zA-Z]+\.[a-zA-Z0-9]+)/);
      if (!m || map[m[1]]) continue;
      const label = nearestTitle(el);
      if (label) map[m[1]] = label;
    }
    if (Object.keys(map).length > 0) {
      maps[slug] = map;
      console.error(slug, Object.keys(map).length, 'labels');
    }
  } catch (e) {
    console.error(slug, 'ERR', e.message);
  }
  await new Promise((r) => setTimeout(r, 1200));
}

const header =
  `// 自動生成 (scripts/generate-appspot-label-maps.mjs)。手で編集しない。\n` +
  `// 倉庫の編集フォーム id（JSONパス）と見出しから抽出した {パス: ラベル}。倉庫の system slug で参照する。\n`;
const body = `export const APPSPOT_LABEL_MAPS: Record<string, Record<string, string>> = ${JSON.stringify(maps, null, 2)};\n`;
writeFileSync('src/app/domain/character/import/appspot-label-maps.generated.ts', header + body);
console.error('written', Object.keys(maps).length, 'systems');
