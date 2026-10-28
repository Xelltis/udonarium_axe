import type { TranslateFn } from '@axe/application/i18n/translate.token';
import type { ChatDiagnostic } from '@axe/domain/chat-syntax/chat-lint';
import type { Diagnostic } from '@codemirror/lint';

/** What a finding says, in the reader's language. */
export function describeChatDiagnostic(found: ChatDiagnostic, translate: TranslateFn): string {
  return translate(`feature.chat.lint.${found.code}`, found.params ? { ...found.params } : undefined);
}

/** A finding as the editor marks it: a wavy line, its message on hover, and its fix as an action. */
export function toEditorDiagnostic(found: ChatDiagnostic, translate: TranslateFn): Diagnostic {
  const fix = found.fix;
  return {
    from: found.from,
    to: found.to,
    severity: found.severity,
    message: describeChatDiagnostic(found, translate),
    actions: fix
      ? [
          {
            name: translate('feature.chat.lint.fix'),
            apply: (view) => view.dispatch({ changes: { from: fix.from, to: fix.to, insert: fix.insert } }),
          },
        ]
      : undefined,
  };
}
