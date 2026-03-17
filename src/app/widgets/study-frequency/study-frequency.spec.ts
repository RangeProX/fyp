import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StudyFrequency } from './study-frequency';

describe('StudyFrequency', () => {
  let component: StudyFrequency;
  let fixture: ComponentFixture<StudyFrequency>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StudyFrequency]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudyFrequency);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
