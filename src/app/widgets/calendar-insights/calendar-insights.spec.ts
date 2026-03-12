import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { CalendarInsights } from './calendar-insights';

describe('CalendarInsights', () => {
  let component: CalendarInsights;
  let fixture: ComponentFixture<CalendarInsights>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarInsights],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(CalendarInsights);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
