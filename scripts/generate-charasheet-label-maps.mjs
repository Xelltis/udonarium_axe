// 保管所の各システム作成ページ（{slug}_pc_making.html）から、入力名→ラベルの対応表を抽出して
// src/app/domain/character/import/charasheet-label-maps.generated.tsを生成する。
// 作成ページHTMLはCORSを返さないため、実行時には取得できない。ここでビルド前に静的化する。
// 専用プロファイルのある系統は各自でラベルを持つため、汎用フォールバックの系統のみ対象。
import { Window } from 'happy-dom';
import { writeFileSync } from 'fs';

// { 作成ページのslug : データのgame値 }。多くは同一。
const SYSTEMS = {
  gobusla: 'gobusla',
  aeng: 'aeng',
  konosuba: 'konosuba',
  oct: 'oct',
  kmgkr: 'kmgkr',
  pugmire: 'pugmire',
  dnd4: 'dnd4',
  yukoya: 'yukoya',
  nheaven: 'nheaven',
  horabre: 'horabre',
  horabrevsp: 'horabrevsp',
  parats: 'paranoia',
  araguild: 'araguild',
  gracreland: 'gracreland',
  ryutamad: 'ryutamad',
  utakazecal: 'utakazecal',
};

const span = (c) => Math.max(1, parseInt(c.getAttribute('colspan') || '1', 10) || 1);
const cidx = (c) => {
  let i = 0,
    n = c.previousElementSibling;
  while (n) {
    i += span(n);
    n = n.previousElementSibling;
  }
  return i;
};
const norm = (t) =>
  (t || '')
    .replace(/\s+/g, ' ')
    .replace(/[：:]\s*$/, '')
    .trim();
function colH(f, DOM) {
  const cell = f.closest('td,th');
  const row = cell?.closest('tr');
  if (!cell || !row) return '';
  const idx = cidx(cell);
  let r = row.previousElementSibling;
  while (r) {
    let acc = 0;
    for (const c of [...r.children]) {
      const s = span(c);
      if (idx >= acc && idx < acc + s) {
        if (c.tagName === 'TH') {
          const t = norm(c.textContent);
          if (t && t.length <= 8) return t;
        }
        break;
      }
      acc += s;
    }
    r = r.previousElementSibling;
  }
  return '';
}
function rowH(f) {
  const cell = f.closest('td');
  let n = cell?.previousElementSibling ?? null;
  while (n) {
    if (n.tagName === 'TH') {
      const t = norm(n.textContent);
      if (t && t.length <= 10) return t;
    }
    n = n.previousElementSibling;
  }
  return '';
}

// 内部・送信用のキーには無関係なラベルが付くだけなので除外する。
const INTERNAL_KEY = /^(SL_|V_|chk|is_disp|dodontof_|password|phrase|data_id|base64|color$|url$|pc_id)/i;
const isInternalKey = (name) => INTERNAL_KEY.test(name) || /_id$/.test(name);

const win = new Window();
const maps = {};
for (const [slug, game] of Object.entries(SYSTEMS)) {
  try {
    const res = await fetch(`https://charasheet.vampire-blood.net/${slug}_pc_making.html`);
    if (!res.ok) {
      console.error(slug, 'HTTP', res.status);
      continue;
    }
    const doc = new win.DOMParser().parseFromString(await res.text(), 'text/html');
    const map = {};
    for (const f of doc.querySelectorAll('input[name], select[name]')) {
      const name = f.getAttribute('name') || '';
      if (!name || name.endsWith('[]') || map[name] || isInternalKey(name)) continue;
      const label = colH(f, win) || rowH(f);
      if (label) map[name] = label;
    }
    if (Object.keys(map).length > 0) {
      maps[game] = map;
      console.error(slug, '→', game, Object.keys(map).length, 'labels');
    }
  } catch (e) {
    console.error(slug, 'ERR', e.message);
  }
  await new Promise((r) => setTimeout(r, 1200));
}

const header =
  `// 自動生成 (scripts/generate-charasheet-label-maps.mjs)。手で編集しない。\n` +
  `// 保管所の作成ページ <th> 見出しから抽出した {入力名: ラベル}。game 値で参照する。\n`;
const body = `export const CHARASHEET_LABEL_MAPS: Record<string, Record<string, string>> = ${JSON.stringify(maps, null, 2)};\n`;
writeFileSync('src/app/domain/character/import/charasheet-label-maps.generated.ts', header + body);
console.error('written', Object.keys(maps).length, 'systems');
