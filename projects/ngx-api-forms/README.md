# ngx-api-forms

Angular library that maps API validation errors to Reactive Forms controls. Works with NestJS (class-validator), Laravel, Django REST Framework, and Zod out of the box.

[![npm version](https://img.shields.io/npm/v/ngx-api-forms?style=flat-square)](https://www.npmjs.com/package/ngx-api-forms)
[![License: MIT](https://img.shields.io/npm/l/ngx-api-forms?style=flat-square)](LICENSE)
[![Angular 17+](https://img.shields.io/badge/Angular-17%2B-dd0031?style=flat-square&logo=angular)](https://angular.dev)
[![CI/CD](https://img.shields.io/github/actions/workflow/status/MikhaelGerbet/ngx-api-forms/ci.yml?style=flat-square&label=CI%2FCD)](https://github.com/MikhaelGerbet/ngx-api-forms/actions)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square)](https://www.npmjs.com/package/ngx-api-forms?activeTab=dependencies)

**[Live Demo](https://mikhaelgerbet.github.io/ngx-api-forms/)**

## Why

Most Angular apps that talk to a backend with validation end up writing repetitive, fragile code to map server errors onto form controls:

```typescript
// Typical approach - string matching, duplicated across components
if (error.includes('email is already used')) {
  this.form.controls['email'].setErrors({ emailAlreadyUsed: error });
}
if (error.includes('name must be shorter')) {
  this.form.controls['name'].setErrors({ maxlength: error });
}
// ... repeated for every field and every possible error
```

ngx-api-forms replaces all of that with a single call:

```typescript
bridge.applyApiErrors(err.error);
// Errors are parsed, matched to the right controls, and applied.
```

## Features

- **Multi-backend presets** - NestJS/class-validator, Laravel, Django REST, Zod
- **i18n support** - translation key prefixes or custom resolver functions
- **Angular Signals** - reactive error state via `errorsSignal`, `firstErrorSignal`, `hasErrorsSignal`
- **SSR compatible** - no browser-only APIs
- **Tree-shakeable** - import only what you need
- **Error directive** - `ngxFormError` for declarative error display in templates
- **Submit state management** - `handleSubmit()` wraps API calls, disables form, applies errors on failure
- **Extensible** - custom presets, interceptors, constraint maps
- **Zero dependencies** - only Angular as peer dependency

## Installation

```bash
npm install ngx-api-forms
```

## Quick Start

### 1. Create a FormBridge

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

### 2. Switch Backend

Each backend has its own preset. You can also pass an array of presets if your app talks to multiple APIs - they are tried in order until one matches.

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
| `handleSubmit(source)` | `Observable<T>` | Wrap an Observable: disable form, apply errors on failure, re-enable |
| `addInterceptor(fn)` | `() => void` | Register an error interceptor. Returns a dispose function |
| `checkDirty()` | `boolean` | Check if form differs from defaults |
| `destroy()` | `void` | Clean up internal subscriptions |

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
}
```

### i18n

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

### Submit and Loading State

`handleSubmit()` wraps an Observable (typically an HTTP call) and handles the full submit lifecycle: disabling the form, tracking loading state via `isSubmittingSignal`, and applying API errors on failure.

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

In the template:

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

### Error Interceptors

Interceptors let you filter or transform errors before they reach the form.

```typescript
const dispose = bridge.addInterceptor((errors, form) => {
  return errors.filter(e => e.field !== 'internalField');
});
// Later: dispose() to remove the interceptor
```

### Standalone Utility Functions

All utility functions are tree-shakeable and can be used independently of FormBridge.

```typescript
import {
  toFormData,
  enableForm,
  disableForm,
  clearFormErrors,
  getDirtyValues,
  hasError,
  getErrorMessage,
} from 'ngx-api-forms';

const formData = toFormData(myForm.getRawValue());
disableForm(myForm, { except: ['email'] });
const dirty = getDirtyValues(myForm);
```

### NgxFormError Directive

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

## Angular Compatibility

| ngx-api-forms | Angular |
|:---:|:---:|
| 1.x | 17.x, 18.x, 19.x, 20.x |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - [Mikhael GERBET](https://github.com/MikhaelGerbet)
