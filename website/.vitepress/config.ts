import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig } from 'vitepress';

import { slugify } from './slugify.mjs';

const repo = 'https://github.com/Xelltis/udonarium_axe';
const base = '/udonarium_axe/';

// Social crawlers ignore relative URLs, so the deployed origin has to be
// spelled out here. Change it together with the Pages settings.
const siteUrl = `https://xelltis.github.io${base}`;
const siteName = 'Udonarium Axe';
const siteDescription = 'ブラウザで動くTRPGオンラインセッション支援ツールの利用ガイド';
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
    // The same slugify scripts/check-doc-anchors.mjs checks links against (see slugify.mjs).
    // The same function makes the ids and the page outline, so both move together.
    anchor: { slugify },
    config: (md) => {
      // A heading that starts with a step number ("1. …") is drawn as a numbered step. The number
      // stays in the heading's text, so its id and the outline keep it; only the dot is hidden.
      // This runs after the anchor plugin, so the ids are made from the heading as written.
      md.core.ruler.push('axe-step-headings', (state) => {
        const tokens = state.tokens;
        for (let i = 0; i < tokens.length - 1; i += 1) {
          const open = tokens[i];
          if (open.type !== 'heading_open' || (open.tag !== 'h2' && open.tag !== 'h3')) continue;
          const first = tokens[i + 1].children?.[0];
          const step = first?.type === 'text' ? first.content.match(/^(\d+)\.\s+/) : null;
          if (!first || !step) continue;
          open.attrJoin('class', 'axe-step');
          const badge = new state.Token('html_inline', '', 0);
          badge.content = `<span class="axe-step-number">${step[1]}<span class="axe-step-dot">.</span></span> `;
          first.content = first.content.slice(step[0].length);
          tokens[i + 1].children?.unshift(badge);
        }
      });

      // A short name in a table (a setting, a value, an error) breaks at its hyphens when its
      // column is narrow. Such names are kept on one line; a URL or a sentence in code still wraps.
      md.core.ruler.push('axe-table-code', (state) => {
        let inTable = false;
        for (const token of state.tokens) {
          if (token.type === 'table_open') inTable = true;
          if (token.type === 'table_close') inTable = false;
          if (!inTable || token.type !== 'inline') continue;
          for (const kid of token.children ?? []) {
            if (kid.type === 'code_inline' && kid.content.length <= 32 && !/\s/.test(kid.content)) {
              kid.attrJoin('class', 'axe-code-whole');
            }
          }
        }
      });

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
      { text: 'はじめに', link: '/start/', activeMatch: '^/start/' },
      { text: '操作マニュアル', link: '/manual/', activeMatch: '^/manual/' },
      { text: '困ったとき', link: '/help/', activeMatch: '^/help/' },
      { text: '設置ガイド', link: '/guide/', activeMatch: '^/guide/' },
      { text: 'リリースノート', link: '/release-notes/', activeMatch: '^/release-notes/' },
    ],
    sidebar: {
      '/start/': [
        { text: 'はじめに', link: '/start/' },
        { text: 'Axeでできること', link: '/start/features' },
        { text: '招待リンクで参加する', link: '/start/join' },
        { text: 'はじめてのセッション（GM）', link: '/start/first-session' },
        { text: '用語集', link: '/start/glossary' },
        { text: 'Udonarium Axeについて', link: '/start/about' },
      ],
      '/manual/': [
        { text: 'マニュアルの使いかた', link: '/manual/' },
        {
          text: '基本の操作',
          items: [
            { text: '画面の見かた', link: '/manual/screen' },
            { text: 'オブジェクトの基本操作', link: '/manual/objects' },
            { text: '視点とテーブル操作', link: '/manual/tabletop' },
            { text: 'キー操作の一覧', link: '/manual/shortcuts' },
            { text: 'PLツールバー', link: '/manual/pl-tools' },
            { text: 'ホットバー', link: '/manual/hotbar' },
            { text: 'スマートフォンで使う', link: '/manual/mobile' },
            { text: 'テーマ（配色と動き）', link: '/manual/theme' },
          ],
        },
        {
          text: '部屋と参加者',
          items: [
            { text: '部屋とロビー', link: '/manual/rooms' },
            { text: 'ロール（GM / PL / 見学）', link: '/manual/roles' },
            { text: '情報の公開範囲', link: '/manual/disclosure' },
            { text: '部屋設定', link: '/manual/room-settings' },
            { text: '接続が切れたとき', link: '/manual/connection' },
          ],
        },
        {
          text: 'キャラクター',
          items: [
            { text: 'キャラクターコマ', link: '/manual/character' },
            { text: 'シートの項目（データ要素）', link: '/manual/data-element' },
            { text: 'キャラクターの取り込み', link: '/manual/character-import' },
            { text: 'バフ／デバフ', link: '/manual/buff' },
            { text: '行動順', link: '/manual/turn-order' },
            { text: 'インベントリ', link: '/manual/inventory' },
          ],
        },
        {
          text: 'テーブルに置く物',
          items: [
            { text: 'カード', link: '/manual/cards' },
            { text: 'ダイス', link: '/manual/dice' },
            { text: '共有メモ', link: '/manual/notes' },
            { text: '射程範囲', link: '/manual/range' },
            { text: '地形', link: '/manual/terrain' },
            { text: 'マップマスク', link: '/manual/map-mask' },
            { text: 'ホワイトボード', link: '/manual/white-board' },
          ],
        },
        {
          text: 'テーブルの環境',
          items: [
            { text: 'テーブル設定', link: '/manual/table-setting' },
            { text: '暗闇・視界・光源', link: '/manual/vision-lighting' },
            { text: '水域と水中', link: '/manual/water' },
            { text: 'スイッチ', link: '/manual/switch' },
          ],
        },
        {
          text: '移動と戦闘',
          items: [
            { text: '移動範囲', link: '/manual/move-range' },
            { text: '交戦エリア', link: '/manual/engagement-zone' },
            { text: '乗り物に乗る', link: '/manual/ride' },
            { text: '同行（パーティ）', link: '/manual/party' },
            { text: 'ダンジョンドリィマスターモード', link: '/manual/dungeondry-master' },
          ],
        },
        {
          text: 'チャットとダイス',
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
          text: '演出と音',
          items: [
            { text: '画像', link: '/manual/images' },
            { text: 'ジュークボックス', link: '/manual/jukebox' },
            { text: 'DJデッキ', link: '/manual/dj-deck' },
            { text: '音の設定', link: '/manual/sound-settings' },
            { text: 'カットイン', link: '/manual/cut-in' },
            { text: 'マップ演出（エフェクト）', link: '/manual/map-effects' },
            { text: 'ビジュアルノベルモード', link: '/manual/visual-novel' },
          ],
        },
        {
          text: 'GMの道具',
          items: [
            { text: 'オブジェクト一覧（GM）', link: '/manual/gm-object-list' },
            { text: 'マップエディター', link: '/manual/map-editor' },
            { text: 'マップ生成', link: '/manual/map-generator' },
          ],
        },
        {
          text: '保存と記録',
          items: [
            { text: '保存と読み込み', link: '/manual/save-load' },
            { text: 'セッションログ（リプレイ）', link: '/manual/replay' },
            { text: 'ココフォリアのルーム取り込み（実験的）', link: '/manual/room-import' },
          ],
        },
      ],
      '/help/': [
        {
          text: '困ったとき',
          items: [
            { text: '遊んでいるときの困りごと', link: '/help/' },
            { text: '接続が切れたとき', link: '/manual/connection' },
            { text: '設置で困ったとき', link: '/guide/troubleshooting' },
          ],
        },
      ],
      '/guide/': [
        {
          text: '設置ガイド',
          items: [
            { text: '設置の流れ', link: '/guide/' },
            { text: '方式を選ぶ', link: '/guide/choose' },
            { text: '設置の準備', link: '/guide/requirements' },
            { text: 'サーバーを置く', link: '/guide/backend' },
            { text: 'Axeを置く', link: '/guide/quickstart' },
            { text: 'config.jsonを書く', link: '/guide/configuration' },
            { text: '更新するとき', link: '/guide/update' },
            { text: '設置で困ったとき', link: '/guide/troubleshooting' },
            { text: '設置のよくある質問', link: '/guide/faq' },
          ],
        },
      ],
      '/release-notes/': [
        {
          text: 'リリースノート',
          items: [
            { text: '一覧', link: '/release-notes/' },
            { text: 'v1.68.0', link: '/release-notes/v1.68.0' },
            { text: 'v1.67.0', link: '/release-notes/v1.67.0' },
            { text: 'v1.66.0', link: '/release-notes/v1.66.0' },
            { text: 'v1.65.2', link: '/release-notes/v1.65.2' },
            { text: 'v1.65.1', link: '/release-notes/v1.65.1' },
            { text: 'v1.65.0', link: '/release-notes/v1.65.0' },
            { text: 'v1.64.1', link: '/release-notes/v1.64.1' },
            { text: 'v1.64.0', link: '/release-notes/v1.64.0' },
            { text: 'v1.63.0', link: '/release-notes/v1.63.0' },
            { text: 'v1.62.3', link: '/release-notes/v1.62.3' },
            { text: 'v1.62.2', link: '/release-notes/v1.62.2' },
            { text: 'v1.62.1', link: '/release-notes/v1.62.1' },
            { text: 'v1.62.0', link: '/release-notes/v1.62.0' },
            { text: 'v1.61.1', link: '/release-notes/v1.61.1' },
            { text: 'v1.61.0', link: '/release-notes/v1.61.0' },
            { text: 'v1.60.0', link: '/release-notes/v1.60.0' },
            { text: 'v1.59.0', link: '/release-notes/v1.59.0' },
            { text: 'v1.58.0', link: '/release-notes/v1.58.0' },
            { text: 'v1.57.1', link: '/release-notes/v1.57.1' },
            { text: 'v1.57.0', link: '/release-notes/v1.57.0' },
            { text: 'v1.56.0', link: '/release-notes/v1.56.0' },
            { text: 'v1.55.0', link: '/release-notes/v1.55.0' },
            { text: 'v1.54.0', link: '/release-notes/v1.54.0' },
            { text: 'v1.53.0', link: '/release-notes/v1.53.0' },
            { text: 'v1.52.0', link: '/release-notes/v1.52.0' },
            { text: 'v1.51.0', link: '/release-notes/v1.51.0' },
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
    },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '検索', buttonAriaLabel: '検索' },
          modal: {
            displayDetails: '詳しく表示',
            resetButtonTitle: '検索を消す',
            backButtonTitle: '閉じる',
            noResultsText: '見つかりませんでした',
            footer: { selectText: '開く', navigateText: '選ぶ', closeText: '閉じる' },
          },
        },
      },
    },
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
