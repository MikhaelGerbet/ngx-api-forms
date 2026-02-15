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

## When NOT to Use This

This library is not a universal error handler. It only helps when your API returns **structured, field-level validation errors** (e.g. `{ email: ["required"] }`). If your backend returns flat messages like `{ message: "Bad request" }` or `{ error: "Something went wrong" }` with no per-field breakdown, ngx-api-forms cannot map anything to form controls.

In practice, this rules out:
- APIs that only return a single error string for the whole request
- APIs returning generic 500 errors
- Errors not tied to user input (infrastructure failures, rate limiting)

If you're unsure whether your backend is compatible, call `parseApiErrors(err.error, yourPreset())` in a test and check the output. If it returns an empty array, the format is not supported and you either need a custom preset or this library is not the right tool.

## Quick Start

### Minimal: parse errors without a form

```typescript
import { parseApiErrors } from 'ngx-api-forms';
import { laravelPreset } from 'ngx-api-forms/laravel';

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

Presets are imported from secondary entry points for tree-shaking:

```typescript
// Core (FormBridge, classValidatorPreset, utilities, interceptor)
import { provideFormBridge, classValidatorPreset } from 'ngx-api-forms';

// Other presets - import only what you use
import { djangoPreset } from 'ngx-api-forms/django';
import { laravelPreset } from 'ngx-api-forms/laravel';
import { zodPreset } from 'ngx-api-forms/zod';
```

If your project uses `ng add`:

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

## Constraint Inference and i18n Limitation

The Laravel, Django, and Zod presets infer constraint types (e.g. "required", "email") by pattern-matching on the English text of error messages. This works reliably with default backend messages.

When a message does not match any pattern, the constraint falls back to `'serverError'` with the original message preserved as the error value. This means unrecognized messages are never lost -- they still appear on the form control.

Known limitations:

- **Translated messages**: If your backend returns messages in French, German, or any non-English locale, most messages will fall back to `'serverError'`. The inference functions only match English patterns like "this field is required" or "must be a valid email".
- **Custom messages**: Overridden validation messages may not match the built-in patterns.
- **NestJS/class-validator does not have this limitation** because it transmits the constraint key directly (e.g. `isEmail`, `isNotEmpty`), regardless of message language.

When inference is not enough:

```typescript
import { laravelPreset } from 'ngx-api-forms/laravel';

// 1. Disable inference entirely -- all errors get constraint 'serverError'
//    Useful when you handle all mapping via constraintMap
const bridge = provideFormBridge(form, {
  preset: laravelPreset({ noInference: true }),
  constraintMap: {
    serverError: 'serverError',
    // Map your own constraint names to Angular error keys
  },
});

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

## Global Errors

Some backends return errors not tied to any specific field -- Django's `non_field_errors`, Zod's `formErrors`, or a field name that does not match any form control. These errors are collected in `globalErrorsSignal` instead of being silently dropped.

```typescript
bridge.applyApiErrors({
  non_field_errors: ['Unable to log in with provided credentials.'],
  email: ['This field is required.'],
});

// Field errors are applied to form controls as usual
console.log(form.controls.email.hasError('required')); // true

// Global errors are available via dedicated signal
console.log(bridge.globalErrorsSignal());
// [{ message: 'Unable to log in with provided credentials.', constraint: 'serverError' }]
```

`clearApiErrors()` clears both field errors and global errors. The `hasErrorsSignal` signal accounts for global errors too.

Unmatched fields (errors referencing a field that does not exist in the form) are also routed to `globalErrorsSignal` with the original field name preserved in the `originalField` property.

## Switching Backends

Each backend has its own preset, imported from a secondary entry point. Pass an array if your app talks to multiple APIs -- they are tried in order until one matches.

```typescript
import { laravelPreset } from 'ngx-api-forms/laravel';
import { djangoPreset } from 'ngx-api-forms/django';
import { zodPreset } from 'ngx-api-forms/zod';
import { classValidatorPreset } from 'ngx-api-forms';

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

## Automatic Error Handling with HttpInterceptor

The library ships a ready-to-use `apiErrorInterceptor` that catches 422/400 responses and applies errors to the right FormBridge automatically. Zero error handling code in `subscribe()`.

### Setup

```typescript
// app.config.ts
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { apiErrorInterceptor } from 'ngx-api-forms';

export const appConfig = {
  providers: [
    provideHttpClient(
      withInterceptors([apiErrorInterceptor()])
    ),
  ],
};
```

### Per-request: tag with `withFormBridge()`

```typescript
import { withFormBridge } from 'ngx-api-forms';

// Errors are applied to the bridge automatically -- no error handler needed
this.http.post('/api/save', data, withFormBridge(this.bridge)).subscribe({
  next: () => this.router.navigate(['/done']),
});
```

### Global: centralize with `onError`

```typescript
// Catch all 422 errors, whether or not a FormBridge is attached
apiErrorInterceptor({
  preset: classValidatorPreset(),
  onError: (errors, response) => {
    this.errorStore.setFieldErrors(errors);
    this.toastService.show(`${errors.length} validation error(s)`);
  },
})
```

### Custom status codes

```typescript
apiErrorInterceptor({ statusCodes: [422] }) // only 422, not 400
```

### Standalone: `parseApiErrors` in your own interceptor

If you prefer full control, use `parseApiErrors` directly in a custom `HttpInterceptorFn`:

```typescript
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { parseApiErrors, classValidatorPreset } from 'ngx-api-forms';

export const myInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 422) {
        const fieldErrors = parseApiErrors(err.error, classValidatorPreset());
        // route to your store, service, or whatever you need
      }
      return throwError(() => err);
    }),
  );
};
```

## Resource Integration (Angular 19+)

When using `resource()` or `rxResource()`, wire the error signal to a FormBridge with a simple `effect()`. No dedicated helper needed -- the pattern is three lines:

```typescript
import { effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { provideFormBridge } from 'ngx-api-forms';
import { djangoPreset } from 'ngx-api-forms/django';

@Component({ ... })
export class EditComponent {
  private http = inject(HttpClient);
  form = inject(FormBuilder).group({ name: [''], email: [''] });
  bridge = provideFormBridge(this.form, { preset: djangoPreset() });

  saveResource = rxResource({
    loader: () => this.http.put('/api/profile', this.form.value),
  });

  // Wire resource errors to the bridge
  private errorEffect = effect(() => {
    const error = this.saveResource.error();
    if (error) {
      this.bridge.applyApiErrors(error);
    } else {
      this.bridge.clearApiErrors();
    }
  });
}
```

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

### `parseApiErrors(error, preset?, options?)`

Parse API errors without a form. Works in interceptors, stores, effects, tests -- anywhere. Returns `ApiFieldError[]`.

```typescript
import { parseApiErrors } from 'ngx-api-forms';
import { laravelPreset } from 'ngx-api-forms/laravel';

const errors = parseApiErrors(err.error, laravelPreset());
// [{ field: 'email', constraint: 'required', message: 'The email field is required.' }]
```

### HttpInterceptor

| Export | Description |
|--------|-------------|
| `apiErrorInterceptor(config?)` | Functional interceptor. Catches 422/400 and auto-applies errors to tagged bridges |
| `withFormBridge(bridge)` | Attach a FormBridge to an HTTP request via HttpContext |
| `FORM_BRIDGE` | The `HttpContextToken` used internally (advanced) |

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
| `errorsSignal` | `Signal<ResolvedFieldError[]>` | All current field-level API errors |
| `globalErrorsSignal` | `Signal<GlobalError[]>` | Non-field errors (Django `non_field_errors`, Zod `formErrors`, unmatched fields) |
| `firstErrorSignal` | `Signal<FirstError \| null>` | First error, or null |
| `hasErrorsSignal` | `Signal<boolean>` | Whether any API errors exist (field or global) |

### Constants

| Export | Description |
|--------|-------------|
| `GLOBAL_ERROR_FIELD` | Sentinel field name (`'__global__'`) used by presets to mark non-field errors |

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
laravelPreset({ noInference: true })
djangoPreset({ noInference: true })
zodPreset({ noInference: true })
classValidatorPreset({ noInference: true })  // only affects string message fallback
```

When `noInference: true`, all errors use `constraint: 'serverError'` with the original message preserved. Since the default fallback is also `'serverError'`, this flag is mainly useful when you want to prevent even successful inference from running (e.g. you handle all constraint mapping via `constraintMap` instead).

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
