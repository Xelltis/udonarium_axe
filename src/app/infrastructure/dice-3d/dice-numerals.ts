/**
 * The figures 0 to 9 of Noto Sans JP Bold, drawn as outlines so the numbers on the dice look the
 * same on every device without loading a font for them.
 *
 * Taken from the font bundled for replay videos (assets/fonts/replay/noto-sans-jp-700.woff2,
 * © 2014-2021 Adobe, SIL Open Font License 1.1), in its units of a thousand to the em, with y
 * running down from the baseline as a canvas has it.
 */

/** One figure: its outline as SVG path data, and where its ink starts and ends across. */
export interface Numeral {
  readonly outline: string;
  readonly left: number;
  readonly right: number;
}

/** How far the figures stand above the baseline, not counting the overshoot of their curves. */
export const NUMERAL_HEIGHT = 741;

/** The space between the ink of two figures side by side. */
export const NUMERAL_GAP = 56;

export const NUMERALS: Readonly<Record<string, Numeral>> = {
  '0': {
    outline:
      'M295 14C446 14 546 -118 546 -374C546 -628 446 -754 295 -754C144 -754 44 -629 44 -374C44 -118 144 14 295 14ZM295 -101C231 -101 183 -165 183 -374C183 -580 231 -641 295 -641C359 -641 406 -580 406 -374C406 -165 359 -101 295 -101Z',
    left: 44,
    right: 546,
  },
  '1': {
    outline: 'M82 0H527V-120H388V-741H279C232 -711 182 -692 107 -679V-587H242V-120H82Z',
    left: 82,
    right: 527,
  },
  '2': {
    outline:
      'M43 0H539V-124H379C344 -124 295 -120 257 -115C392 -248 504 -392 504 -526C504 -664 411 -754 271 -754C170 -754 104 -715 35 -641L117 -562C154 -603 198 -638 252 -638C323 -638 363 -592 363 -519C363 -404 245 -265 43 -85Z',
    left: 35,
    right: 539,
  },
  '3': {
    outline:
      'M273 14C415 14 534 -64 534 -200C534 -298 470 -360 387 -383V-388C465 -419 510 -477 510 -557C510 -684 413 -754 270 -754C183 -754 112 -719 48 -664L124 -573C167 -614 210 -638 263 -638C326 -638 362 -604 362 -546C362 -479 318 -433 183 -433V-327C343 -327 386 -282 386 -209C386 -143 335 -106 260 -106C192 -106 139 -139 95 -182L26 -89C78 -30 157 14 273 14Z',
    left: 26,
    right: 534,
  },
  '4': {
    outline:
      'M337 0H474V-192H562V-304H474V-741H297L21 -292V-192H337ZM337 -304H164L279 -488C300 -528 320 -569 338 -609H343C340 -565 337 -498 337 -455Z',
    left: 21,
    right: 562,
  },
  '5': {
    outline:
      'M277 14C412 14 535 -81 535 -246C535 -407 432 -480 307 -480C273 -480 247 -474 218 -460L232 -617H501V-741H105L85 -381L152 -338C196 -366 220 -376 263 -376C337 -376 388 -328 388 -242C388 -155 334 -106 257 -106C189 -106 136 -140 94 -181L26 -87C82 -32 159 14 277 14Z',
    left: 26,
    right: 535,
  },
  '6': {
    outline:
      'M316 14C442 14 548 -82 548 -234C548 -392 459 -466 335 -466C288 -466 225 -438 184 -388C191 -572 260 -636 346 -636C388 -636 433 -611 459 -582L537 -670C493 -716 427 -754 336 -754C187 -754 50 -636 50 -360C50 -100 176 14 316 14ZM187 -284C224 -340 269 -362 308 -362C372 -362 414 -322 414 -234C414 -144 369 -97 313 -97C251 -97 201 -149 187 -284Z',
    left: 50,
    right: 548,
  },
  '7': {
    outline: 'M186 0H334C347 -289 370 -441 542 -651V-741H50V-617H383C242 -421 199 -257 186 0Z',
    left: 50,
    right: 542,
  },
  '8': {
    outline:
      'M295 14C444 14 544 -72 544 -184C544 -285 488 -345 419 -382V-387C467 -422 514 -483 514 -556C514 -674 430 -753 299 -753C170 -753 76 -677 76 -557C76 -479 117 -423 174 -382V-377C105 -341 47 -279 47 -184C47 -68 152 14 295 14ZM341 -423C264 -454 206 -488 206 -557C206 -617 246 -650 296 -650C358 -650 394 -607 394 -547C394 -503 377 -460 341 -423ZM298 -90C229 -90 174 -133 174 -200C174 -256 202 -305 242 -338C338 -297 407 -266 407 -189C407 -125 361 -90 298 -90Z',
    left: 47,
    right: 544,
  },
  '9': {
    outline:
      'M255 14C402 14 539 -107 539 -387C539 -644 414 -754 273 -754C146 -754 40 -659 40 -507C40 -350 128 -274 252 -274C302 -274 365 -304 404 -354C397 -169 329 -106 247 -106C203 -106 157 -129 130 -159L52 -70C96 -25 163 14 255 14ZM402 -459C366 -401 320 -379 280 -379C216 -379 175 -420 175 -507C175 -598 220 -643 275 -643C338 -643 389 -593 402 -459Z',
    left: 40,
    right: 539,
  },
};
