/**
 * FormBridge - The core class of ngx-api-forms.
 *
 * Bridges API validation errors to Angular Reactive Forms with:
 * - Automatic error parsing via presets (class-validator, Laravel, Django, Zod)
 * - i18n-friendly error messages
 * - Angular Signals support
 * - SSR-safe operations
 */
import { signal, computed, Signal, WritableSignal } from '@angular/core';
import { FormGroup, FormArray, ValidationErrors, AbstractControl } from '@angular/forms';

import {
  ApiFieldError,
  ConstraintMap,
  ErrorInterceptor,
  ErrorPreset,
  FirstError,
  FormBridgeConfig,
  GlobalError,
  GLOBAL_ERROR_FIELD,
  I18nConfig,
  ResolvedFieldError,
} from '../models/api-forms.models';
import { CLASS_VALIDATOR_CONSTRAINT_MAP, classValidatorPreset } from '../presets/class-validator.preset';


/**
 * FormBridge wraps an Angular FormGroup and provides a clean API
 * for bridging API validation errors and managing form state.
 *
 * @example
 * ```typescript
 * const bridge = new FormBridge(myForm, {
 *   preset: classValidatorPreset(),
 * });
 *
 * // Apply API errors
 * bridge.applyApiErrors(err.error);
 *
 * // Use signals in templates
 * readonly errors = bridge.errorsSignal;
 * readonly firstError = bridge.firstErrorSignal;
 * ```
 */
export class FormBridge<T extends FormGroup = FormGroup> {
  private readonly _form: T;
  private readonly _presets: ErrorPreset[];
  private readonly _constraintMap: ConstraintMap;
  private readonly _i18n: I18nConfig | undefined;
  private readonly _catchAll: boolean;
  private readonly _mergeErrors: boolean;
  private readonly _debug: boolean;
  private _interceptors: ErrorInterceptor[] = [];

  /** Signal containing the last set of resolved API errors */
  private readonly _apiErrors: WritableSignal<ResolvedFieldError[]> = signal([]);

  /** Signal containing global (non-field) errors */
  private readonly _globalErrors: WritableSignal<GlobalError[]> = signal([]);

  /** Tracks which error keys were set by the API on each control */
  private _apiErrorKeys = new Map<AbstractControl, Set<string>>();

  // ---- Public Signals ----

  /** Reactive signal of all current API errors applied to the form */
  readonly errorsSignal: Signal<ResolvedFieldError[]> = this._apiErrors.asReadonly();

  /**
   * Reactive signal of global (non-field) errors.
   *
   * Contains errors from:
   * - Django `non_field_errors` / `detail`
   * - Zod `formErrors`
   * - Any API error whose field does not match a form control
   */
  readonly globalErrorsSignal: Signal<GlobalError[]> = this._globalErrors.asReadonly();

  /** Reactive signal of the first error (or null) */
  readonly firstErrorSignal: Signal<FirstError | null> = computed(() => {
    const errors = this._apiErrors();
    return errors.length > 0 ? errors[0] : null;
  });

  /** Whether any API errors are currently applied */
  readonly hasErrorsSignal: Signal<boolean> = computed(() =>
    this._apiErrors().length > 0 || this._globalErrors().length > 0,
  );

  constructor(form: T, config?: FormBridgeConfig) {
    this._form = form;
    this._catchAll = config?.catchAll ?? false;
    this._mergeErrors = config?.mergeErrors ?? false;
    this._debug = config?.debug ?? false;
    this._i18n = config?.i18n;

    // Resolve presets
    if (config?.preset) {
      this._presets = Array.isArray(config.preset) ? config.preset : [config.preset];
    } else {
      this._presets = [classValidatorPreset()];
    }

    // Build constraint map: preset defaults + custom overrides
    const presetDefaults = this._resolvePresetConstraintMap(this._presets);
    this._constraintMap = {
      ...presetDefaults,
      ...(config?.constraintMap ?? {}),
    };
  }

  // ---- Public API - Error Management ----

  /**
   * Parse and apply API validation errors to the form.
   *
   * Tries each configured preset in order until one returns results.
   * Errors are mapped to Angular form control errors.
   *
   * @param apiError - The raw error body from the API (e.g. `err.error`)
   * @returns The array of resolved field errors that were applied
   */
  applyApiErrors(apiError: unknown): ResolvedFieldError[] {
    let fieldErrors: ApiFieldError[] = [];

    // Try each preset until one returns results
    for (const preset of this._presets) {
      fieldErrors = preset.parse(apiError);
      if (fieldErrors.length > 0) break;
    }

    if (this._debug && fieldErrors.length === 0) {
      console.warn(
        '[ngx-api-forms] No preset produced results for the given error payload.',
        'Presets tried:', this._presets.map(p => p.name).join(', '),
        'Payload:', apiError,
      );
    }

    // Run interceptors
    for (const interceptor of this._interceptors) {
      fieldErrors = interceptor(fieldErrors, this._form);
    }

    // Map and apply to form
    const resolved = this._applyErrors(fieldErrors);
    this._apiErrors.set(resolved);

    return resolved;
  }

  /**
   * Clear only the errors that were set by `applyApiErrors()`.
   * Client-side validation errors (e.g. `Validators.required`) are preserved.
   */
  clearApiErrors(): void {
    for (const [control, keys] of this._apiErrorKeys) {
      if (!control.errors) continue;
      const remaining = { ...control.errors };
      for (const key of keys) {
        delete remaining[key];
      }
      control.setErrors(Object.keys(remaining).length > 0 ? remaining : null);
      control.updateValueAndValidity();
    }
    this._apiErrorKeys.clear();
    this._form.updateValueAndValidity({ onlySelf: false, emitEvent: true });
    this._apiErrors.set([]);
    this._globalErrors.set([]);
  }

  /**
   * Get the first error across all form controls.
   */
  getFirstError(): FirstError | null {
    // Check API errors first
    const apiErrors = this._apiErrors();
    if (apiErrors.length > 0) {
      return apiErrors[0];
    }

    // Fall back to client-side validation errors
    for (const key of Object.keys(this._form.controls)) {
      const control = this._form.controls[key];
      if (control?.errors) {
        const errorKeys = Object.keys(control.errors);
        if (errorKeys.length > 0) {
          const errorKey = errorKeys[0];
          const errorValue = control.errors[errorKey];
          return {
            field: key,
            errorKey,
            message: typeof errorValue === 'string' ? errorValue : errorKey,
          };
        }
      }
    }

    return null;
  }

  /**
   * Get all errors for a specific field.
   */
  getFieldErrors(fieldName: string): ValidationErrors | null {
    return this._form.controls[fieldName]?.errors ?? null;
  }

  /**
   * Register an error interceptor that can modify or filter errors
   * before they are applied to the form.
   * Returns a dispose function to remove the interceptor.
   */
  addInterceptor(interceptor: ErrorInterceptor): () => void {
    this._interceptors.push(interceptor);
    return () => {
      this._interceptors = this._interceptors.filter(i => i !== interceptor);
    };
  }

  // ---- Public API - Utilities ----

  /**
   * Access the underlying FormGroup.
   */
  get form(): T {
    return this._form;
  }

  // ---- Private Methods ----

  private _resolvePresetConstraintMap(presets: ErrorPreset[]): ConstraintMap {
    const merged: ConstraintMap = {};
    for (const preset of presets) {
      if (preset.constraintMap) Object.assign(merged, preset.constraintMap);
    }
    // If no preset provided a constraint map, fall back to class-validator
    if (Object.keys(merged).length === 0) {
      Object.assign(merged, CLASS_VALIDATOR_CONSTRAINT_MAP);
    }
    return merged;
  }

  private _applyErrors(fieldErrors: ApiFieldError[]): ResolvedFieldError[] {
    const resolved: ResolvedFieldError[] = [];
    const globalErrors: GlobalError[] = [];

    // Accumulate errors per control to avoid overwrite within a single applyApiErrors call
    const pendingErrors = new Map<AbstractControl, ValidationErrors>();

    for (const fieldError of fieldErrors) {
      // Global errors (explicit sentinel or unmatched field)
      if (fieldError.field === GLOBAL_ERROR_FIELD) {
        globalErrors.push({
          message: fieldError.message,
          constraint: fieldError.constraint,
        });
        continue;
      }

      let control: AbstractControl | null = this._form.controls[fieldError.field] ?? null;
      if (!control) {
        // Try nested path (e.g. 'address.city' or 'items.0.name')
        control = this._resolveNestedControl(fieldError.field);
        if (!control) {
          // Route unmatched field errors to global errors
          globalErrors.push({
            message: fieldError.message,
            constraint: fieldError.constraint,
            originalField: fieldError.field,
          });
          if (this._debug) {
            console.warn(
              `[ngx-api-forms] Field "${fieldError.field}" does not match any form control - routed to globalErrorsSignal.`,
              'Available controls:', Object.keys(this._form.controls).join(', '),
            );
          }
          continue;
        }
      }

      const errorKey = this._resolveErrorKey(fieldError.constraint);
      const message = this._resolveMessage(fieldError);

      if (!errorKey && !this._catchAll) continue;

      const finalErrorKey = errorKey || 'generic';

      // Deduplicate: if the same key already exists on this control, suffix it
      const existing = pendingErrors.get(control) ?? (this._mergeErrors ? (control.errors ?? {}) : {});
      let uniqueKey = finalErrorKey;
      if (existing[uniqueKey] !== undefined) {
        let idx = 1;
        while (existing[`${finalErrorKey}_${idx}`] !== undefined) idx++;
        uniqueKey = `${finalErrorKey}_${idx}`;
      }
      pendingErrors.set(control, { ...existing, [uniqueKey]: message });

      // Track this key as API-set
      if (!this._apiErrorKeys.has(control)) {
        this._apiErrorKeys.set(control, new Set());
      }
      this._apiErrorKeys.get(control)!.add(uniqueKey);

      resolved.push({ field: fieldError.field, errorKey: uniqueKey, message });
    }

    // Apply accumulated errors once per control
    for (const [control, errors] of pendingErrors) {
      control.markAsTouched();
      control.setErrors(errors);
    }

    // Publish global errors
    this._globalErrors.set(globalErrors);

    return resolved;
  }

  private _resolveNestedControl(path: string): AbstractControl | null {
    const parts = path.split('.');
    let current: AbstractControl = this._form;

    for (const part of parts) {
      if (current instanceof FormGroup) {
        const child = current.controls[part];
        if (!child) return null;
        current = child;
      } else if (current instanceof FormArray) {
        const index = parseInt(part, 10);
        if (isNaN(index) || index < 0 || index >= current.length) return null;
        current = current.at(index);
      } else {
        return null;
      }
    }

    return current;
  }

  private _resolveErrorKey(constraint: string): string {
    // If constraint is in the map, use the mapped value.
    // Otherwise, use the constraint as-is (pass-through).
    // This returns '' only when constraint is empty.
    if (this._constraintMap[constraint] !== undefined) {
      return this._constraintMap[constraint];
    }
    return constraint;
  }

  private _resolveMessage(error: ApiFieldError): string {
    if (this._i18n?.resolver) {
      const resolved = this._i18n.resolver(error.field, error.constraint, error.message);
      if (resolved !== null) return resolved;
    }

    if (this._i18n?.prefix) {
      // Return the i18n key (to be resolved by the consumer's i18n system)
      return `${this._i18n.prefix}.${error.field}.${error.constraint}`;
    }

    return error.message;
  }
}

/**
 * Factory function to create a FormBridge instance.
 *
 * @example
 * ```typescript
 * import { createFormBridge, classValidatorPreset } from 'ngx-api-forms';
 *
 * const bridge = createFormBridge(this.myForm, {
 *   preset: classValidatorPreset(),
 *   i18n: { prefix: 'validation' },
 * });
 *
 * // In your API call error handler:
 * bridge.applyApiErrors(err.error);
 * ```
 */
export function createFormBridge<T extends FormGroup>(form: T, config: FormBridgeConfig): FormBridge<T>;
export function createFormBridge<T extends FormGroup>(form: T): FormBridge<T>;
export function createFormBridge<T extends FormGroup>(form: T, config?: FormBridgeConfig): FormBridge<T> {
  return new FormBridge(form, config);
}

/**
 * Alias for `createFormBridge`.
 *
 * Both functions are identical since FormBridge no longer holds internal
 * subscriptions. Kept for API compatibility with existing code.
 *
 * @example
 * ```typescript
 * @Component({ ... })
 * export class MyComponent {
 *   private form = inject(FormBuilder).group({ email: [''] });
 *   private bridge = provideFormBridge(this.form, {
 *     preset: classValidatorPreset(),
 *   });
 *
 *   onSubmit() {
 *     this.http.post('/api', this.form.value).subscribe({
 *       error: (err) => this.bridge.applyApiErrors(err.error),
 *     });
 *   }
 * }
 * ```
 */
export function provideFormBridge<T extends FormGroup>(form: T, config: FormBridgeConfig): FormBridge<T>;
export function provideFormBridge<T extends FormGroup>(form: T): FormBridge<T>;
export function provideFormBridge<T extends FormGroup>(form: T, config?: FormBridgeConfig): FormBridge<T> {
  return new FormBridge(form, config);
}
