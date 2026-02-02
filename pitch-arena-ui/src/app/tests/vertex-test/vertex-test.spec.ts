import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VertexTest } from './vertex-test';

describe('VertexTest', () => {
  let component: VertexTest;
  let fixture: ComponentFixture<VertexTest>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VertexTest]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VertexTest);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
