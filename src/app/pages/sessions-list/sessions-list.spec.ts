import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SessionsList } from './sessions-list';

describe('SessionsList', () => {
  let component: SessionsList;
  let fixture: ComponentFixture<SessionsList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionsList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SessionsList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
