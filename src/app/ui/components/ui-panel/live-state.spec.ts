import { holdLiveState } from '@axe/ui/components/ui-panel/live-state';

describe('holdLiveState', () => {
  function scrollable(): HTMLElement {
    const box = document.createElement('div');
    Object.defineProperty(box, 'scrollTop', { value: 0, writable: true, configurable: true });
    Object.defineProperty(box, 'scrollLeft', { value: 0, writable: true, configurable: true });
    return box;
  }

  it('puts the reader back where they had scrolled to', () => {
    const root = scrollable();
    root.scrollTop = 120;
    root.scrollLeft = 30;
    const restore = holdLiveState(root);

    root.scrollTop = 0;
    root.scrollLeft = 0;
    restore();

    expect(root.scrollTop).toBe(120);
    expect(root.scrollLeft).toBe(30);
  });

  it('puts the reader back in what they were typing in, caret and all', () => {
    const root = scrollable();
    const field = document.createElement('textarea');
    field.value = 'half a line';
    root.appendChild(field);
    document.body.appendChild(root);
    field.focus();
    field.setSelectionRange(4, 4);

    const restore = holdLiveState(root);
    (document.activeElement as HTMLElement)?.blur();
    restore();

    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(4);
    root.remove();
  });

  it('holds a box that scrolls inside the panel, and passes over what cannot', () => {
    const root = scrollable();
    const log = scrollable();
    log.className = 'overflow-y-auto';
    const line = scrollable();
    line.className = 'text-sm';
    root.append(log, line);
    log.scrollTop = 400;
    line.scrollTop = 90;

    const restore = holdLiveState(root);
    log.scrollTop = 0;
    line.scrollTop = 0;
    restore();

    expect(log.scrollTop).toBe(400);
    expect(line.scrollTop).toBe(0);
  });

  it('leaves the page alone when the panel held nothing of the sort', () => {
    const root = scrollable();
    document.body.appendChild(root);
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    elsewhere.focus();

    const restore = holdLiveState(root);
    restore();

    expect(document.activeElement).toBe(elsewhere);
    root.remove();
    elsewhere.remove();
  });
});
