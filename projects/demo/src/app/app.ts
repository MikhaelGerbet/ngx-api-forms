import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { JsonPipe } from '@angular/common';
import { Observable } from 'rxjs';
import {
  createFormBridge,
  provideFormBridge,
  classValidatorPreset,
  parseApiErrors,
  wrapSubmit,
  withFormBridge,
  NgxFormErrorDirective,
  ApiFieldError,
} from 'ngx-api-forms';
import { laravelPreset } from 'ngx-api-forms/laravel';
import { djangoPreset } from 'ngx-api-forms/django';
import { zodPreset } from 'ngx-api-forms/zod';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReactiveFormsModule, JsonPipe, NgxFormErrorDirective],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private fb = inject(FormBuilder);
  protected readonly currentYear = new Date().getFullYear();

  // ---- Demo Form ----
  form = this.fb.group({
    email: ['', Validators.required],
    name: ['', [Validators.required, Validators.minLength(3)]],
    age: [null as number | null, [Validators.min(18)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  bridge = provideFormBridge(this.form, {
    preset: classValidatorPreset(),
  });

  // ---- i18n Demo Form ----
  i18nForm = this.fb.group({
    email: [''],
    name: [''],
  });

  i18nBridge = provideFormBridge(this.i18nForm, {
    preset: classValidatorPreset(),
    i18n: { prefix: 'validation' },
  });

  i18nMode = signal<'prefix' | 'resolver'>('prefix');
  i18nResult = signal<string>('');

  // ---- Submit Demo Form ----
  submitForm = this.fb.group({
    email: ['user@test.com'],
    name: ['John'],
  });

  submitBridge = provideFormBridge(this.submitForm, {
    preset: classValidatorPreset(),
  });

  isSubmitting = signal(false);
  submitResult = signal<string>('');
  submitShouldFail = signal<boolean>(true);

  // ---- Custom JSON Demo ----
  customJsonForm = this.fb.group({
    email: [''],
    name: [''],
    age: [null as number | null],
    password: [''],
  });

  customJsonBridge = provideFormBridge(this.customJsonForm, {
    preset: classValidatorPreset(),
  });

  // ---- Dirty State & Interceptors Demo ----
  dirtyForm = this.fb.group({
    email: ['user@test.com'],
    name: ['John'],
  });

  dirtyBridge = provideFormBridge(this.dirtyForm, {
    preset: classValidatorPreset(),
  });

  interceptorActive = signal(false);
  private interceptorDispose: (() => void) | null = null;

  // ---- Standalone Parsing Demo ----
  standalonePreset = signal<string>('class-validator');
  standaloneResult = signal<string>('');

  // ---- Live API Demo ----
  private http = inject(HttpClient);

  liveForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  liveBridge = provideFormBridge(this.liveForm, {
    preset: djangoPreset(),
  });

  liveSubmitting = signal(false);
  liveResult = signal<string>('');

  // ---- Global Errors Demo ----
  globalForm = this.fb.group({
    email: [''],
    password: [''],
  });

  globalBridge = provideFormBridge(this.globalForm, {
    preset: djangoPreset(),
  });

  globalPreset = signal<string>('django');
  globalResult = signal<string>('');

  customJson = signal<string>(JSON.stringify({
    statusCode: 400,
    message: [
      { property: 'email', constraints: { isEmail: 'email must be a valid email' } }
    ]
  }, null, 2));

  customPreset = signal<string>('class-validator');
  customResult = signal<string>('');

  // ---- Simulated API errors ----
  readonly mockErrors: Record<string, unknown> = {
    'class-validator': {
      statusCode: 400,
      message: [
        { property: 'email', constraints: { isEmail: 'email must be a valid email address' } },
        { property: 'name', constraints: { minLength: 'name must be longer than or equal to 3 characters' } },
        { property: 'age', constraints: { min: 'age must not be less than 18' } },
      ],
      error: 'Bad Request',
    },
    'class-validator-string': {
      statusCode: 400,
      message: 'email is already used',
    },
    laravel: {
      message: 'The given data was invalid.',
      errors: {
        email: ['The email field is required.', 'The email must be a valid email address.'],
        name: ['The name must be at least 3 characters.'],
        age: ['The age must be at least 18.'],
      },
    },
    django: {
      email: ['This field is required.', 'Enter a valid email address.'],
      name: ['Ensure this field has at least 3 characters.'],
      age: ['Ensure this value is greater than or equal to 18.'],
    },
    zod: {
      formErrors: [],
      fieldErrors: {
        email: ['Invalid email'],
        name: ['String must contain at least 3 character(s)'],
        age: ['Number must be greater than or equal to 18'],
      },
    },
    'zod-issues': {
      issues: [
        { code: 'invalid_string', validation: 'email', path: ['email'], message: 'Invalid email' },
        { code: 'too_small', minimum: 3, path: ['name'], message: 'String must contain at least 3 character(s)' },
        { code: 'too_small', minimum: 18, path: ['age'], message: 'Number must be greater than or equal to 18' },
      ],
    },
  };

  selectedMockKey = signal<string>('class-validator');
  lastResult = signal<string>('');
  formErrorsDisplay = signal<string>('{}');

  // ---- Interactive Demo ----

  simulateApiError(): void {
    const key = this.selectedMockKey();
    const error = this.mockErrors[key];

    let preset;
    if (key.startsWith('class-validator')) preset = classValidatorPreset();
    else if (key === 'laravel') preset = laravelPreset();
    else if (key === 'django') preset = djangoPreset();
    else preset = zodPreset();

    this.bridge = createFormBridge(this.form, { preset });
    const result = this.bridge.applyApiErrors(error);
    this.lastResult.set(JSON.stringify(result, null, 2));
    this._refreshFormErrors();
  }

  clearErrors(): void {
    this.bridge.clearApiErrors();
    this.lastResult.set('');
    this._refreshFormErrors();
  }

  resetForm(): void {
    this.form.reset();
    this.bridge.clearApiErrors();
    this.lastResult.set('');
    this._refreshFormErrors();
  }

  // ---- i18n Demo ----

  simulateI18n(): void {
    const mode = this.i18nMode();
    const apiError = {
      statusCode: 400,
      message: [
        { property: 'email', constraints: { isEmail: 'email must be a valid email' } },
        { property: 'name', constraints: { isNotEmpty: 'name should not be empty' } },
      ],
    };

    if (mode === 'prefix') {
      this.i18nBridge = createFormBridge(this.i18nForm, {
        preset: classValidatorPreset(),
        i18n: { prefix: 'validation' },
      });
    } else {
      // Custom resolver: translate error messages
      const translations: Record<string, string> = {
        'email.isEmail': 'L\'email n\'est pas valide',
        'name.isNotEmpty': 'Le nom est obligatoire',
      };
      this.i18nBridge = createFormBridge(this.i18nForm, {
        preset: classValidatorPreset(),
        i18n: {
          resolver: (field: string, constraint: string, _msg: string) => {
            return translations[`${field}.${constraint}`] ?? null;
          },
        },
      });
    }

    const result = this.i18nBridge.applyApiErrors(apiError);
    this.i18nResult.set(JSON.stringify(result, null, 2));
  }

  // ---- Submit Demo ----

  simulateSubmit(): void {
    const shouldFail = this.submitShouldFail();
    this.submitResult.set('');

    const mockApiCall$ = new Observable<{ success: boolean }>(subscriber => {
      const timer = setTimeout(() => {
        if (shouldFail) {
          subscriber.error({
            error: {
              statusCode: 400,
              message: [
                { property: 'email', constraints: { isEmail: 'email must be a valid email' } },
              ],
            },
          });
        } else {
          subscriber.next({ success: true });
          subscriber.complete();
        }
      }, 1500);
      return () => clearTimeout(timer);
    });

    this.isSubmitting.set(true);

    wrapSubmit(this.submitForm, mockApiCall$, {
      onError: (err: unknown) => {
        const body = (err as any)?.error ?? err;
        this.submitBridge.applyApiErrors(body);
      },
    }).subscribe({
      next: (result: { success: boolean }) => {
        this.isSubmitting.set(false);
        this.submitResult.set('Success: ' + JSON.stringify(result));
      },
      error: () => {
        this.isSubmitting.set(false);
        this.submitResult.set('Error handled - form re-enabled, errors applied');
      },
    });
  }

  // ---- Custom JSON Demo ----

  applyCustomJson(): void {
    try {
      const parsed = JSON.parse(this.customJson());
      let preset;
      const key = this.customPreset();
      if (key === 'class-validator') preset = classValidatorPreset();
      else if (key === 'laravel') preset = laravelPreset();
      else if (key === 'django') preset = djangoPreset();
      else preset = zodPreset();

      this.customJsonBridge = createFormBridge(this.customJsonForm, { preset });
      const result = this.customJsonBridge.applyApiErrors(parsed);
      this.customResult.set(JSON.stringify(result, null, 2));
    } catch (e) {
      this.customResult.set('Invalid JSON');
    }
  }

  clearCustom(): void {
    this.customJsonBridge.clearApiErrors();
    this.customResult.set('');
  }

  // ---- Standalone Parsing Demo ----

  simulateStandaloneParsing(): void {
    const key = this.standalonePreset();
    const error = this.mockErrors[key.startsWith('class-validator') ? 'class-validator' : key];

    let preset;
    if (key === 'class-validator') preset = classValidatorPreset();
    else if (key === 'laravel') preset = laravelPreset();
    else if (key === 'django') preset = djangoPreset();
    else preset = zodPreset();

    // parseApiErrors works without any form or FormBridge
    const errors = parseApiErrors(error, preset);
    this.standaloneResult.set(JSON.stringify(errors, null, 2));
  }

  // ---- Dirty & Interceptor Demo ----

  toggleInterceptor(): void {
    if (this.interceptorDispose) {
      this.interceptorDispose();
      this.interceptorDispose = null;
      this.interceptorActive.set(false);
    } else {
      this.interceptorDispose = this.dirtyBridge.addInterceptor((errors: ApiFieldError[]) =>
        errors.filter((e: ApiFieldError) => e.field !== 'email')
      );
      this.interceptorActive.set(true);
    }
  }

  applyDirtyErrors(): void {
    const apiError = {
      statusCode: 400,
      message: [
        { property: 'email', constraints: { isEmail: 'email must be a valid email' } },
        { property: 'name', constraints: { isNotEmpty: 'name should not be empty' } },
      ],
    };
    this.dirtyBridge.applyApiErrors(apiError);
  }

  // ---- Global Errors Demo ----

  readonly globalMockErrors: Record<string, unknown> = {
    django: {
      non_field_errors: ['Unable to log in with provided credentials.'],
      email: ['Enter a valid email address.'],
    },
    'django-detail': {
      detail: ['Authentication credentials were not provided.'],
    },
    zod: {
      formErrors: ['Form is invalid', 'Please check all fields'],
      fieldErrors: {
        email: ['Invalid email'],
      },
    },
    unmatched: {
      statusCode: 400,
      message: [
        { property: 'email', constraints: { isEmail: 'email must be valid' } },
        { property: 'ghostField', constraints: { isNotEmpty: 'this field does not exist in form' } },
      ],
    },
  };

  simulateGlobalErrors(): void {
    const key = this.globalPreset();
    const error = this.globalMockErrors[key];

    let preset;
    if (key.startsWith('django')) preset = djangoPreset();
    else if (key === 'zod') preset = zodPreset();
    else preset = classValidatorPreset();

    this.globalBridge = createFormBridge(this.globalForm, { preset });
    const result = this.globalBridge.applyApiErrors(error);
    this.globalResult.set(JSON.stringify({
      fieldErrors: result,
      globalErrors: this.globalBridge.globalErrorsSignal(),
    }, null, 2));
  }

  clearGlobalErrors(): void {
    this.globalBridge.clearApiErrors();
    this.globalResult.set('');
  }

  // ---- Live API Demo ----

  submitLiveForm(): void {
    if (this.liveForm.invalid) {
      this.liveForm.markAllAsTouched();
      return;
    }

    this.liveSubmitting.set(true);
    this.liveResult.set('');
    this.liveBridge.clearApiErrors();

    this.http.post('/mock-api/register', this.liveForm.value, withFormBridge(this.liveBridge))
      .subscribe({
        next: (res) => {
          this.liveSubmitting.set(false);
          this.liveResult.set('Success: ' + JSON.stringify(res, null, 2));
        },
        error: () => {
          this.liveSubmitting.set(false);
          this.liveResult.set('Errors applied via apiErrorInterceptor + withFormBridge');
        },
      });
  }

  resetLiveForm(): void {
    this.liveForm.reset();
    this.liveBridge.clearApiErrors();
    this.liveResult.set('');
  }

  // ---- Utils ----

  private _refreshFormErrors(): void {
    const errors: Record<string, unknown> = {};
    for (const key of Object.keys(this.form.controls)) {
      const control = this.form.get(key);
      if (control?.errors) {
        errors[key] = control.errors;
      }
    }
    this.formErrorsDisplay.set(JSON.stringify(errors, null, 2));
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text);
  }
}
