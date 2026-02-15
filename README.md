# ngx-api-forms

Angular library that maps API validation errors to Reactive Forms controls. Works with NestJS (class-validator), Laravel, Django REST Framework, and Zod out of the box.

[![npm version](https://img.shields.io/npm/v/ngx-api-forms?style=flat-square)](https://www.npmjs.com/package/ngx-api-forms)
[![License: MIT](https://img.shields.io/npm/l/ngx-api-forms?style=flat-square)](LICENSE)
[![Angular 17+](https://img.shields.io/badge/Angular-17%2B-dd0031?style=flat-square&logo=angular)](https://angular.dev)
[![CI/CD](https://img.shields.io/github/actions/workflow/status/MikhaelGerbet/ngx-api-forms/ci.yml?style=flat-square&label=CI%2FCD)](https://github.com/MikhaelGerbet/ngx-api-forms/actions)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square)](https://www.npmjs.com/package/ngx-api-forms?activeTab=dependencies)

**[Live Demo](https://mikhaelgerbet.github.io/ngx-api-forms/)**

## The Problem

Every Angular app that consumes an API with server-side validation ends up writing the same boilerplate. The backend returns errors in its own format, and the frontend parses them manually:

```typescript
// Typical approach - brittle, repetitive, backend-specific
this.http.post('/api/register', data).subscribe({
  error: (err) => {
    const messages = err.error?.message; // NestJS format
    if (Array.isArray(messages)) {
      for (const msg of messages) {
        const ctrl = this.form.get(msg.property);
        if (ctrl) {
          ctrl.setErrors(msg.constraints);
          ctrl.markAsTouched();
        }
      }
    }
  }
});
```

This code has three problems:

1. **It is backend-specific.** Switch from NestJS to Laravel and every error handler must be rewritten. The error shapes have nothing in common.
2. **It loses constraint semantics.** Most teams flatten everything into a generic `{ serverError: message }`, making it impossible to differentiate "required" from "email" in templates.
3. **It scales linearly.** Ten forms means ten copies of the same parsing logic. Nobody tests them.

Libraries like `@ngneat/error-tailor` or `ngx-valdemort` solve the display side - rendering client-side `Validators.required` messages. But they do nothing about parsing API responses. That gap between the API and Reactive Forms is what ngx-api-forms fills.

## The Solution

```typescript
bridge.applyApiErrors(err.error);
```

One call. The library parses the error payload, identifies which fields are affected, maps constraint types, and calls `setErrors()` on the right controls. Switch backends by swapping a preset - no other code changes.

## Features

- **Multi-backend presets** - NestJS/class-validator, Laravel, Django REST, Zod
- **Standalone parsing** - `parseApiErrors()` works without a form (interceptors, stores, effects)
- **Angular Signals** - reactive error state via `errorsSignal`, `firstErrorSignal`, `hasErrorsSignal`
- **Typed forms** - `FormBridge<T>` preserves your `FormGroup` type through the API
- **i18n support** - translation key prefixes or custom resolver functions
- **SSR compatible** - no browser-only APIs
- **Tree-shakeable** - import only what you need
- **Error directive** - `ngxFormError` for declarative error display in templates
- **Submit lifecycle** - `handleSubmit()` and `wrapSubmit()` manage disable/enable and loading state
- **Extensible** - custom presets, interceptors, constraint maps
- **Zero dependencies** - only Angular as peer dependency

## Installation

```bash
npm install ngx-api-forms
```

## Quick Start

```typescript
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { createFormBridge, classValidatorPreset, NgxFormErrorDirective } from 'ngx-api-forms';

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
  private fb = inject(FormBuilder);

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    name: ['', [Validators.required, Validators.minLength(3)]],
  });

  bridge = createFormBridge(this.form, {
    preset: classValidatorPreset(),
  });

  onSubmit() {
    this.api.save(this.form.value).subscribe({
      error: (err) => this.bridge.applyApiErrors(err.error)
    });
  }
}
```

## Switching Backends

Each backend has its own preset. Pass an array if your app talks to multiple APIs - they are tried in order until one matches.

```typescript
import { laravelPreset, djangoPreset, zodPreset } from 'ngx-api-forms';

// Laravel
const bridge = createFormBridge(form, { preset: laravelPreset() });

// Django REST Framework
const bridge = createFormBridge(form, { preset: djangoPreset() });

// Zod (e.g. with tRPC)
const bridge = createFormBridge(form, { preset: zodPreset() });

// Multiple presets, tried in order
const bridge = createFormBridge(form, {
  preset: [classValidatorPreset(), laravelPreset()]
});
```

## Typed Forms

`FormBridge` is generic. When you pass a typed `FormGroup`, the `form` getter preserves the type:

```typescript
interface LoginForm {
  email: FormControl<string>;
  password: FormControl<string>;
}

const form = new FormGroup<LoginForm>({ ... });
const bridge = createFormBridge(form);

// bridge.form is typed as FormGroup<LoginForm>
bridge.form.controls.email; // FormControl<string> - full autocompletion
```

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

## API Reference

### FormBridge

| Method | Returns | Description |
|--------|---------|-------------|
| `applyApiErrors(error)` | `ResolvedFieldError[]` | Parse and apply API errors to form controls |
| `clearApiErrors()` | `void` | Remove all API-set errors |
| `getFirstError()` | `FirstError \| null` | First error across all controls |
| `getFieldErrors(field)` | `ValidationErrors \| null` | Errors for a specific field |
| `setDefaultValues(values)` | `void` | Store defaults and patch the form |
| `reset()` | `void` | Reset to defaults, clear errors |
| `enable(options?)` | `void` | Enable controls (supports `except` list) |
| `disable(options?)` | `void` | Disable controls (supports `except` list) |
| `toFormData(values?)` | `FormData` | Convert form values to FormData |
| `handleSubmit(source)` | `Observable<T>` | *(deprecated)* Wrap an Observable: disable form, apply errors on failure, re-enable. Use standalone `wrapSubmit()` instead. |
| `addInterceptor(fn)` | `() => void` | Register an error interceptor. Returns a dispose function |
| `checkDirty()` | `boolean` | Check if form differs from defaults |
| `destroy()` | `void` | Clean up internal subscriptions |

### Standalone Functions

| Function | Description |
|----------|-------------|
| `parseApiErrors(error, preset?, options?)` | Parse API errors without a form. Works in interceptors, stores, effects. Pass `{ debug: true }` to log warnings. |
| `wrapSubmit(form, source, options?)` | Submit lifecycle (disable/enable) without FormBridge. |
| `toFormData(data)` | Convert a plain object to FormData. Handles Files, Blobs, Arrays, nested objects. |
| `enableForm(form, options?)` | Enable all controls, with optional `except` list. |
| `disableForm(form, options?)` | Disable all controls, with optional `except` list. |
| `clearFormErrors(form)` | Clear all errors from all controls. |
| `getDirtyValues(form)` | Return only the dirty fields and their values. |
| `hasError(form, errorKey)` | Check if any control has a specific error. |
| `getErrorMessage(form, field, key?)` | Get the error message string for a field. |

### Signals

| Signal | Type | Description |
|--------|------|-------------|
| `errorsSignal` | `Signal<ResolvedFieldError[]>` | All current API errors |
| `firstErrorSignal` | `Signal<FirstError \| null>` | First error, or null |
| `hasErrorsSignal` | `Signal<boolean>` | Whether any API errors exist |
| `isDirtySignal` | `Signal<boolean>` | Whether form changed from defaults (updates reactively on every value change) |
| `isSubmittingSignal` | `Signal<boolean>` | Whether a submit is in progress (via handleSubmit) |

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

## Standalone Parsing

`parseApiErrors` extracts and normalizes errors from any API response without touching a form. This is the function to use when you don't have (or don't want) a FormBridge - in HttpInterceptors, NgRx effects, service layers, or test utilities.

```typescript
import { parseApiErrors, laravelPreset } from 'ngx-api-forms';

// In a service, store effect, or anywhere:
const errors = parseApiErrors(apiResponse, laravelPreset());
// [{ field: 'email', constraint: 'required', message: 'The email field is required.' }]

// Multi-preset: tries each until one matches
const errors = parseApiErrors(body, [zodPreset(), classValidatorPreset()]);
```

### Global Error Handling with HttpInterceptor

`parseApiErrors` integrates cleanly with Angular's functional interceptors to centralize error extraction across the entire application:

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

## Debug Mode

Set `debug: true` in the configuration to log warnings during development:

```typescript
const bridge = createFormBridge(form, {
  preset: laravelPreset(),
  debug: true,
});
```

The library will warn when:
- No preset produces results for a given error payload (the format might be wrong or unsupported).
- A parsed error field does not match any form control (possible typo or missing control).

The standalone `parseApiErrors` also supports debug mode:

```typescript
const errors = parseApiErrors(err.error, laravelPreset(), { debug: true });
```

Disable debug in production builds.

## Submit and Loading State

### With FormBridge (deprecated)

`handleSubmit()` is kept for backward compatibility but is deprecated in favor of standalone `wrapSubmit()`. It wraps an Observable and handles the full submit lifecycle: disabling the form, tracking loading state via `isSubmittingSignal`, and applying API errors on failure.

```typescript
onSubmit() {
  this.bridge.handleSubmit(
    this.http.post('/api/save', this.form.value)
  ).subscribe({
    next: () => this.router.navigate(['/success']),
    error: () => {
      // form is re-enabled, errors are applied automatically
    },
  });
}
```

```html
<button [disabled]="bridge.isSubmittingSignal()">
  @if (bridge.isSubmittingSignal()) {
    Sending...
  } @else {
    Submit
  }
</button>
```

By default, the error body is extracted using `err.error` (matching Angular's HttpErrorResponse). You can customize this:

```typescript
bridge.handleSubmit(source, {
  extractError: (err) => (err as any).data.errors,
});
```

### Without FormBridge

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

You can generate translation keys automatically by setting a prefix, or provide a custom resolver for full control.

```typescript
// Translation key prefix
const bridge = createFormBridge(form, {
  preset: classValidatorPreset(),
  i18n: { prefix: 'validation' }
});
// Produces keys like "validation.email.isEmail"
// Use with ngx-translate, transloco, or any i18n library

// Custom resolver
const bridge = createFormBridge(form, {
  i18n: {
    resolver: (field, constraint, originalMessage) => {
      return this.translate.instant(`errors.${field}.${constraint}`);
    }
  }
});
```

## Error Interceptors

Interceptors let you filter or transform errors before they reach the form.

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

If your backend uses a different format, you can write a preset in a few lines:

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

## Constraint Inference Limitations

The Laravel, Django, and Zod presets infer constraint types (e.g. "required", "email") by pattern-matching on the English text of error messages. This works well with default backend messages but has known limitations:

- **Translated messages**: If your backend returns messages in French, Spanish, or any non-English language, the inference will fall back to `'invalid'` for most constraints.
- **Custom messages**: If you override default validation messages on the backend (e.g. `'Please provide your email'` instead of `'The email field is required'`), inference may not match.
- **NestJS/class-validator does not have this limitation** because it transmits the constraint key directly (e.g. `isEmail`, `isNotEmpty`).

When inference fails, you have several options:

```typescript
// Custom constraintMap to override specific mappings
const bridge = createFormBridge(form, {
  preset: laravelPreset(),
  constraintMap: { 'mon_erreur_custom': 'required' },
});

// Use catchAll to apply all unmatched errors as { generic: msg }
const bridge = createFormBridge(form, {
  preset: laravelPreset(),
  catchAll: true,
});

// Write a custom preset for full control
```

## Angular Compatibility

| ngx-api-forms | Angular |
|:---:|:---:|
| 1.x | 17.x, 18.x, 19.x, 20.x |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - [Mikhael GERBET](https://github.com/MikhaelGerbet)
