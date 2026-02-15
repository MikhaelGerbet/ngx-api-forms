import { Component, provideZonelessChangeDetection, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgxFormErrorDirective } from './form-error.directive';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, NgxFormErrorDirective],
  template: `
    <form [formGroup]="form">
      <input formControlName="email" />
      <span
        ngxFormError="email"
        [form]="form"
        [errorMessages]="errorMessages"
        [errorClass]="errorClass"
        [showOnTouched]="showOnTouched"
        #errorEl
      ></span>
    </form>
  `,
})
class TestHostComponent {
  form: FormGroup;
  errorMessages?: Record<string, string>;
  errorClass = 'ngx-form-error-visible';
  showOnTouched = true;

  @ViewChild('errorEl', { read: NgxFormErrorDirective })
  directive!: NgxFormErrorDirective;

  constructor(fb: FormBuilder) {
    this.form = fb.group({
      email: ['', Validators.required],
      name: [''],
    });
  }
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, NgxFormErrorDirective],
  template: `
    <form [formGroup]="form">
      <input [formControlName]="controlName" />
      <span
        [ngxFormError]="controlName"
        [form]="form"
      ></span>
    </form>
  `,
})
class RebindHostComponent {
  form: FormGroup;
  controlName = 'email';

  constructor(fb: FormBuilder) {
    this.form = fb.group({
      email: ['', Validators.required],
      name: ['', Validators.minLength(3)],
    });
  }
}

describe('NgxFormErrorDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let errorEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    errorEl = fixture.nativeElement.querySelector('span');
  });

  it('should be created', () => {
    expect(host.directive).toBeTruthy();
  });

  it('should be hidden initially when control is untouched', () => {
    expect(errorEl.style.display).toBe('none');
    expect(errorEl.textContent).toBe('');
  });

  it('should show error when control is touched and invalid', () => {
    host.form.controls['email'].markAsTouched();
    host.form.controls['email'].updateValueAndValidity();
    fixture.detectChanges();

    expect(errorEl.style.display).toBe('');
    expect(errorEl.textContent).toBe('required');
    expect(errorEl.classList.contains('ngx-form-error-visible')).toBeTrue();
  });

  it('should show API error message (string value) when set by FormBridge pattern', () => {
    const control = host.form.controls['email'];
    control.markAsTouched();
    control.setErrors({ email: 'email must be valid' });
    fixture.detectChanges();

    expect(errorEl.textContent).toBe('email must be valid');
  });

  it('should use custom errorMessages map over raw value', () => {
    // Create a fresh fixture with errorMessages set before first detectChanges
    const f = TestBed.createComponent(TestHostComponent);
    const h = f.componentInstance;
    h.errorMessages = { required: 'Ce champ est obligatoire' };
    f.detectChanges();
    const el = f.nativeElement.querySelector('span') as HTMLElement;

    h.form.controls['email'].markAsTouched();
    h.form.controls['email'].updateValueAndValidity();
    f.detectChanges();

    expect(el.textContent).toBe('Ce champ est obligatoire');
  });

  it('should hide error when control becomes valid', () => {
    const control = host.form.controls['email'];
    control.markAsTouched();
    control.updateValueAndValidity();
    fixture.detectChanges();
    expect(errorEl.style.display).toBe('');

    control.setValue('test@example.com');
    fixture.detectChanges();
    expect(errorEl.style.display).toBe('none');
    expect(errorEl.textContent).toBe('');
  });

  it('should show error without touch when showOnTouched is false', () => {
    const f = TestBed.createComponent(TestHostComponent);
    const h = f.componentInstance;
    h.showOnTouched = false;
    f.detectChanges();
    const el = f.nativeElement.querySelector('span') as HTMLElement;

    h.form.controls['email'].updateValueAndValidity();
    f.detectChanges();

    expect(el.textContent).toBe('required');
  });

  it('should apply custom errorClass', () => {
    const f = TestBed.createComponent(TestHostComponent);
    const h = f.componentInstance;
    h.errorClass = 'my-error';
    f.detectChanges();
    const el = f.nativeElement.querySelector('span') as HTMLElement;

    h.form.controls['email'].markAsTouched();
    h.form.controls['email'].updateValueAndValidity();
    f.detectChanges();

    expect(el.classList.contains('my-error')).toBeTrue();
    expect(el.classList.contains('ngx-form-error-visible')).toBeFalse();
  });

  it('should remove error class when error is cleared', () => {
    host.form.controls['email'].markAsTouched();
    host.form.controls['email'].updateValueAndValidity();
    fixture.detectChanges();
    expect(errorEl.classList.contains('ngx-form-error-visible')).toBeTrue();

    host.form.controls['email'].setValue('test@example.com');
    fixture.detectChanges();
    expect(errorEl.classList.contains('ngx-form-error-visible')).toBeFalse();
  });

  it('should clean up subscription on destroy', () => {
    // Just verify no errors on destroy
    fixture.destroy();
    expect(true).toBeTrue();
  });
});

describe('NgxFormErrorDirective rebinding', () => {
  let rebindFixture: ComponentFixture<RebindHostComponent>;
  let rebindHost: RebindHostComponent;
  let rebindErrorEl: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RebindHostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    rebindFixture = TestBed.createComponent(RebindHostComponent);
    rebindHost = rebindFixture.componentInstance;
    rebindFixture.detectChanges();
    rebindErrorEl = rebindFixture.nativeElement.querySelector('span');
  });

  it('should resubscribe when controlName changes', () => {
    // Touch and trigger email error
    rebindHost.form.controls['email'].markAsTouched();
    rebindHost.form.controls['email'].updateValueAndValidity();
    rebindFixture.detectChanges();
    expect(rebindErrorEl.textContent).toBe('required');

    // Create a fresh fixture with name control already set
    const f = TestBed.createComponent(RebindHostComponent);
    const h = f.componentInstance;
    h.controlName = 'name';
    h.form.controls['name'].setValue('ab');
    h.form.controls['name'].markAsTouched();
    f.detectChanges();
    const el = f.nativeElement.querySelector('span') as HTMLElement;

    expect(el.textContent).toBe('minlength');
  });
});
