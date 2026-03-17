import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PublicFiles } from './public-files';

describe('PublicFiles', () => {
  let component: PublicFiles;
  let fixture: ComponentFixture<PublicFiles>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicFiles]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PublicFiles);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
