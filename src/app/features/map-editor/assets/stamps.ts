import { StampCategory, StampDef } from '@axe/features/map-editor/assets/stamp-types';

export const STAMPS: StampDef[] = [
  {
    id: 'door-single',
    category: 'door',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="10" width="60" height="80"/><circle cx="68" cy="52" r="4" fill="currentColor" stroke="none"/><line x1="20" y1="90" x2="80" y2="90"/></svg>',
  },
  {
    id: 'door-double',
    category: 'door',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="10" width="37" height="80"/><rect x="53" y="10" width="37" height="80"/><circle cx="44" cy="52" r="4" fill="currentColor" stroke="none"/><circle cx="56" cy="52" r="4" fill="currentColor" stroke="none"/><line x1="10" y1="90" x2="90" y2="90"/></svg>',
  },
  {
    id: 'door-open',
    category: 'door',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><line x1="20" y1="10" x2="20" y2="90"/><line x1="20" y1="90" x2="80" y2="90"/><path d="M20 10 Q70 10 70 55" /><circle cx="65" cy="42" r="4" fill="currentColor" stroke="none"/></svg>',
  },
  {
    id: 'door-portcullis',
    category: 'door',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="15" y="10" width="70" height="80"/><line x1="35" y1="10" x2="35" y2="90"/><line x1="55" y1="10" x2="55" y2="90"/><line x1="75" y1="10" x2="75" y2="90"/><line x1="15" y1="35" x2="85" y2="35"/><line x1="15" y1="60" x2="85" y2="60"/><line x1="35" y1="90" x2="32" y2="100"/><line x1="55" y1="90" x2="52" y2="100"/><line x1="75" y1="90" x2="72" y2="100"/></svg>',
  },
  {
    id: 'door-secret',
    category: 'door',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="15" y="10" width="70" height="80"/><line x1="15" y1="30" x2="85" y2="30"/><line x1="15" y1="50" x2="85" y2="50"/><line x1="15" y1="70" x2="85" y2="70"/><text x="50" y="48" text-anchor="middle" dominant-baseline="middle" font-size="18" stroke="none" fill="currentColor" font-family="sans-serif">?</text></svg>',
  },
  {
    id: 'door-archway',
    category: 'door',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><line x1="15" y1="90" x2="15" y2="50"/><line x1="85" y1="90" x2="85" y2="50"/><path d="M15 50 Q15 10 50 10 Q85 10 85 50"/><line x1="10" y1="90" x2="90" y2="90"/></svg>',
  },
  {
    id: 'stair-up',
    category: 'stair',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><polyline points="10,90 10,70 30,70 30,50 50,50 50,30 70,30 70,10 90,10"/><line x1="10" y1="90" x2="90" y2="90"/><polyline points="60,18 70,10 80,18"/></svg>',
  },
  {
    id: 'stair-down',
    category: 'stair',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><polyline points="10,10 10,30 30,30 30,50 50,50 50,70 70,70 70,90 90,90"/><line x1="10" y1="10" x2="90" y2="10"/><polyline points="60,82 70,90 80,82"/></svg>',
  },
  {
    id: 'stair-spiral',
    category: 'stair',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="35"/><circle cx="50" cy="50" r="10"/><path d="M50 15 A35 35 0 1 1 49 15"/><line x1="50" y1="15" x2="50" y2="40"/><line x1="85" y1="50" x2="60" y2="50"/></svg>',
  },
  {
    id: 'stair-ladder',
    category: 'stair',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><line x1="30" y1="10" x2="30" y2="90"/><line x1="70" y1="10" x2="70" y2="90"/><line x1="30" y1="28" x2="70" y2="28"/><line x1="30" y1="46" x2="70" y2="46"/><line x1="30" y1="64" x2="70" y2="64"/><line x1="30" y1="82" x2="70" y2="82"/></svg>',
  },
  {
    id: 'stair-ramp',
    category: 'stair',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="90" x2="90" y2="10"/><line x1="10" y1="90" x2="90" y2="90"/><line x1="90" y1="10" x2="90" y2="90"/><line x1="25" y1="75" x2="75" y2="25"/></svg>',
  },
  {
    id: 'furniture-table',
    category: 'furniture',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="30" width="80" height="40"/><line x1="20" y1="70" x2="20" y2="90"/><line x1="80" y1="70" x2="80" y2="90"/></svg>',
  },
  {
    id: 'furniture-chair',
    category: 'furniture',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="25" y="40" width="50" height="35"/><line x1="25" y1="75" x2="25" y2="95"/><line x1="75" y1="75" x2="75" y2="95"/><line x1="25" y1="40" x2="25" y2="10"/><line x1="75" y1="40" x2="75" y2="10"/><line x1="25" y1="20" x2="75" y2="20"/></svg>',
  },
  {
    id: 'furniture-bed',
    category: 'furniture',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="20" width="80" height="60"/><rect x="10" y="20" width="80" height="20"/><line x1="10" y1="50" x2="90" y2="50"/><circle cx="50" cy="35" r="10"/></svg>',
  },
  {
    id: 'furniture-chest',
    category: 'furniture',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="35" width="80" height="50"/><path d="M10 55 Q10 35 50 35 Q90 35 90 55"/><line x1="10" y1="55" x2="90" y2="55"/><rect x="42" y="48" width="16" height="14"/><circle cx="50" cy="55" r="3" fill="currentColor" stroke="none"/></svg>',
  },
  {
    id: 'furniture-bookshelf',
    category: 'furniture',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="10" width="80" height="80"/><line x1="10" y1="35" x2="90" y2="35"/><line x1="10" y1="60" x2="90" y2="60"/><line x1="28" y1="10" x2="28" y2="35"/><line x1="46" y1="10" x2="46" y2="35"/><line x1="64" y1="10" x2="64" y2="35"/><line x1="25" y1="35" x2="25" y2="60"/><line x1="50" y1="35" x2="50" y2="60"/><line x1="75" y1="35" x2="75" y2="60"/><line x1="32" y1="60" x2="32" y2="90"/><line x1="58" y1="60" x2="58" y2="90"/></svg>',
  },
  {
    id: 'furniture-barrel',
    category: 'furniture',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="50" cy="20" rx="30" ry="10"/><ellipse cx="50" cy="80" rx="30" ry="10"/><line x1="20" y1="20" x2="20" y2="80"/><line x1="80" y1="20" x2="80" y2="80"/><path d="M18 40 Q50 46 82 40"/><path d="M18 60 Q50 66 82 60"/></svg>',
  },
  {
    id: 'furniture-fireplace',
    category: 'furniture',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="60" width="80" height="30"/><rect x="10" y="10" width="20" height="50"/><rect x="70" y="10" width="20" height="50"/><rect x="10" y="10" width="80" height="12"/><path d="M50 55 Q40 45 45 30 Q50 40 55 30 Q60 45 50 55Z" fill="#e85c00" stroke="none"/><path d="M42 55 Q34 42 38 28 Q43 38 48 28 Q53 42 42 55Z" fill="#f5a623" stroke="none"/></svg>',
  },
  {
    id: 'furniture-throne',
    category: 'furniture',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="25" y="45" width="50" height="35"/><line x1="25" y1="80" x2="25" y2="95"/><line x1="75" y1="80" x2="75" y2="95"/><line x1="25" y1="45" x2="25" y2="10"/><line x1="75" y1="45" x2="75" y2="10"/><line x1="25" y1="10" x2="75" y2="10"/><polyline points="25,10 30,25 50,15 70,25 75,10"/></svg>',
  },
  {
    id: 'furniture-crate',
    category: 'furniture',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="10" width="80" height="80"/><line x1="10" y1="10" x2="90" y2="90"/><line x1="90" y1="10" x2="10" y2="90"/><line x1="10" y1="50" x2="90" y2="50"/><line x1="50" y1="10" x2="50" y2="90"/></svg>',
  },
  {
    id: 'furniture-desk',
    category: 'furniture',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="30" width="80" height="10"/><rect x="10" y="40" width="30" height="45"/><line x1="80" y1="40" x2="80" y2="85"/><line x1="10" y1="85" x2="90" y2="85"/><rect x="45" y="42" width="30" height="20"/></svg>',
  },
  {
    id: 'nature-tree',
    category: 'nature',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><line x1="50" y1="60" x2="50" y2="90"/><ellipse cx="50" cy="40" rx="30" ry="28"/></svg>',
  },
  {
    id: 'nature-pine',
    category: 'nature',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><line x1="50" y1="72" x2="50" y2="92"/><polygon points="50,8 15,55 35,55 10,78 90,78 65,55 85,55"/></svg>',
  },
  {
    id: 'nature-bush',
    category: 'nature',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><circle cx="30" cy="55" r="20"/><circle cx="50" cy="45" r="22"/><circle cx="70" cy="55" r="20"/><line x1="20" y1="75" x2="80" y2="75"/></svg>',
  },
  {
    id: 'nature-rock',
    category: 'nature',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 75 Q15 55 30 40 Q45 28 60 35 Q80 30 85 50 Q92 65 80 75Z"/><line x1="15" y1="75" x2="90" y2="75"/></svg>',
  },
  {
    id: 'nature-boulder',
    category: 'nature',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 80 Q10 50 30 28 Q50 10 72 22 Q92 35 90 60 Q88 80 70 85Z"/><line x1="10" y1="80" x2="95" y2="80"/><path d="M35 35 Q30 50 38 62"/></svg>',
  },
  {
    id: 'nature-well',
    category: 'nature',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="50" cy="50" rx="30" ry="12"/><line x1="20" y1="50" x2="20" y2="70"/><line x1="80" y1="50" x2="80" y2="70"/><ellipse cx="50" cy="70" rx="30" ry="12"/><line x1="20" y1="28" x2="20" y2="50"/><line x1="80" y1="28" x2="80" y2="50"/><line x1="10" y1="28" x2="90" y2="28"/><line x1="50" y1="10" x2="50" y2="28"/><line x1="40" y1="22" x2="60" y2="38"/></svg>',
  },
  {
    id: 'nature-pond',
    category: 'nature',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="50" cy="55" rx="38" ry="25"/><path d="M32 50 Q40 42 50 50 Q60 58 68 50"/><path d="M35 60 Q43 52 53 60"/></svg>',
  },
  {
    id: 'nature-mushroom',
    category: 'nature',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="38" y="55" width="24" height="30" rx="4"/><path d="M15 55 Q15 15 50 15 Q85 15 85 55Z"/><circle cx="38" cy="35" r="5" fill="currentColor" stroke="none"/><circle cx="60" cy="30" r="4" fill="currentColor" stroke="none"/><circle cx="68" cy="46" r="4" fill="currentColor" stroke="none"/></svg>',
  },
  {
    id: 'nature-stump',
    category: 'nature',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="50" cy="40" rx="32" ry="15"/><line x1="18" y1="40" x2="18" y2="70"/><line x1="82" y1="40" x2="82" y2="70"/><ellipse cx="50" cy="70" rx="32" ry="15"/><circle cx="50" cy="40" r="14"/><path d="M42 32 Q50 28 58 32"/></svg>',
  },
  {
    id: 'dungeon-pillar',
    category: 'dungeon',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="35" y="18" width="30" height="64"/><rect x="28" y="10" width="44" height="14"/><rect x="28" y="76" width="44" height="14"/></svg>',
  },
  {
    id: 'dungeon-statue',
    category: 'dungeon',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="35" y="80" width="30" height="12"/><line x1="50" y1="68" x2="50" y2="80"/><rect x="38" y="55" width="24" height="18"/><line x1="38" y1="65" x2="20" y2="55"/><line x1="62" y1="65" x2="80" y2="55"/><circle cx="50" cy="45" r="12"/></svg>',
  },
  {
    id: 'dungeon-altar',
    category: 'dungeon',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="60" width="80" height="25"/><rect x="20" y="45" width="60" height="20"/><line x1="35" y1="30" x2="35" y2="45"/><line x1="65" y1="30" x2="65" y2="45"/><line x1="30" y1="30" x2="70" y2="30"/></svg>',
  },
  {
    id: 'dungeon-brazier',
    category: 'dungeon',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M50 52 Q38 42 42 26 Q48 36 52 26 Q56 36 58 26 Q62 42 50 52Z" fill="#e85c00" stroke="none"/><ellipse cx="50" cy="54" rx="20" ry="8"/><line x1="50" y1="62" x2="50" y2="80"/><polyline points="30,80 35,72 65,72 70,80"/><line x1="25" y1="80" x2="75" y2="80"/></svg>',
  },
  {
    id: 'dungeon-trap',
    category: 'dungeon',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="35"/><line x1="50" y1="15" x2="50" y2="85"/><line x1="15" y1="50" x2="85" y2="50"/><line x1="25" y1="25" x2="75" y2="75"/><line x1="75" y1="25" x2="25" y2="75"/><circle cx="50" cy="50" r="8" fill="currentColor"/></svg>',
  },
  {
    id: 'dungeon-lever',
    category: 'dungeon',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="30" y="70" width="40" height="20" rx="4"/><circle cx="50" cy="70" r="8"/><line x1="50" y1="62" x2="30" y2="25"/><circle cx="28" cy="22" r="8"/></svg>',
  },
  {
    id: 'dungeon-cage',
    category: 'dungeon',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="20" y="15" width="60" height="70"/><line x1="35" y1="15" x2="35" y2="85"/><line x1="50" y1="15" x2="50" y2="85"/><line x1="65" y1="15" x2="65" y2="85"/><line x1="20" y1="40" x2="80" y2="40"/><line x1="20" y1="65" x2="80" y2="65"/><line x1="20" y1="15" x2="80" y2="15"/><line x1="20" y1="85" x2="80" y2="85"/></svg>',
  },
  {
    id: 'dungeon-sarcophagus',
    category: 'dungeon',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M25 85 L15 55 L20 15 L80 15 L85 55 L75 85Z"/><path d="M35 80 L28 52 L32 22 L68 22 L72 52 L65 80Z"/><line x1="50" y1="22" x2="50" y2="80"/><line x1="28" y1="52" x2="72" y2="52"/></svg>',
  },
  {
    id: 'dungeon-rubble',
    category: 'dungeon',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><polygon points="15,80 25,55 40,65 35,40 55,50 50,30 70,45 65,60 85,55 90,80"/><polygon points="20,80 30,65 45,72"/><polygon points="55,80 65,60 78,70 85,80"/></svg>',
  },
  {
    id: 'marker-pin',
    category: 'marker',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M50 90 L50 50"/><circle cx="50" cy="32" r="22" fill="currentColor"/><text x="50" y="38" text-anchor="middle" dominant-baseline="middle" font-size="22" stroke="none" fill="white" font-weight="bold" font-family="sans-serif">1</text></svg>',
  },
  {
    id: 'marker-x',
    category: 'marker',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><line x1="15" y1="15" x2="85" y2="85"/><line x1="85" y1="15" x2="15" y2="85"/></svg>',
  },
  {
    id: 'marker-star',
    category: 'marker',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polygon points="50,8 61,36 92,36 68,56 77,84 50,66 23,84 32,56 8,36 39,36"/></svg>',
  },
  {
    id: 'marker-arrow',
    category: 'marker',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><line x1="15" y1="50" x2="80" y2="50"/><polyline points="58,28 82,50 58,72"/></svg>',
  },
  {
    id: 'marker-skull',
    category: 'marker',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 60 Q18 30 50 22 Q82 30 80 60 Q80 72 68 74 L68 85 L32 85 L32 74 Q20 72 20 60Z"/><circle cx="38" cy="52" r="9"/><circle cx="62" cy="52" r="9"/><line x1="44" y1="74" x2="44" y2="85"/><line x1="56" y1="74" x2="56" y2="85"/></svg>',
  },
  {
    id: 'marker-flag',
    category: 'marker',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><line x1="25" y1="10" x2="25" y2="90"/><polygon points="25,10 80,25 25,45" fill="currentColor"/></svg>',
  },
  {
    id: 'marker-exclamation',
    category: 'marker',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="none"><circle cx="50" cy="50" r="45"/><rect x="44" y="18" width="12" height="42" rx="4" fill="white"/><circle cx="50" cy="74" r="7" fill="white"/></svg>',
  },
  {
    id: 'marker-question',
    category: 'marker',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="none"><circle cx="50" cy="50" r="45"/><text x="50" y="68" text-anchor="middle" dominant-baseline="middle" font-size="62" fill="white" font-weight="bold" font-family="sans-serif">?</text></svg>',
  },
  {
    id: 'marker-target',
    category: 'marker',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><circle cx="50" cy="50" r="40"/><circle cx="50" cy="50" r="25"/><circle cx="50" cy="50" r="10"/><line x1="50" y1="5" x2="50" y2="20"/><line x1="50" y1="80" x2="50" y2="95"/><line x1="5" y1="50" x2="20" y2="50"/><line x1="80" y1="50" x2="95" y2="50"/></svg>',
  },
  {
    id: 'marker-footprints',
    category: 'marker',
    svg: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="currentColor" stroke="none"><ellipse cx="35" cy="75" rx="10" ry="14" transform="rotate(-10 35 75)"/><ellipse cx="28" cy="60" rx="5" ry="4" transform="rotate(-20 28 60)"/><ellipse cx="20" cy="53" rx="5" ry="4" transform="rotate(-30 20 53)"/><ellipse cx="65" cy="45" rx="10" ry="14" transform="rotate(10 65 45)"/><ellipse cx="72" cy="30" rx="5" ry="4" transform="rotate(20 72 30)"/><ellipse cx="80" cy="23" rx="5" ry="4" transform="rotate(30 80 23)"/></svg>',
  },
];

/** The built-in map stamps of one category, in the order the stamp picker lists them. */
export function getStampsByCategory(category: StampCategory): StampDef[] {
  return STAMPS.filter((s) => s.category === category);
}

/** The built-in map stamp with this id, or undefined when there is none. */
export function getStampById(id: string): StampDef | undefined {
  return STAMPS.find((s) => s.id === id);
}
