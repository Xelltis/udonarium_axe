import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig } from 'vitepress';

const repo = 'https://github.com/Xelltis/udonarium_axe';
const base = '/udonarium_axe/';

// Social crawlers ignore relative URLs, so the deployed origin has to be
// spelled out here. Change it together with the Pages settings.
const siteUrl = `https://xelltis.github.io${base}`;
const siteName = 'Udonarium Axe';
const siteDescription = 'ブラウザで動く TRPG オンラインセッション支援ツール — 利用ガイド';
const ogImage = `${siteUrl}og.jpg`;

/**
 * The first real paragraph of a page, so a shared link describes that page
 * instead of repeating the site description. Headings, containers, tables,
 * lists and component tags are skipped.
 */
function leadParagraph(file: string): string {
  let source: string;
  try {
    source = readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const paragraphs: string[] = [];
  let current: string[] = [];
  const length = () => paragraphs.join('').length;
  const flush = () => {
    if (current.length) paragraphs.push(current.join(''));
    current = [];
  };

  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      // a release note opens with just its date, so keep reading until the
      // description actually says something
      if (length() >= 60) break;
      continue;
    }
    if (/^[#>|:`-]|^<|^\d+\./.test(line)) {
      flush();
      if (paragraphs.length) break;
      continue;
    }
    current.push(line);
  }
  flush();

  const text = paragraphs
    .join(' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}

export default defineConfig({
  lang: 'ja-JP',
  title: 'Udonarium Axe',
  description: siteDescription,
  base,
  cleanUrls: true,
  lastUpdated: true,
  transformPageData(pageData, { siteConfig }) {
    const isHome = pageData.relativePath === 'index.md';
    const title = isHome ? siteName : `${pageData.title} | ${siteName}`;
    const description =
      pageData.description ||
      (isHome ? siteDescription : leadParagraph(join(siteConfig.srcDir, pageData.filePath))) ||
      siteDescription;
    const url = siteUrl + pageData.relativePath.replace(/index\.md$/, '').replace(/\.md$/, '');

    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push(
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:site_name', content: siteName }],
      ['meta', { property: 'og:locale', content: 'ja_JP' }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:image', content: ogImage }],
      ['meta', { property: 'og:image:type', content: 'image/jpeg' }],
      ['meta', { property: 'og:image:width', content: '1200' }],
      ['meta', { property: 'og:image:height', content: '630' }],
      ['meta', { property: 'og:image:alt', content: `${siteName} — ${siteDescription}` }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: ogImage }],
      ['link', { rel: 'canonical', href: url }]
    );
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['link', { rel: 'apple-touch-icon', href: `${base}icon-180.png` }],
    ['meta', { name: 'theme-color', content: '#8b7cf6' }],
  ],
  vite: {
    css: { postcss: { plugins: [] } },
  },
  markdown: {
    // A copy of VitePress's own slugify with the result put back into NFC.
    // Its NFKD pass strips only the combining marks in U+0300..U+036F, which
    // leaves a Japanese dakuten decomposed: the id holds ハ + U+3099 where a
    // hand-written link holds バ. The two are indistinguishable on screen and
    // never match, and neither the build nor a reviewer can see the difference.
    // The same function makes the ids and the page outline, so both move together.
    anchor: {
      slugify: (str: string) =>
        str
          .normalize('NFKD')
          .replace(/[\u0300-\u036F]/g, '')
          .replace(/[\u0000-\u001f]/g, '')
          .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
          .replace(/-{2,}/g, '-')
          .replace(/^-+|-+$/g, '')
          .replace(/^(\d)/, '_$1')
          .toLowerCase()
          .normalize('NFC'),
    },
    config: (md) => {
      // Default VitePress tables are `display: block`, so they shrink to their
      // content and hug the left edge. Wrapping them lets the table fill the
      // column while wide ones scroll sideways inside the wrapper.
      md.renderer.rules.table_open = () => '<div class="table-wrap">\n<table>\n';
      md.renderer.rules.table_close = () => '</table>\n</div>\n';

      // Sources here are written one sentence per line. A soft line break
      // renders as a space, which Japanese does not want mid-sentence
      // (「使います。 下記の」). Drop it when both sides are Japanese.
      const cjk = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff01-\uff60]/;
      const edgeChar = (tokens, from, step) => {
        for (let i = from; i >= 0 && i < tokens.length; i += step) {
          const { type, content } = tokens[i];
          if (type === 'softbreak' || type === 'hardbreak') return '';
          if (!content) continue;
          return step > 0 ? content[0] : content[content.length - 1];
        }
        return '';
      };
      md.core.ruler.push('cjk-softbreak', (state) => {
        for (const token of state.tokens) {
          if (token.type !== 'inline' || !token.children) continue;
          const kids = token.children;
          for (let i = 1; i < kids.length - 1; i += 1) {
            if (kids[i].type !== 'softbreak') continue;
            if (cjk.test(edgeChar(kids, i - 1, -1)) && cjk.test(edgeChar(kids, i + 1, 1))) {
              kids[i].type = 'text';
              kids[i].content = '';
            }
          }
        }
      });
    },
  },
  themeConfig: {
    nav: [
      { text: '遊びかた', link: '/play/' },
      { text: '操作マニュアル', link: '/manual/' },
      { text: 'できること', link: '/guide/features' },
      { text: '設置する', link: '/guide/quickstart' },
      { text: 'リリースノート', link: '/release-notes/' },
    ],
    sidebar: {
      '/play/': [
        {
          text: '遊びかた',
          items: [
            { text: '遊びはじめる', link: '/play/' },
            { text: '招待リンクをもらったら', link: '/play/join' },
            { text: 'はじめてのセッション', link: '/play/first-session' },
            { text: '遊ぶときの困りごと', link: '/play/faq' },
          ],
        },
        {
          text: 'そのあと',
          items: [
            { text: '操作マニュアル', link: '/manual/' },
            { text: 'できること', link: '/guide/features' },
            { text: '自分の環境を用意する', link: '/guide/quickstart' },
          ],
        },
      ],
      '/manual/': [
        {
          text: 'はじめに',
          items: [
            { text: '画面の見かた', link: '/manual/' },
            { text: '部屋とロビー', link: '/manual/rooms' },
            { text: 'スマートフォンで使う', link: '/manual/mobile' },
            { text: '遊びはじめる', link: '/play/' },
            { text: '遊ぶときの困りごと', link: '/play/faq' },
          ],
        },
        {
          text: 'ロールと公開範囲',
          items: [
            { text: 'ロール（GM / PL / 見学）', link: '/manual/roles' },
            { text: 'PL ツールバー', link: '/manual/pl-tools' },
            { text: 'ホットバー', link: '/manual/hotbar' },
            { text: '情報の公開範囲', link: '/manual/disclosure' },
            { text: 'オブジェクト一覧（GM）', link: '/manual/gm-object-list' },
            { text: 'マップエディター', link: '/manual/map-editor' },
            { text: 'マップ生成', link: '/manual/map-generator' },
          ],
        },
        {
          text: 'テーブル',
          items: [
            { text: '視点とテーブル操作', link: '/manual/tabletop' },
            { text: '部屋設定', link: '/manual/room-settings' },
            { text: 'テーブル設定', link: '/manual/table-setting' },
            { text: '暗闇・視界・光源', link: '/manual/vision-lighting' },
            { text: '移動範囲', link: '/manual/move-range' },
            { text: '同行（パーティ）', link: '/manual/party' },
            { text: '地形', link: '/manual/terrain' },
            { text: 'マップマスク', link: '/manual/map-mask' },
            { text: 'ホワイトボード', link: '/manual/white-board' },
          ],
        },
        {
          text: 'オブジェクト',
          items: [
            { text: 'オブジェクトの基本操作', link: '/manual/objects' },
            { text: 'キャラクターコマ', link: '/manual/character' },
            { text: 'シートの項目（データ要素）', link: '/manual/data-element' },
            { text: 'キャラクターの取り込み', link: '/manual/character-import' },
            { text: 'バフ／デバフ', link: '/manual/buff' },
            { text: 'カード', link: '/manual/cards' },
            { text: 'ダイス', link: '/manual/dice' },
            { text: '共有メモ', link: '/manual/notes' },
            { text: '射程範囲', link: '/manual/range' },
            { text: '行動順', link: '/manual/turn-order' },
          ],
        },
        {
          text: 'チャット',
          items: [
            { text: 'チャットの基本', link: '/manual/chat' },
            { text: 'チャットの特殊記法', link: '/manual/chat-syntax' },
            { text: 'ダイスボット', link: '/manual/dicebot' },
            { text: 'チャットパレット', link: '/manual/chat-palette' },
            { text: '投票・点呼', link: '/manual/vote' },
            { text: 'アラーム', link: '/manual/alarm' },
          ],
        },
        {
          text: 'メディア',
          items: [
            { text: '画像', link: '/manual/images' },
            { text: 'ジュークボックス', link: '/manual/jukebox' },
            { text: 'カットイン', link: '/manual/cut-in' },
            { text: 'マップ演出（エフェクト）', link: '/manual/map-effects' },
            { text: 'ビジュアルノベルモード', link: '/manual/visual-novel' },
            { text: 'セッションログ（リプレイ）', link: '/manual/replay' },
          ],
        },
        {
          text: '管理・全体',
          items: [
            { text: 'インベントリ', link: '/manual/inventory' },
            { text: '保存と読み込み', link: '/manual/save-load' },
            { text: '接続が切れたとき', link: '/manual/connection' },
            { text: 'ココフォリアのルーム取り込み（実験的）', link: '/manual/room-import' },
            { text: 'テーマ', link: '/manual/theme' },
          ],
        },
      ],
      '/release-notes/': [
        {
          text: 'リリースノート',
          items: [
            { text: '一覧', link: '/release-notes/' },
            { text: 'v1.50.0', link: '/release-notes/v1.50.0' },
            { text: 'v1.49.0', link: '/release-notes/v1.49.0' },
            { text: 'v1.48.0', link: '/release-notes/v1.48.0' },
            { text: 'v1.47.0', link: '/release-notes/v1.47.0' },
            { text: 'v1.46.1', link: '/release-notes/v1.46.1' },
            { text: 'v1.46.0', link: '/release-notes/v1.46.0' },
            { text: 'v1.45.0', link: '/release-notes/v1.45.0' },
            { text: 'v1.44.1', link: '/release-notes/v1.44.1' },
            { text: 'v1.44.0', link: '/release-notes/v1.44.0' },
            { text: 'v1.43.1', link: '/release-notes/v1.43.1' },
            { text: 'v1.43.0', link: '/release-notes/v1.43.0' },
            { text: 'v1.42.0', link: '/release-notes/v1.42.0' },
            { text: 'v1.41.3', link: '/release-notes/v1.41.3' },
            { text: 'v1.41.2', link: '/release-notes/v1.41.2' },
            { text: 'v1.41.1', link: '/release-notes/v1.41.1' },
            { text: 'v1.41.0', link: '/release-notes/v1.41.0' },
            { text: 'v1.40.0', link: '/release-notes/v1.40.0' },
            { text: 'v1.39.0', link: '/release-notes/v1.39.0' },
            { text: 'v1.38.1', link: '/release-notes/v1.38.1' },
            { text: 'v1.38.0', link: '/release-notes/v1.38.0' },
            { text: 'v1.37.0', link: '/release-notes/v1.37.0' },
            { text: 'v1.36.2', link: '/release-notes/v1.36.2' },
            { text: 'v1.36.1', link: '/release-notes/v1.36.1' },
            { text: 'v1.36.0', link: '/release-notes/v1.36.0' },
            { text: 'v1.35.0', link: '/release-notes/v1.35.0' },
            { text: 'v1.34.1', link: '/release-notes/v1.34.1' },
            { text: 'v1.34.0', link: '/release-notes/v1.34.0' },
            { text: 'v1.33.0', link: '/release-notes/v1.33.0' },
            { text: 'v1.32.0', link: '/release-notes/v1.32.0' },
            { text: 'v1.31.0', link: '/release-notes/v1.31.0' },
            { text: 'v1.30.1', link: '/release-notes/v1.30.1' },
            { text: 'v1.30.0', link: '/release-notes/v1.30.0' },
            { text: 'v1.29.0', link: '/release-notes/v1.29.0' },
            { text: 'v1.28.0', link: '/release-notes/v1.28.0' },
            { text: 'v1.27.0', link: '/release-notes/v1.27.0' },
            { text: 'v1.26.0', link: '/release-notes/v1.26.0' },
            { text: 'v1.25.0', link: '/release-notes/v1.25.0' },
            { text: 'v1.24.0', link: '/release-notes/v1.24.0' },
            { text: 'v1.23.1', link: '/release-notes/v1.23.1' },
            { text: 'v1.23.0', link: '/release-notes/v1.23.0' },
            { text: 'v1.22.0', link: '/release-notes/v1.22.0' },
            { text: 'v1.21.0', link: '/release-notes/v1.21.0' },
            { text: 'v1.20.0', link: '/release-notes/v1.20.0' },
            { text: 'v1.19.1', link: '/release-notes/v1.19.1' },
            { text: 'v1.19.0', link: '/release-notes/v1.19.0' },
            { text: 'v1.18.2', link: '/release-notes/v1.18.2' },
            { text: 'v1.18.1', link: '/release-notes/v1.18.1' },
            { text: 'v1.18.0', link: '/release-notes/v1.18.0' },
            { text: 'v1.17.0', link: '/release-notes/v1.17.0' },
            { text: 'v1.16.0', link: '/release-notes/v1.16.0' },
            { text: 'v1.15.0', link: '/release-notes/v1.15.0' },
            { text: 'v1.14.0', link: '/release-notes/v1.14.0' },
            { text: 'v1.13.0', link: '/release-notes/v1.13.0' },
            { text: 'v1.12.1', link: '/release-notes/v1.12.1' },
            { text: 'v1.12.0', link: '/release-notes/v1.12.0' },
            { text: 'v1.11.0', link: '/release-notes/v1.11.0' },
            { text: 'v1.10.0', link: '/release-notes/v1.10.0' },
          ],
        },
      ],
      '/guide/': [
        {
          text: '自分で設置する',
          items: [
            { text: 'なぜバックエンドが要るのか', link: '/guide/requirements' },
            { text: 'クイックスタート', link: '/guide/quickstart' },
            { text: 'バックエンドの選択肢', link: '/guide/backend' },
            { text: '自分で設置するときの質問', link: '/guide/faq' },
          ],
        },
        {
          text: 'Axe について',
          items: [
            { text: 'Udonarium Axe とは', link: '/guide/getting-started' },
            { text: 'できること', link: '/guide/features' },
          ],
        },
        {
          text: '遊ぶほうへ',
          items: [
            { text: '遊びはじめる', link: '/play/' },
            { text: '操作マニュアル', link: '/manual/' },
          ],
        },
      ],
    },
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: {
      pattern: `${repo}/edit/main/website/:path`,
      text: 'このページを編集',
    },
    outline: { level: [2, 3], label: '目次' },
    docFooter: { prev: '前のページ', next: '次のページ' },
    lastUpdatedText: '最終更新',
    returnToTopLabel: 'トップへ戻る',
    darkModeSwitchLabel: 'テーマ',
    sidebarMenuLabel: 'メニュー',
  },
});
