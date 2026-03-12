import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';

import { UpcomingEvents } from './upcoming-events';
import { EventsService } from '../../services/events';

describe('UpcomingEvents', () => {
  let component: UpcomingEvents;
  let fixture: ComponentFixture<UpcomingEvents>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpcomingEvents],
      providers: [
        {
          provide: EventsService,
          useValue: {
            listEvents: () => of([]),
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: jasmine.createSpy('navigate'),
          },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(UpcomingEvents);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
