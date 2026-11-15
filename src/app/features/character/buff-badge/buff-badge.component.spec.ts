import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { buffBadgeOf } from '@axe/domain/character/buff-badge';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';
import { BuffBadgeComponent } from '@axe/features/character/buff-badge/buff-badge.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BuffBadgeComponent', () => {
  let fixture: ComponentFixture<BuffBadgeComponent>;
  let made: DataElement[] = [];

  function buff(name: string, kind?: string): DataElement {
    const row = DataElement.create(name, 3, { type: DataElementType.NUMBER_RESOURCE, currentValue: '命中-1' });
    if (kind !== undefined) row.setAttribute(DataElementAttribute.BUFF_KIND, kind);
    made.push(row);
    return row;
  }

  function show(row: DataElement): HTMLElement {
    fixture.componentRef.setInput('badge', buffBadgeOf(row));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const debuffMark = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-testid="buff-debuff-mark"]');

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BuffBadgeComponent], providers: [...TEST_PROVIDERS] });
    TestBed.inject(StatusAilmentService).save([newStatusAilment('毒')]);
    fixture = TestBed.createComponent(BuffBadgeComponent);
  });

  afterEach(() => {
    for (const row of made) row.destroy();
    made = [];
    TestBed.inject(StatusAilmentService).save([]);
    StatusAilmentCatalog.forget();
  });

  it('puts a ▼ inside the circle of a buff marked a debuff', () => {
    const host = show(buff('呪い', 'debuff'));

    expect(debuffMark(host)?.textContent).toBe('▼');
    expect(debuffMark(host)?.closest('[data-testid="buff-badge-mark"]')).not.toBeNull();
  });

  it('puts none on a buff, marked or not', () => {
    expect(debuffMark(show(buff('祝福')))).toBeNull();
    expect(debuffMark(show(buff('祝福', 'buff')))).toBeNull();
  });

  it('shows a state the room keeps as a debuff without anyone marking it, and follows the room’s list', () => {
    const host = show(buff('毒'));
    expect(debuffMark(host)).not.toBeNull();

    TestBed.inject(StatusAilmentService).save([]);
    fixture.detectChanges();

    expect(debuffMark(host)).toBeNull();
  });

  it('shows a state of the room marked a buff by hand as a buff', () => {
    expect(debuffMark(show(buff('毒', 'buff')))).toBeNull();
  });

  it('lays no plate behind the mark, which stands on the circle’s own colour', () => {
    const mark = debuffMark(show(buff('呪い', 'debuff')))!;

    expect([...mark.classList].filter((name) => /^(bg-|border)/.test(name))).toEqual([]);
    expect(mark.classList.contains('pointer-events-none')).toBe(true);
  });
});
