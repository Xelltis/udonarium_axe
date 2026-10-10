import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiVolumeRowComponent } from '@axe/ui/components/volume-row/volume-row.component';

describe('UiVolumeRowComponent', () => {
  let fixture: ComponentFixture<UiVolumeRowComponent>;

  function make(inputs: Record<string, unknown> = {}): HTMLElement {
    TestBed.configureTestingModule({ imports: [UiVolumeRowComponent] });
    fixture = TestBed.createComponent(UiVolumeRowComponent);
    fixture.componentRef.setInput('icon', 'pan_tool');
    fixture.componentRef.setInput('label', '操作音');
    fixture.componentRef.setInput('name', 'handling-volume');
    fixture.componentRef.setInput('value', 0.4);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const slider = (root: HTMLElement) => root.querySelector<HTMLInputElement>('input[type="range"]')!;
  const muteButton = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('[data-testid="volume-row-mute"]');

  it('shows the volume on a slider named as asked, and the name beside it', () => {
    const root = make();

    expect(slider(root).name).toBe('handling-volume');
    expect(slider(root).valueAsNumber).toBeCloseTo(0.4);
    expect(root.textContent).toContain('操作音');
  });

  it('says what the slider covers when told', () => {
    const root = make({ hint: 'ダイス・カード・コマ' });

    expect(root.textContent).toContain('ダイス・カード・コマ');
  });

  it('reports where the slider is moved to', () => {
    const root = make();
    const moved: number[] = [];
    fixture.componentInstance.valueChange.subscribe((value) => moved.push(value));

    slider(root).value = '0.7';
    slider(root).dispatchEvent(new Event('input'));

    expect(moved).toEqual([0.7]);
  });

  it('asks to turn the sound off, and back on once it is off', () => {
    const asked: boolean[] = [];
    let root = make();
    fixture.componentInstance.mutedChange.subscribe((muted) => asked.push(muted));
    muteButton(root)!.click();
    expect(asked).toEqual([true]);
    expect(muteButton(root)!.getAttribute('aria-pressed')).toBe('false');

    TestBed.resetTestingModule();
    root = make({ muted: true });
    fixture.componentInstance.mutedChange.subscribe((muted) => asked.push(muted));
    muteButton(root)!.click();
    expect(asked).toEqual([true, false]);
    expect(muteButton(root)!.getAttribute('aria-pressed')).toBe('true');
    expect(muteButton(root)!.textContent).toContain('volume_off');
  });

  it('keeps the slider where it was while the sound is off, dimmed', () => {
    const root = make({ muted: true });

    expect(slider(root).valueAsNumber).toBeCloseTo(0.4);
    expect(slider(root).classList).toContain('opacity-35');
  });

  it('offers no off switch for a volume that cannot be turned off', () => {
    const root = make({ canMute: false });

    expect(muteButton(root)).toBeNull();
  });

  it('lets nothing be changed while disabled', () => {
    const root = make({ disabled: true });

    expect(slider(root).disabled).toBe(true);
    expect(muteButton(root)!.disabled).toBe(true);
  });
});
