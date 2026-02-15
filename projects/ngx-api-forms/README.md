# ngx-api-forms

**API error parsing library for Angular.** Normalizes validation error responses from any backend into a consistent format your forms can consume. Not a display library -- a parsing library.

[![npm version](https://img.shields.io/npm/v/ngx-api-forms?style=flat-square)](https://www.npmjs.com/package/ngx-api-forms)
[![License: MIT](https://img.shields.io/npm/l/ngx-api-forms?style=flat-square)](LICENSE)
[![Angular 17+](https://img.shields.io/badge/Angular-17%2B-dd0031?style=flat-square&logo=angular)](https://angular.dev)
[![CI/CD](https://img.shields.io/github/actions/workflow/status/MikhaelGerbet/ngx-api-forms/ci.yml?style=flat-square&label=CI%2FCD)](https://github.com/MikhaelGerbet/ngx-api-forms/actions)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square)](https://www.npmjs.com/package/ngx-api-forms?activeTab=dependencies)

**[Live Demo](https://mikhaelgerbet.github.io/ngx-api-forms/)**

## The Problem

Libraries like `@ngneat/error-tailor` or `ngx-valdemort` handle the **display** side -- rendering `Validators.required` messages in templates. But when your API returns a 422, those libraries can't help. You're left writing backend-specific parsing logic by hand:

```typescript
// Brittle, repetitive, backend-specific
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

Switch from NestJS to Laravel and every error handler must be rewritten. Ten forms means ten copies of the same parsing logic. Most teams flatten everything into `{ serverError: message }`, losing constraint semantics entirely.

**ngx-api-forms fills the gap between the API and Reactive Forms.**

## When NOT to Use This

This library only helps when your API returns **structured, field-level validation errors** (e.g. `{ email: ["required"] }`). If your backend returns flat messages like `{ message: "Bad request" }` with no per-field breakdown, ngx-api-forms cannot map anything to form controls.

In practice, this rules out:
- APIs that only return a single error string for the whole request
- Generic 500 errors
- Errors not tied to user input (infrastructure failures, rate limiting)

If you're unsure, call `parseApiErrors(err.error, yourPreset())` and check the output. Empty array means the format is not supported.

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

Import the core library and the preset for your backend:

```typescript
// Core (FormBridge, interceptor, utilities, classValidatorPreset)
import { provideFormBridge, classValidatorPreset } from 'ngx-api-forms';

// Backend-specific presets (secondary entry points, tree-shakable)
import { laravelPreset } from 'ngx-api-forms/laravel';
import { djangoPreset } from 'ngx-api-forms/django';
import { zodPreset }    from 'ngx-api-forms/zod';
import { expressValidatorPreset } from 'ngx-api-forms/express-validator';
import { analogPreset } from 'ngx-api-forms/analog';
```

Each preset is a separate entry point. If you only use `laravelPreset`, the Django, Zod, express-validator, and Analog code is never included in your bundle.

`ng add` installs the package and auto-injects `apiErrorInterceptor` into your `app.config.ts`:

```bash
ng add ngx-api-forms --preset=laravel
```

Available presets: `laravel`, `django`, `class-validator`, `zod`, `express-validator`, `analog`.

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

### Express / express-validator
```json
{
  "errors": [
    { "type": "field", "path": "email", "msg": "Invalid value", "location": "body" }
  ]
}
```

Also handles the legacy v5/v6 format (`{ param, msg }`) and direct arrays.

### Analog (Nitro/h3)
```json
{
  "statusCode": 422,
  "statusMessage": "Validation failed",
  "data": {
    "email": ["This field is required."],
    "name": ["Must be at least 3 characters."]
  }
}
```

Unwraps the Nitro/h3 `createError()` envelope. Also handles direct `{ field: string[] }` format without the envelope.

## Constraint Inference and i18n Limitation

The Laravel, Django, Zod, and express-validator presets infer constraint types (e.g. "required", "email") by pattern-matching on the English text of error messages. This works reliably with default backend messages.

When a message does not match any pattern, the constraint falls back to `'serverError'` with the original message preserved. Unrecognized messages are never lost.

**Important: inference only works with default English messages.** The built-in regex patterns match strings like `"The email field is required."` (Laravel) or `"This field is required."` (Django). If your backend returns messages in another language (e.g. `"Ce champ est obligatoire."`), the pattern will not match and the error will use `constraint: 'serverError'` instead of `constraint: 'required'`.

This is by design: parsing free-text in multiple languages reliably is not feasible. If your backend returns non-English messages, you have several options:

Known limitations:

- **Translated messages**: Non-English messages fall back to `'serverError'`.
- **Custom messages**: Overridden validation messages may not match the built-in patterns.
- **NestJS/class-validator does not have this limitation** because it transmits the constraint key directly.

When inference is not enough:

```typescript
// 1. Disable inference entirely and use the raw message
const bridge = provideFormBridge(form, {
  preset: laravelPreset({ noInference: true }),
});
// All errors get constraint: 'serverError' with the original message preserved.
// Display the message directly in your template.

// 2. Custom constraintMap to map specific messages to constraints
const bridge = provideFormBridge(form, {
  preset: laravelPreset(),
  constraintMap: {
    'Ce champ est obligatoire.': 'required',
    'Adresse email invalide.': 'email',
  },
});

// 3. catchAll to apply unmatched errors as { generic: msg }
const bridge = provideFormBridge(form, {
  preset: laravelPreset(),
  catchAll: true,
});

// 4. constraintPatterns: provide regex patterns for your language
const bridge = provideFormBridge(form, {
  preset: laravelPreset({
    constraintPatterns: {
      required: /est obligatoire/i,
      email: /courriel.*invalide/i,
      minlength: /au moins \d+ caract/i,
    },
  }),
});
// User patterns are checked first; unmatched messages fall through to English inference.

// 5. Write a custom preset for full control (see below)
```

### Schema-Based Inference

When your backend returns structured error codes alongside messages, presets use them directly without text matching. This makes constraint inference fully language-independent.

```json
// Django DRF with custom exception handler
{ "email": [{ "message": "Ce champ est obligatoire.", "code": "required" }] }

// Laravel with rule names
{ "errors": { "email": [{ "message": "Le champ est requis.", "rule": "required" }] } }

// express-validator with code field
{ "errors": [{ "type": "field", "path": "email", "msg": "Adresse invalide", "code": "email" }] }
```

When `code` (Django/Analog), `rule` (Laravel), or `code` (express-validator) is present, the value is used as the constraint directly. No regex matching, no language assumption. Falls back to text inference when the structured field is absent.

## Global Errors

Some backends return errors not tied to any specific field -- Django's `non_field_errors`, Zod's `formErrors`, or a field name that does not match any form control. These errors are collected in `globalErrorsSignal` instead of being silently dropped.

```typescript
bridge.applyApiErrors({
  non_field_errors: ['Unable to log in with provided credentials.'],
  email: ['This field is required.'],
});

// Field errors applied to controls
console.log(form.controls.email.hasError('required')); // true

// Global errors available via signal
console.log(bridge.globalErrorsSignal());
// [{ message: 'Unable to log in with provided credentials.', constraint: 'serverError' }]
```

`clearApiErrors()` clears both field errors and global errors. `hasErrorsSignal` accounts for global errors too.

Unmatched fields (errors referencing a field that does not exist in the form) are also routed to `globalErrorsSignal` with the original field name preserved in the `originalField` property.

## Switching Backends

Each backend has its own preset. Pass an array if your app talks to multiple APIs -- they are tried in order until one matches.

```typescript
import { provideFormBridge, classValidatorPreset } from 'ngx-api-forms';
import { laravelPreset } from 'ngx-api-forms/laravel';
import { djangoPreset } from 'ngx-api-forms/django';
import { zodPreset }    from 'ngx-api-forms/zod';
import { expressValidatorPreset } from 'ngx-api-forms/express-validator';
import { analogPreset } from 'ngx-api-forms/analog';

// Laravel
const bridge = provideFormBridge(form, { preset: laravelPreset() });

// Django REST Framework
const bridge = provideFormBridge(form, { preset: djangoPreset() });

// Zod (e.g. with tRPC)
const bridge = provideFormBridge(form, { preset: zodPreset() });

// Express / express-validator
const bridge = provideFormBridge(form, { preset: expressValidatorPreset() });

// Analog (Nitro/h3)
const bridge = provideFormBridge(form, { preset: analogPreset() });

// Multiple presets, tried in order
const bridge = provideFormBridge(form, {
  preset: [classValidatorPreset(), laravelPreset()]
});
```

## Automatic Error Handling with HttpInterceptor

The library ships a ready-to-use `apiErrorInterceptor` that catches 422/400 responses and applies errors to the right FormBridge automatically.

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

// Errors are applied automatically -- no error handler needed
this.http.post('/api/save', data, withFormBridge(this.bridge)).subscribe({
  next: () => this.router.navigate(['/done']),
});
```

### Global: centralize with `onError`

```typescript
apiErrorInterceptor({
  preset: classValidatorPreset(),
  onError: (errors, response) => {
    errorStore.setFieldErrors(errors);
  },
})
```

### Standalone: `parseApiErrors` in your own interceptor

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

When using `resource()` or `rxResource()`, a simple `effect()` is all you need to wire the error signal to a FormBridge:

```typescript
import { effect } from '@angular/core';
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

  private ref = effect(() => {
    const err = this.saveResource.error();
    err ? this.bridge.applyApiErrors(err) : this.bridge.clearApiErrors();
  });
}
```

This pattern works with any `Signal<unknown>` -- not limited to Angular resources. No wrapper API needed: Angular's `effect()` already tracks signal dependencies and re-runs when the error changes.

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

Create with `provideFormBridge(form, config?)` or `createFormBridge(form, config?)`. Both are equivalent.

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

All built-in presets accept a `noInference` option. The Laravel, Django, Zod, and express-validator presets also accept `constraintPatterns` for custom i18n regex matching:

```typescript
// Skip inference entirely
laravelPreset({ noInference: true })
djangoPreset({ noInference: true })
zodPreset({ noInference: true })
expressValidatorPreset({ noInference: true })
analogPreset({ noInference: true })
classValidatorPreset({ noInference: true })  // only affects string message fallback

// Provide regex patterns for non-English messages
laravelPreset({
  constraintPatterns: {
    required: /est obligatoire/i,
    email: /courriel.*invalide/i,
  },
})
```

When `noInference: true`, all errors use `constraint: 'serverError'` with the original message preserved.

`constraintPatterns` takes a `Record<string, RegExp>`. Each regex is tested against the raw error message. Matched patterns return the corresponding constraint key. Unmatched messages fall through to the default English inference.

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
