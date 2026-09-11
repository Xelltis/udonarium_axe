import type { TranslateFn } from '@axe/application/i18n/translate.token';
import type { ChatLogLine, ChatLogTab } from '@axe/domain/chat/chat-log-exporter';
import type { DiceRollOutcome } from '@axe/domain/dice/dice-roll-detail';

const MINUTE = 60 * 1000;

const GM_COLOR = '#5b5b5b';
const HERO_COLOR = '#b0413e';
const SAGE_COLOR = '#2e6b9e';

export function buildChatLogPreviewSample(t: TranslateFn, tabName: string, now: number = Date.now()): ChatLogTab {
  const key = (name: string) => t(`feature.chat.log.sample.${name}`);
  const gm = key('gm');
  const hero = key('hero');
  const sage = key('sage');

  let at = now - 20 * MINUTE;
  const say = (name: string, messColor: string, text: string, fields: Partial<ChatLogLine> = {}) =>
    sampleLine({ name, messColor, text, timestamp: (at += MINUTE), ...fields });
  const roll = (name: string, messColor: string, text: string, outcome: DiceRollOutcome) =>
    sampleLine({
      name: `<BCDice：${name}>`,
      messColor,
      text,
      timestamp: (at += 1000),
      isDicebot: true,
      rollDetail: { system: 'DiceBot', faces: [], outcome },
    });

  return {
    name: tabName,
    chatMessages: [
      say(gm, GM_COLOR, key('narration1')),
      say(hero, HERO_COLOR, key('hero1')),
      say(sage, SAGE_COLOR, key('sage1')),
      roll(sage, SAGE_COLOR, '(2D6+2) → 9[4,5]+2 → 11', 'success'),
      say(gm, GM_COLOR, key('narration2')),
      say(hero, HERO_COLOR, key('hero2')),
      roll(hero, HERO_COLOR, '(1D100<=65) → 3', 'critical'),
      say(sage, SAGE_COLOR, key('aside'), { isOutOfStory: true }),
    ],
  };
}

function sampleLine(fields: Partial<ChatLogLine>): ChatLogLine {
  return {
    name: '',
    text: '',
    messColor: '',
    timestamp: 0,
    from: '',
    to: '',
    fixd: false,
    isSecret: false,
    isSendFromSelf: false,
    isDisplayable: true,
    isSentBy: () => false,
    image: null,
    attachmentImages: [],
    quoteOf: '',
    quoteOfMessage: null,
    replyTo: '',
    replyToMessage: null,
    vnEmote: '',
    isSystemMessage: false,
    isDicebot: false,
    rollDetail: null,
    isOutOfStory: false,
    ...fields,
    placedAt: fields.placedAt ?? fields.timestamp ?? 0,
  };
}
