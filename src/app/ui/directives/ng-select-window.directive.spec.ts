import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { NgSelectComponent, NgSelectConfig } from '@ng-select/ng-select';

@Component({
  selector: 'select-host',
  template: '<ng-select [items]="items" [(ngModel)]="value" />',
  imports: [FormsModule, NgSelectComponent, NgSelectWindowDirective],
})
class SelectHostComponent {
  items = ['one', 'two', 'three'];
  value = 'one';
}

describe('NgSelectWindowDirective', () => {
  let paper: Document;
  let appendedTo: string;

  function render() {
    TestBed.inject(NgSelectConfig).appendTo = 'body';
    const fixture = TestBed.createComponent(SelectHostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const select = fixture.debugElement.query(By.directive(NgSelectComponent)).componentInstance as NgSelectComponent;
    return { fixture, select };
  }

  beforeEach(() => {
    paper = document.implementation.createHTMLDocument('window');
    appendedTo = TestBed.inject(NgSelectConfig).appendTo;
  });

  afterEach(() => {
    for (const panel of document.querySelectorAll('.ng-dropdown-panel')) panel.remove();
    TestBed.inject(NgSelectConfig).appendTo = appendedTo;
  });

  it('opens the list in the window the select was put into', async () => {
    const { fixture, select } = render();
    paper.body.appendChild(fixture.nativeElement);

    select.open();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(paper.querySelector('.ng-dropdown-panel')).not.toBeNull();
    expect(document.querySelector('.ng-dropdown-panel')).toBeNull();
    fixture.destroy();
  });

  it('opens the list in the main window while the select stands there', async () => {
    const { fixture, select } = render();

    select.open();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.querySelector('.ng-dropdown-panel')).not.toBeNull();
    fixture.destroy();
  });

  it('follows a select carried to another window after it was opened once', async () => {
    const { fixture, select } = render();
    select.open();
    fixture.detectChanges();
    await fixture.whenStable();
    select.close();
    fixture.detectChanges();
    await fixture.whenStable();

    paper.body.appendChild(fixture.nativeElement);
    select.open();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(paper.querySelector('.ng-dropdown-panel')).not.toBeNull();
    fixture.destroy();
  });
});
