import type { RichChatLogStyle } from '@axe/domain/chat/chat-log-style';

export const CHAT_LOG_BASE_CSS = `
:root{--gap:2px;--msg-pad:10px 14px;--msg-bg:transparent;--radius:6px;--radius-sm:4px;--pt-radius:50%;--pt-border:0;--head-bg:var(--paper);--head-border:1px solid var(--line);--head-shadow:none;--title:var(--ink);--name-mix:85%;--oc-ink:#fff;--flavor:none}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-body);font-size:15px;line-height:1.85;-webkit-font-smoothing:antialiased}
[hidden]{display:none!important}
.log{--pt:48px;max-width:860px;margin:0 auto;padding:56px 28px 72px}
.head{position:relative;margin:0 0 36px;padding:36px 28px 30px;text-align:center;background:var(--head-bg);border:var(--head-border);border-radius:var(--radius);box-shadow:var(--head-shadow)}
.head::before{content:var(--flavor);display:block;margin-bottom:12px;color:var(--accent);font-family:var(--font-mono);font-size:11px;letter-spacing:.42em}
.kicker{margin:0 0 6px;color:var(--muted);font-size:13px;letter-spacing:.14em}
.title{margin:0;color:var(--title);font-family:var(--font-head);font-size:clamp(26px,4.6vw,40px);font-weight:700;line-height:1.3;letter-spacing:.08em;overflow-wrap:anywhere}
.meta{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 20px;margin:14px 0 0;color:var(--muted);font-family:var(--font-mono);font-size:12.5px;letter-spacing:.04em}
.msg,.cast li{--name:color-mix(in oklab,var(--c) var(--name-mix),var(--ink))}
.cast{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:18px 0 0;padding:0;list-style:none}
.cast li{display:inline-flex;align-items:center;gap:7px;padding:1px 11px;border:1px solid var(--line);border-radius:999px;background:var(--chip);font-size:12.5px;line-height:1.9}
.cast li::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--c)}
.tabs{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:20px 0 0}
.tabs button{padding:3px 13px;border:1px solid var(--line);border-radius:999px;background:transparent;color:var(--muted);font:inherit;font-size:12.5px;cursor:pointer}
.tabs button:hover{border-color:var(--accent);color:var(--ink)}
.tabs button[aria-pressed="true"]{border-color:var(--accent);background:var(--accent);color:var(--accent-ink)}
.body{display:flex;flex-direction:column;gap:var(--gap)}
.day{display:flex;align-items:center;gap:16px;margin:26px 0 10px;color:var(--muted);font-family:var(--font-mono);font-size:12px;letter-spacing:.24em}
.day::before,.day::after{content:"";flex:1;height:1px;background:var(--line)}
.msg{position:relative;display:grid;grid-template-columns:var(--pt) minmax(0,1fr);gap:0 14px;padding:var(--msg-pad);background:var(--msg-bg);border-radius:var(--radius)}
.msg.cont{padding-top:0}
.cont .pt{height:0;visibility:hidden}
.cont .hd{display:none}
.pt{display:grid;place-items:center;width:var(--pt);height:var(--pt);overflow:hidden;border:var(--pt-border);border-radius:var(--pt-radius);background:var(--chip)}
.pt img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 0}
.ini{color:var(--name);font-family:var(--font-head);font-size:calc(var(--pt) * .42);font-weight:700}
.bd{min-width:0}
.hd{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;margin:0 0 2px}
.nm{color:var(--name);font-family:var(--font-head);font-weight:700;letter-spacing:.04em}
.tg{padding:0 8px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:11px;line-height:1.7}
.hd time{margin-left:auto;color:var(--muted);font-family:var(--font-mono);font-size:11.5px;letter-spacing:.04em}
.tx{overflow-wrap:anywhere}
.tx rt{font-size:.5em}
.ed{margin-left:8px;color:var(--muted);font-size:11px}
.ref{display:flex;gap:8px;max-width:100%;margin:4px 0 6px;padding:5px 12px;border-left:3px solid var(--accent);border-radius:0 var(--radius-sm) var(--radius-sm) 0;background:var(--quote-bg);color:var(--muted);font-size:13px;line-height:1.6}
.rn{flex:none;font-weight:700}
.rt{display:-webkit-box;min-width:0;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.att{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.att img{display:block;max-width:min(100%,320px);max-height:260px;border:1px solid var(--line);border-radius:var(--radius-sm)}
.ooc{opacity:.7}
.ooc .tx{font-size:.92em}
.seal{color:var(--muted);letter-spacing:.2em}
.sys{margin:8px 0;padding:0 8%;color:var(--muted);font-size:12.5px;line-height:1.7;text-align:center}
.sys span{display:inline-block;padding:3px 16px;border-radius:999px;background:var(--chip)}
.roll{grid-template-columns:24px minmax(0,1fr);gap:0 10px;margin-left:calc(var(--pt) + 14px);padding:8px 14px;background:var(--roll-bg);border:var(--roll-border);border-radius:var(--radius-sm)}
.roll .pt{width:24px;height:24px;border:0;border-radius:0;background:none;color:var(--accent)}
.roll .pt svg{width:22px;height:22px}
.roll .tx{font-family:var(--font-mono);font-size:13.5px;line-height:1.7}
.res{padding:0 2px;color:var(--ink);font-size:1.3em;font-weight:700}
.crit{--oc:var(--crit)}
.fumble{--oc:var(--fumble)}
.ok{--oc:var(--ok)}
.ng{--oc:var(--ng)}
.crit .res,.fumble .res{color:var(--oc)}
.oc{padding:0 9px;border-radius:999px;background:var(--oc);color:var(--oc-ink);font-size:11px;font-weight:700;letter-spacing:.1em;line-height:1.8}
.foot{margin-top:56px;color:var(--muted);font-size:11.5px;letter-spacing:.12em;text-align:center}
@media (max-width:640px){.log{--pt:38px;padding:24px 12px 48px}.head{padding:26px 16px 22px}.msg{gap:0 10px}.roll{margin-left:0}}
@media print{
:root{color-scheme:light;--bg:#fff!important;--paper:#fff!important;--ink:#111!important;--muted:#555!important;--line:#ccc!important;--chip:#f2f2f2!important;--quote-bg:#f5f5f5!important;--roll-bg:#fff!important;--roll-border:1px solid #ccc!important;--head-bg:#fff!important;--head-shadow:none!important;--msg-bg:transparent!important;--title:#111!important}
body{background:#fff!important;text-shadow:none!important}
body::before,body::after{display:none!important}
.log{margin:0 auto!important;background:#fff!important;box-shadow:none!important}
.title{background:none!important;color:#111!important;text-shadow:none!important;filter:none!important}
.tabs{display:none}
.msg,.sys{break-inside:avoid}
}
`;

const SERIF = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP","Noto Serif CJK JP",serif';
const SANS = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI","Noto Sans JP","Meiryo",system-ui,sans-serif';
const MONO = '"SFMono-Regular","Cascadia Mono",Consolas,Menlo,"Osaka-Mono","MS Gothic",monospace';
const TYPEWRITER = '"Courier New",Courier,"Osaka-Mono","MS Gothic",monospace';

const PARCHMENT = `
:root{--bg:#2b1d12;--paper:#f2e4c4;--ink:#3b2b1c;--muted:#80684a;--line:#cdb48a;--accent:#8a3b1f;--accent-ink:#fbf1dc;--chip:rgba(138,90,40,.1);--quote-bg:rgba(138,90,40,.08);--roll-bg:rgba(255,250,236,.55);--roll-border:1px dashed #bda274;--crit:#a87412;--fumble:#8e1c1c;--ok:#52692d;--ng:#7a6a58;--font-body:${SERIF};--font-head:${SERIF};--font-mono:${SERIF};--flavor:"❦\\2003 CHRONICLE\\2003 ❦";--head-bg:transparent;--head-border:0;--pt-border:2px solid #cdb48a;--name-mix:82%;--gap:4px}
body{background:radial-gradient(ellipse at 50% 30%,#5b4029 0%,#2b1d12 70%,#1a110a 100%) fixed}
.log{margin:48px auto;background-color:var(--paper);background-image:radial-gradient(circle at 18% 12%,rgba(255,255,255,.45),transparent 42%),radial-gradient(circle at 82% 88%,rgba(120,78,30,.16),transparent 46%),radial-gradient(ellipse at 50% 50%,transparent 62%,rgba(105,66,28,.28) 100%);border-radius:3px;box-shadow:0 0 0 1px #b89a6a,0 0 0 7px #efe0bd,0 0 0 8px #9c7d50,0 24px 70px rgba(0,0,0,.55)}
.head{margin-bottom:28px;border-bottom:3px double var(--line);border-radius:0}
.title{font-size:clamp(28px,5vw,44px);letter-spacing:.12em;text-shadow:0 1px 0 rgba(255,255,255,.5)}
.kicker{font-style:italic}
.day{letter-spacing:.3em}
.day span::before{content:"❧ "}
.pt{box-shadow:0 2px 6px rgba(80,50,20,.25)}
.nm{letter-spacing:.08em}
.tx{font-size:15.5px}
.oc{padding:1px 10px;background:radial-gradient(circle at 35% 30%,color-mix(in oklab,var(--oc) 65%,#fff),var(--oc) 60%,color-mix(in oklab,var(--oc) 70%,#000));box-shadow:0 1px 2px rgba(60,30,10,.4),inset 0 0 0 1px rgba(0,0,0,.15);text-shadow:0 1px 0 rgba(0,0,0,.25)}
.sys span{background:transparent;font-style:italic}
.foot::before{content:"— ✦ —";display:block;margin-bottom:8px;color:var(--line);letter-spacing:.3em}
@media (max-width:640px){.log{margin:0;border-radius:0;box-shadow:none}}
`;

const EERIE = `
:root{color-scheme:dark;--bg:#0a0b0b;--paper:#121514;--ink:#cdd2cb;--muted:#7b847a;--line:#262c29;--accent:#9a2a2a;--accent-ink:#f4eaea;--chip:rgba(255,255,255,.035);--quote-bg:rgba(255,255,255,.03);--roll-bg:rgba(8,10,9,.7);--roll-border:1px solid #262c29;--crit:#a9cfa6;--fumble:#d0303a;--ok:#7f9c80;--ng:#666c66;--font-body:${SERIF};--font-head:${SERIF};--font-mono:${TYPEWRITER};--flavor:"— CASE FILE —";--head-bg:linear-gradient(180deg,#151918,#0e1110);--head-shadow:inset 0 0 80px rgba(0,0,0,.7);--radius:2px;--radius-sm:2px;--pt-radius:2px;--pt-border:1px solid #2e3531;--name-mix:50%;--msg-pad:12px 14px}
body{background:radial-gradient(ellipse at 50% -10%,#1d2220 0%,#0a0b0b 55%,#040404 100%) fixed}
body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,.7) 100%)}
.head::after{content:"";position:absolute;right:28px;bottom:0;left:28px;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent)}
.title{font-weight:600;letter-spacing:.2em;text-shadow:0 0 22px rgba(154,42,42,.55),0 0 2px rgba(0,0,0,.9)}
.pt img{filter:grayscale(.6) sepia(.15) contrast(1.1) brightness(.85);transition:filter .4s}
.msg:hover .pt img{filter:none}
.msg{border-left:1px solid transparent;transition:background .3s,border-color .3s}
.msg:hover{border-left-color:var(--accent);background:rgba(255,255,255,.02)}
.nm{letter-spacing:.12em}
.roll{border-left:2px solid var(--accent)}
.roll .pt{color:var(--muted)}
.oc{border:1px solid var(--oc);border-radius:0;background:transparent;color:var(--oc);font-family:var(--font-mono);letter-spacing:.24em}
.crit .res{text-shadow:0 0 12px rgba(169,207,166,.6)}
.fumble .res{text-shadow:0 0 10px rgba(208,48,58,.8),0 0 2px #000}
.day{color:#5c645b}
.sys span{border:1px dashed var(--line);border-radius:0;background:transparent;font-family:var(--font-mono);letter-spacing:.08em}
::selection{background:#9a2a2a;color:#fff}
`;

const NEON = `
:root{color-scheme:dark;--bg:#05070f;--paper:rgba(9,16,34,.78);--ink:#dce8ff;--muted:#7d90b5;--line:rgba(64,196,255,.24);--accent:#2bd4ff;--accent-ink:#03121a;--chip:rgba(43,212,255,.08);--quote-bg:rgba(43,212,255,.06);--roll-bg:rgba(6,12,28,.88);--roll-border:1px solid rgba(43,212,255,.38);--crit:#2effc8;--fumble:#ff2f8e;--ok:#2bd4ff;--ng:#66779a;--font-body:${SANS};--font-head:${SANS};--font-mono:${MONO};--flavor:"// SESSION_LOG";--head-border:1px solid rgba(43,212,255,.35);--head-shadow:inset 0 0 40px rgba(43,212,255,.08);--radius:0;--radius-sm:0;--pt-radius:0;--pt-border:1px solid rgba(43,212,255,.55);--name-mix:42%;--oc-ink:#03121a;--gap:6px;--msg-bg:linear-gradient(90deg,rgba(43,212,255,.06),transparent 55%)}
body{background:radial-gradient(ellipse at 15% -10%,rgba(255,47,142,.22),transparent 50%),radial-gradient(ellipse at 90% 110%,rgba(43,212,255,.2),transparent 55%),linear-gradient(rgba(43,212,255,.045) 1px,transparent 1px) 0 0/100% 28px,linear-gradient(90deg,rgba(43,212,255,.045) 1px,transparent 1px) 0 0/28px 100%,#05070f;background-attachment:fixed}
.head::after{content:"";position:absolute;inset:-1px;pointer-events:none;background:linear-gradient(var(--accent),var(--accent)) 0 0/20px 2px no-repeat,linear-gradient(var(--accent),var(--accent)) 0 0/2px 20px no-repeat,linear-gradient(var(--accent),var(--accent)) 100% 100%/20px 2px no-repeat,linear-gradient(var(--accent),var(--accent)) 100% 100%/2px 20px no-repeat}
.title{font-weight:800;letter-spacing:.14em;text-shadow:0 0 14px rgba(43,212,255,.65),2px 0 rgba(255,47,142,.55),-2px 0 rgba(43,212,255,.55)}
.kicker{color:var(--accent);font-family:var(--font-mono)}
.msg{border-left:2px solid color-mix(in oklab,var(--c) 45%,var(--accent))}
.nm{text-shadow:0 0 10px color-mix(in oklab,var(--c) 35%,var(--accent))}
.hd time::before{content:"["}
.hd time::after{content:"]"}
.pt{box-shadow:0 0 14px rgba(43,212,255,.28)}
.roll{border-left:2px solid var(--accent);box-shadow:inset 0 0 24px rgba(43,212,255,.08),0 0 18px rgba(43,212,255,.08)}
.res{text-shadow:0 0 12px currentColor}
.oc{border-radius:0;font-family:var(--font-mono);box-shadow:0 0 12px var(--oc)}
.day{color:var(--accent)}
.day::before{background:linear-gradient(90deg,transparent,var(--line))}
.day::after{background:linear-gradient(90deg,var(--line),transparent)}
.cast li,.tabs button,.tg,.ref{border-radius:0}
.cast li::before{border-radius:0;box-shadow:0 0 6px var(--c)}
.sys span{border:1px solid var(--line);border-radius:0;background:rgba(43,212,255,.06);font-family:var(--font-mono)}
::selection{background:#ff2f8e;color:#fff}
`;

const WASHI = `
:root{--bg:#e8e0cf;--paper:#fbf8f0;--ink:#2a2521;--muted:#7d7166;--line:#dcd1bd;--accent:#b52b2e;--accent-ink:#fff8f0;--chip:rgba(42,37,33,.05);--quote-bg:rgba(181,43,46,.05);--roll-bg:#fffdf8;--roll-border:1px solid #dcd1bd;--crit:#b52b2e;--fumble:#2a2521;--ok:#35557a;--ng:#8b8074;--font-body:${SERIF};--font-head:${SERIF};--font-mono:${SERIF};--head-bg:transparent;--head-border:0;--radius:0;--radius-sm:0;--pt-radius:3px;--pt-border:1px solid #cfc3ad;--msg-pad:14px 16px;--gap:0}
body{background-color:#e8e0cf;background-image:repeating-linear-gradient(118deg,rgba(110,90,60,.035) 0 1px,transparent 1px 7px),repeating-linear-gradient(28deg,rgba(110,90,60,.03) 0 1px,transparent 1px 11px)}
.log{margin:48px auto;background:var(--paper);border-top:5px solid var(--accent);box-shadow:0 1px 0 #d6cbb6,0 22px 50px rgba(80,60,30,.14)}
.head{border-bottom:1px solid var(--line);border-radius:0}
.head::before{content:"記録";display:inline-block;margin-bottom:16px;padding:8px 5px;border:2px solid var(--accent);border-radius:4px;color:var(--accent);font-family:var(--font-head);font-size:14px;font-weight:700;letter-spacing:.25em;writing-mode:vertical-rl;transform:rotate(-5deg);opacity:.9}
.title{font-weight:600;letter-spacing:.24em}
.msg{border-top:1px solid rgba(220,209,189,.7)}
.msg.cont,.day+.msg{border-top:0}
.nm{letter-spacing:.14em}
.ini{font-weight:600}
.roll{margin-top:4px;margin-bottom:8px;border-left:3px solid var(--accent)}
.oc{padding:0 7px;border:2px solid var(--oc);border-radius:4px;background:transparent;color:var(--oc);font-family:var(--font-head);letter-spacing:.14em;transform:rotate(-4deg)}
.day span::before{content:"〜 "}
.day span::after{content:" 〜"}
.sys span{border-top:1px solid var(--line);border-bottom:1px solid var(--line);border-radius:0;background:transparent;letter-spacing:.1em}
.foot::before{content:"";display:block;width:34px;height:34px;margin:0 auto 10px;border:2px solid var(--accent);border-radius:50%;opacity:.7}
@media (max-width:640px){.log{margin:0;box-shadow:none}}
`;

const MESSENGER = `
:root{--bg:#dfe5ec;--paper:#ffffff;--ink:#1e2733;--muted:#6a7686;--line:#d3dae3;--accent:#2f6fed;--accent-ink:#fff;--chip:#eef2f7;--quote-bg:rgba(255,255,255,.6);--roll-bg:#fff;--roll-border:0;--crit:#d98b00;--fumble:#e0245e;--ok:#12a36e;--ng:#8a95a5;--font-body:${SANS};--font-head:${SANS};--font-mono:${SANS};--head-bg:rgba(255,255,255,.9);--head-border:0;--head-shadow:0 10px 30px rgba(30,39,51,.08);--radius:20px;--radius-sm:14px;--name-mix:78%;--gap:6px;--msg-pad:0}
body{background:linear-gradient(180deg,#e8edf3 0%,#d9e0e9 100%) fixed}
.log{max-width:760px}
.head{border-radius:22px}
.title{font-size:clamp(22px,4vw,30px);letter-spacing:.04em}
.hd{margin:0 0 3px 4px;font-size:12px}
.nm{font-size:12.5px;letter-spacing:.02em}
.hd time{margin-left:0}
.tx{display:inline-block;max-width:100%;padding:9px 15px;border-radius:4px 18px 18px 18px;background:color-mix(in oklab,var(--c) 6%,#fff);box-shadow:0 1px 2px rgba(30,39,51,.1);line-height:1.7}
.cont .tx{border-radius:18px}
.ref{margin:0 0 4px;padding:6px 12px;border-left:0;border-radius:12px}
.att img{border:0;border-radius:14px;box-shadow:0 1px 3px rgba(30,39,51,.15)}
.roll{width:fit-content;max-width:calc(100% - var(--pt) - 14px);padding:9px 15px;border-radius:16px;box-shadow:0 1px 2px rgba(30,39,51,.1)}
.roll .tx{display:block;padding:0;border-radius:0;background:none;box-shadow:none}
.day{justify-content:center;font-family:var(--font-body);letter-spacing:.08em}
.day::before,.day::after{display:none}
.day span{padding:2px 14px;border-radius:999px;background:rgba(30,39,51,.28);color:#fff;font-size:11.5px}
.sys span{background:rgba(30,39,51,.08);font-size:12px}
.oc{letter-spacing:.04em}
@media (max-width:640px){.roll{max-width:100%}}
`;

export const CHAT_LOG_THEME_CSS: Readonly<Record<RichChatLogStyle, string>> = {
  parchment: PARCHMENT,
  washi: WASHI,
  eerie: EERIE,
  neon: NEON,
  messenger: MESSENGER,
};
