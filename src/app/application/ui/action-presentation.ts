/**
 * How a menu row is drawn from the mark at the head of its name: a box or a dot, ticked or not,
 * a plain tick, or nothing.
 */
export interface ActionPresentation {
  /** The name with its mark taken off. */
  label: string;
  kind: 'checkbox' | 'radio' | 'selected' | 'none';
  /** Whether the mark is the ticked one; null for a row that is no switch. */
  checked: boolean | null;
  /** The icon that stands for the mark; null for a row that has none. */
  icon: string | null;
}

/**
 * Reads the mark a menu row's name begins with: `☑` and `☐` make it a checkbox, `◉` and `○` a
 * radio button, `✔` a chosen row. The mark and the space after it are taken off the label.
 */
export function actionPresentationOf(name: string): ActionPresentation {
  const match = name.match(/^([☑☐◉○✔])\s*/);
  const label = match ? name.slice(match[0].length) : name;
  switch (match?.[1]) {
    case '☑':
      return { label, kind: 'checkbox', checked: true, icon: 'check_box' };
    case '☐':
      return { label, kind: 'checkbox', checked: false, icon: 'check_box_outline_blank' };
    case '◉':
      return { label, kind: 'radio', checked: true, icon: 'radio_button_checked' };
    case '○':
      return { label, kind: 'radio', checked: false, icon: 'radio_button_unchecked' };
    case '✔':
      return { label, kind: 'selected', checked: true, icon: 'check' };
    default:
      return { label, kind: 'none', checked: null, icon: null };
  }
}
