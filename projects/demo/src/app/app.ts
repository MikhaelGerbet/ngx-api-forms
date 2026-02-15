import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { JsonPipe } from '@angular/common';
import {
  createFormBridge,
  classValidatorPreset,
  laravelPreset,
  djangoPreset,
  zodPreset,
  NgxFormErrorDirective,
} from 'ngx-api-forms';

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

  bridge = createFormBridge(this.form, {
    preset: classValidatorPreset(),
  });

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

  simulateApiError(): void {
    const key = this.selectedMockKey();
    const error = this.mockErrors[key];

    // Select the right preset
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
    this.bridge.reset();
    this.lastResult.set('');
    this._refreshFormErrors();
  }

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
