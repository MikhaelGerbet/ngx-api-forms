/**
 * Standalone utility functions for common form operations.
 * These are tree-shakeable and don't require DI.
 */
import { FormGroup } from '@angular/forms';
import { Observable, tap, catchError } from 'rxjs';
import { ApiFieldError, ErrorPreset, EnableFormOptions, DisableFormOptions } from '../models/api-forms.models';
import { classValidatorPreset } from '../presets/class-validator.preset';

/**
 * Parse raw API error body into normalized field errors without touching any form.
 * Tries each preset in order until one returns results.
 *
 * Use this when you only need the parsing logic (e.g. in an HttpInterceptor,
 * a store effect, or any context where you don't have a FormBridge).
 *
 * @param apiError - The raw error body from the API (e.g. `err.error`)
 * @param preset - One or more presets to try. Defaults to class-validator.
 * @param options - Optional settings. `debug: true` logs a warning when no preset matches.
 * @returns Normalized array of field errors
 *
 * @example
 * ```typescript
 * import { parseApiErrors, laravelPreset } from 'ngx-api-forms';
 *
 * const errors = parseApiErrors(err.error, laravelPreset());
 * // [{ field: 'email', constraint: 'required', message: 'The email field is required.' }]
 * ```
 */
export function parseApiErrors(
  apiError: unknown,
  preset?: ErrorPreset | ErrorPreset[],
  options?: { debug?: boolean },
): ApiFieldError[] {
  const presets = preset
    ? (Array.isArray(preset) ? preset : [preset])
    : [classValidatorPreset()];

  for (const p of presets) {
    const result = p.parse(apiError);
    if (result.length > 0) return result;
  }

  if (options?.debug) {
    console.warn(
      '[ngx-api-forms] parseApiErrors: no preset produced results.',
      'Presets tried:', presets.map(p => p.name).join(', '),
      'Payload:', apiError,
    );
  }

  return [];
}

/**
 * Wrap an Observable with form submit lifecycle management.
 *
 * Standalone submit helper. Useful when you want disable/enable lifecycle
 * without a full FormBridge instance.
 *
 * - Disables the form before subscribing
 * - Re-enables the form on success or error
 * - Returns the original Observable (errors are re-thrown)
 *
 * @param form - The FormGroup to manage
 * @param source - The Observable to wrap (e.g. HttpClient call)
 * @param options.onError - Callback invoked with the error before re-throwing
 * @returns The wrapped Observable
 *
 * @example
 * ```typescript
 * import { wrapSubmit } from 'ngx-api-forms';
 *
 * wrapSubmit(this.form, this.http.post('/api', data), {
 *   onError: (err) => this.bridge.applyApiErrors(err.error),
 * }).subscribe();
 * ```
 */
export function wrapSubmit<T>(
  form: FormGroup,
  source: Observable<T>,
  options?: { onError?: (err: unknown) => void },
): Observable<T> {
  form.disable();
  return source.pipe(
    tap(() => form.enable()),
    catchError((err) => {
      form.enable();
      options?.onError?.(err);
      throw err;
    }),
  );
}

/**
 * Convert a plain object to FormData.
 * Handles Files, Blobs, Arrays, Dates, nested objects.
 */
export function toFormData(data: Record<string, unknown>): FormData {
  const formData = new FormData();

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;

    if (value instanceof File || value instanceof Blob) {
      formData.append(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item instanceof File || item instanceof Blob) {
          formData.append(key, item);
        } else if (typeof item === 'object' && item !== null) {
          formData.append(key, JSON.stringify(item));
        } else {
          formData.append(key, String(item));
        }
      }
      continue;
    }

    if (value instanceof Date) {
      formData.append(key, value.toISOString());
      continue;
    }

    if (typeof value === 'object') {
      formData.append(key, JSON.stringify(value));
      continue;
    }

    formData.append(key, String(value));
  }

  return formData;
}

/**
 * Enable all controls in a form, with optional exceptions.
 */
export function enableForm(form: FormGroup, options?: EnableFormOptions): void {
  for (const key of Object.keys(form.controls)) {
    if (options?.except?.includes(key)) continue;
    form.controls[key].enable();
  }
  form.updateValueAndValidity({ onlySelf: false, emitEvent: true });
}

/**
 * Disable all controls in a form, with optional exceptions.
 */
export function disableForm(form: FormGroup, options?: DisableFormOptions): void {
  for (const key of Object.keys(form.controls)) {
    if (options?.except?.includes(key)) continue;
    form.controls[key].disable();
  }
}

/**
 * Reset all errors on a form's controls (client-side and API).
 */
export function clearFormErrors(form: FormGroup): void {
  for (const key of Object.keys(form.controls)) {
    form.controls[key].setErrors(null);
    form.controls[key].updateValueAndValidity();
  }
  form.updateValueAndValidity({ onlySelf: false, emitEvent: true });
}

/**
 * Get a flat record of only the dirty (changed) fields.
 */
export function getDirtyValues(form: FormGroup): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(form.controls)) {
    if (form.controls[key].dirty) {
      result[key] = form.controls[key].value;
    }
  }
  return result;
}

/**
 * Check if any control in the form has a specific error key.
 */
export function hasError(form: FormGroup, errorKey: string): boolean {
  for (const key of Object.keys(form.controls)) {
    if (form.controls[key].hasError(errorKey)) {
      return true;
    }
  }
  return false;
}

/**
 * Get the error message for a specific field and error key.
 * Returns the error value if it's a string, otherwise the error key.
 */
export function getErrorMessage(form: FormGroup, fieldName: string, errorKey?: string): string | null {
  const control = form.controls[fieldName];
  if (!control?.errors) return null;

  if (errorKey) {
    const value = control.errors[errorKey];
    return value ? (typeof value === 'string' ? value : errorKey) : null;
  }

  // Return first error
  const keys = Object.keys(control.errors);
  if (keys.length === 0) return null;

  const firstValue = control.errors[keys[0]];
  return typeof firstValue === 'string' ? firstValue : keys[0];
}
