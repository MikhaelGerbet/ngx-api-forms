# ngx-api-forms

**API error parsing library for Angular.** Normalizes validation error responses from any backend into a consistent format your forms can consume. Not a display library -- a parsing library.

[![npm version](https://img.shields.io/npm/v/ngx-api-forms?style=flat-square)](https://www.npmjs.com/package/ngx-api-forms)
[![License: MIT](https://img.shields.io/npm/l/ngx-api-forms?style=flat-square)](LICENSE)
[![Angular 17+](https://img.shields.io/badge/Angular-17%2B-dd0031?style=flat-square&logo=angular)](https://angular.dev)
[![CI/CD](https://img.shields.io/github/actions/workflow/status/MikhaelGerbet/ngx-api-forms/ci.yml?style=flat-square&label=CI%2FCD)](https://github.com/MikhaelGerbet/ngx-api-forms/actions)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square)](https://www.npmjs.com/package/ngx-api-forms?activeTab=dependencies)

**[Live Demo](https://mikhaelgerbet.github.io/ngx-api-forms/)**

## Why?

When your API returns a 422, you write backend-specific parsing logic by hand:

```typescript
// Without ngx-api-forms
this.http.post('/api/register', data).subscribe({
  error: (err) => {
    const messages = err.error?.message; // NestJS-specific
    if (Array.isArray(messages)) {
      for (const msg of messages) {
        const ctrl = this.form.get(msg.property);
        if (ctrl) {
          // Constraints object is not standard Angular error format
          const firstKey = Object.keys(msg.constraints ?? {})[0];
          const firstMsg = msg.constraints?.[firstKey];
          ctrl.setErrors({ [firstKey]: firstMsg });
          ctrl.markAsTouched();
        }
      }
    }
    // Switch to Laravel? Rewrite everything above.
  }
});
```

Ten forms means ten copies. Switch from NestJS to Laravel and every handler must be rewritten. Most teams flatten everything into `{ serverError: message }`, losing constraint semantics entirely.

With ngx-api-forms, one line handles all of it:

```typescript
// With ngx-api-forms
this.http.post('/api/register', data).subscribe({
  error: (err) => this.bridge.applyApiErrors(err.error),
});
```

Switch backends by changing the preset. Constraint keys (`required`, `email`, `minlength`) are mapped to standard Angular error keys automatically. Works with NestJS, Laravel, Django, Zod out of the box.

**ngx-api-forms fills the gap between the API and Reactive Forms.**

## Quick Start

### Minimal: parse errors without a form

```typescript
import { parseApiErrors, laravelPreset } from 'ngx-api-forms';

const errors = parseApiErrors(apiResponse, laravelPreset());
// [{ field: 'email', constraint: 'required', message: 'The email field is required.' }]
```

One function, one preset, structured output. No form needed. Works in interceptors, NgRx effects, services, tests -- anywhere.

### Full: parse and apply to a form

```typescript
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { provideFormBridge, classValidatorPreset, NgxFormErrorDirective } from 'ngx-api-forms';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, NgxFormErrorDirective],
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()">
      <input formControlName="email" />
      <span ngxFormError="email" [form]="form"></span>

      <input formControlName="name" />
      <span ngxFormError="name" [form]="form"></span>

      <button type="submit">Save</button>
    </form>
  `
})
export class MyComponent {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    name: ['', [Validators.required, Validators.minLength(3)]],
  });

  bridge = provideFormBridge(this.form, {
    preset: classValidatorPreset(),
  });

  onSubmit() {
    this.http.post('/api/save', this.form.value).subscribe({
      error: (err) => this.bridge.applyApiErrors(err.error)
    });
  }
}
```

## Installation

```bash
npm install ngx-api-forms
```

Or with `ng add` to scaffold an example component with your backend preset:

```bash
ng add ngx-api-forms --preset=laravel
```

Available presets: `laravel`, `django`, `class-validator`, `zod`.

## Supported Backend Formats

### NestJS / class-validator
```json
{
  "statusCode": 400,
  "message": [
    { "property": "email", "constraints": { "isEmail": "email must be a valid email" } }
  ]
}
```

### Laravel
```json
{
  "message": "The given data was invalid.",
  "errors": {
    "email": ["The email field is required."]
  }
}
```

### Django REST Framework
```json
{
  "email": ["This field is required."],
  "name": ["Ensure this field has at least 3 characters."]
}
```

### Zod
```json
{
  "fieldErrors": {
    "email": ["Invalid email"]
  }
}
```

## Constraint Inference Limitations

The Laravel, Django, and Zod presets infer constraint types (e.g. "required", "email") by pattern-matching on the English text of error messages. This works reliably with default backend messages but has known limitations:

- **Translated messages**: If your backend returns messages in a non-English language, inference falls back to `'invalid'` for most constraints.
- **Custom messages**: Overridden validation messages (e.g. `'Please provide your email'` instead of `'The email field is required'`) may not match the inference patterns.
- **NestJS/class-validator does not have this limitation** because it transmits the constraint key directly (e.g. `isEmail`, `isNotEmpty`).

When inference fails, you have four options:

```typescript
// 1. Disable inference entirely -- raw messages, no guessing
const bridge = provideFormBridge(form, {
  preset: laravelPreset({ noInference: true }),
});
// All errors get constraint: 'serverError' with the raw message preserved

// 2. Custom constraintMap to override specific mappings
const bridge = provideFormBridge(form, {
  preset: laravelPreset(),
  constraintMap: { 'mon_erreur_custom': 'required' },
});

// 3. catchAll to apply unmatched errors as { generic: msg }
const bridge = provideFormBridge(form, {
  preset: laravelPreset(),
  catchAll: true,
});

// 4. Write a custom preset for full control (see below)
```

## Switching Backends

Each backend has its own preset. Pass an array if your app talks to multiple APIs -- they are tried in order until one matches.

```typescript
import { laravelPreset, djangoPreset, zodPreset } from 'ngx-api-forms';

// Laravel
const bridge = provideFormBridge(form, { preset: laravelPreset() });

// Django REST Framework
const bridge = provideFormBridge(form, { preset: djangoPreset() });

// Zod (e.g. with tRPC)
const bridge = provideFormBridge(form, { preset: zodPreset() });

// Multiple presets, tried in order
const bridge = provideFormBridge(form, {
  preset: [classValidatorPreset(), laravelPreset()]
});
```

## Global Error Handling with HttpInterceptor

`parseApiErrors` integrates with Angular's functional interceptors to centralize error extraction for the entire app:

```typescript
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { parseApiErrors, classValidatorPreset } from 'ngx-api-forms';

export const apiErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const errorStore = inject(ErrorStore); // your error store/service

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 422 || err.status === 400) {
        const fieldErrors = parseApiErrors(err.error, classValidatorPreset());
        errorStore.setFieldErrors(fieldErrors);
      }
      return throwError(() => err);
    }),
  );
};
```

Components can then read from the error store, or still use `bridge.applyApiErrors()` for form-specific handling.

## Typed Forms

`FormBridge` is generic. When you pass a typed `FormGroup`, the `form` getter preserves the type:

```typescript
interface LoginForm {
  email: FormControl<string>;
  password: FormControl<string>;
}

const form = new FormGroup<LoginForm>({ ... });
const bridge = provideFormBridge(form);

// bridge.form is typed as FormGroup<LoginForm>
bridge.form.controls.email; // FormControl<string> -- full autocompletion
```

## API Reference

### Core Function

| Function | Description |
|----------|-------------|
| `parseApiErrors(error, preset?, options?)` | Parse API errors without a form. Works in interceptors, stores, effects. Pass `{ debug: true }` to log warnings when no preset matches. |

### FormBridge (form integration)

Create with `provideFormBridge(form, config?)` or `createFormBridge(form, config?)`.

| Method | Returns | Description |
|--------|---------|-------------|
| `applyApiErrors(error)` | `ResolvedFieldError[]` | Parse and apply API errors to form controls |
| `clearApiErrors()` | `void` | Remove only the API-set errors (client-side validators are preserved) |
| `getFirstError()` | `FirstError \| null` | First error across all controls |
| `getFieldErrors(field)` | `ValidationErrors \| null` | Errors for a specific field |
| `addInterceptor(fn)` | `() => void` | Register an error interceptor. Returns a dispose function |

### Signals

| Signal | Type | Description |
|--------|------|-------------|
| `errorsSignal` | `Signal<ResolvedFieldError[]>` | All current API errors |
| `firstErrorSignal` | `Signal<FirstError \| null>` | First error, or null |
| `hasErrorsSignal` | `Signal<boolean>` | Whether any API errors exist |

### Standalone Utility Functions

| Function | Description |
|----------|-------------|
| `wrapSubmit(form, source, options?)` | Submit lifecycle (disable/enable) without FormBridge |
| `toFormData(data)` | Convert a plain object to FormData. Handles Files, Blobs, Arrays, nested objects |
| `enableForm(form, options?)` | Enable all controls, with optional `except` list |
| `disableForm(form, options?)` | Disable all controls, with optional `except` list |
| `clearFormErrors(form)` | Clear all errors from all controls |
| `getDirtyValues(form)` | Return only the dirty fields and their values |
| `hasError(form, errorKey)` | Check if any control has a specific error |
| `getErrorMessage(form, field, key?)` | Get the error message string for a field |

### Preset Options

All built-in presets accept a `noInference` option:

```typescript
// Skip constraint guessing -- use raw messages directly
laravelPreset({ noInference: true })
djangoPreset({ noInference: true })
zodPreset({ noInference: true })
classValidatorPreset({ noInference: true })  // only affects string message fallback
```

When `noInference: true`, all errors use `constraint: 'serverError'` with the original message preserved. Use this when your backend returns translated or custom messages.

### Configuration

```typescript
interface FormBridgeConfig {
  preset?: ErrorPreset | ErrorPreset[];
  constraintMap?: Record<string, string>;
  i18n?: {
    prefix?: string;
    resolver?: (field, constraint, message) => string | null;
  };
  catchAll?: boolean;     // Apply unmatched errors as { generic: msg }
  mergeErrors?: boolean;  // Merge with existing errors instead of replacing
  debug?: boolean;        // Log warnings when presets or fields don't match
}
```

## Debug Mode

Set `debug: true` to log warnings during development:

```typescript
const bridge = provideFormBridge(form, {
  preset: laravelPreset(),
  debug: true,
});

// Or standalone:
const errors = parseApiErrors(err.error, laravelPreset(), { debug: true });
```

The library warns when:
- No preset produces results for a given error payload (format might be wrong or unsupported)
- A parsed error field does not match any form control (possible typo or missing control)

## Submit and Loading State

`wrapSubmit` handles the disable/enable lifecycle as a standalone function:

```typescript
import { wrapSubmit } from 'ngx-api-forms';

wrapSubmit(this.form, this.http.post('/api', data), {
  onError: (err) => this.bridge.applyApiErrors(err.error),
}).subscribe({
  next: () => this.router.navigate(['/done']),
});
```

## i18n

Generate translation keys automatically or provide a custom resolver:

```typescript
// Translation key prefix
const bridge = provideFormBridge(form, {
  preset: classValidatorPreset(),
  i18n: { prefix: 'validation' }
});
// Produces keys like "validation.email.isEmail"

// Custom resolver
const bridge = provideFormBridge(form, {
  i18n: {
    resolver: (field, constraint, originalMessage) => {
      return this.translate.instant(`errors.${field}.${constraint}`);
    }
  }
});
```

## Error Interceptors

Interceptors let you filter or transform errors before they reach the form:

```typescript
const dispose = bridge.addInterceptor((errors, form) => {
  return errors.filter(e => e.field !== 'internalField');
});
// Later: dispose() to remove the interceptor
```

## NgxFormError Directive

```html
<!-- Basic usage -->
<span ngxFormError="email" [form]="myForm"></span>

<!-- Custom error messages -->
<span ngxFormError="email"
      [form]="myForm"
      [errorMessages]="{ required: 'Email requis', email: 'Email invalide' }">
</span>

<!-- Show errors before the field is touched -->
<span ngxFormError="email" [form]="myForm" [showOnTouched]="false"></span>
```

## Custom Preset

If your backend uses a different format, write a preset in a few lines:

```typescript
import { ErrorPreset, ApiFieldError } from 'ngx-api-forms';

export function myBackendPreset(): ErrorPreset {
  return {
    name: 'my-backend',
    parse(error: unknown): ApiFieldError[] {
      const err = error as { validationErrors: Array<{ field: string; rule: string; msg: string }> };
      return (err.validationErrors ?? []).map(e => ({
        field: e.field,
        constraint: e.rule,
        message: e.msg,
      }));
    }
  };
}
```

## Angular Compatibility

| ngx-api-forms | Angular |
|:---:|:---:|
| 1.x | 17.x, 18.x, 19.x, 20.x |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - [Mikhael GERBET](https://github.com/MikhaelGerbet)
