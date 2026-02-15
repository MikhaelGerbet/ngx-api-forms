/**
 * FormBridge - The core class of ngx-api-forms.
 *
 * Bridges API validation errors to Angular Reactive Forms with:
 * - Automatic error parsing via presets (class-validator, Laravel, Django, Zod)
 * - i18n-friendly error messages
 * - Form state management (reset, enable, disable, defaults)
 * - Angular Signals support
 * - SSR-safe operations
 * - FormData conversion utilities
 */
import { signal, computed, Signal, WritableSignal, inject, DestroyRef } from '@angular/core';
import { FormGroup, FormArray, ValidationErrors, AbstractControl } from '@angular/forms';
import { Observable, Subscription, tap, catchError } from 'rxjs';

import {
  ApiFieldError,
  ConstraintMap,
  DisableFormOptions,
  EnableFormOptions,
  ErrorInterceptor,
  ErrorPreset,
  FirstError,
  FormBridgeConfig,
  I18nConfig,
  ResolvedFieldError,
} from '../models/api-forms.models';
import { toFormData as toFormDataUtil } from '../utils/form-utils';
import { CLASS_VALIDATOR_CONSTRAINT_MAP, classValidatorPreset } from '../presets/class-validator.preset';
import { LARAVEL_CONSTRAINT_MAP } from '../presets/laravel.preset';
import { DJANGO_CONSTRAINT_MAP } from '../presets/django.preset';
import { ZOD_CONSTRAINT_MAP } from '../presets/zod.preset';

/** Maps preset names to their default constraint maps */
const PRESET_CONSTRAINT_MAPS: Record<string, ConstraintMap> = {
  'class-validator': CLASS_VALIDATOR_CONSTRAINT_MAP,
  laravel: LARAVEL_CONSTRAINT_MAP,
  django: DJANGO_CONSTRAINT_MAP,
  zod: ZOD_CONSTRAINT_MAP,
};

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
  private readonly _defaultValues: Record<string, unknown> = {};
  private _interceptors: ErrorInterceptor[] = [];
  private _valueChangesSub: Subscription | null = null;

  /** Signal containing the last set of resolved API errors */
  private readonly _apiErrors: WritableSignal<ResolvedFieldError[]> = signal([]);

  /** Signal containing dirty state tracking */
  private readonly _isDirty: WritableSignal<boolean> = signal(false);

  /** Signal containing submitting state */
  private readonly _isSubmitting: WritableSignal<boolean> = signal(false);

  // ---- Public Signals ----

  /** Reactive signal of all current API errors applied to the form */
  readonly errorsSignal: Signal<ResolvedFieldError[]> = this._apiErrors.asReadonly();

  /** Reactive signal of the first error (or null) */
  readonly firstErrorSignal: Signal<FirstError | null> = computed(() => {
    const errors = this._apiErrors();
    return errors.length > 0 ? errors[0] : null;
  });

  /** Whether any API errors are currently applied */
  readonly hasErrorsSignal: Signal<boolean> = computed(() => this._apiErrors().length > 0);

  /**
   * Whether the form has been modified from its default values.
   *
   * @deprecated Use the standalone `getDirtyValues()` function or Angular's
   * built-in `form.dirty` for simpler dirty tracking. This signal will be
   * removed in a future major version.
   */
  readonly isDirtySignal: Signal<boolean> = this._isDirty.asReadonly();

  /**
   * Whether a submit operation is in progress.
   *
   * @deprecated Use `wrapSubmit()` with a local `signal()` for submit tracking.
   * This signal is tied to the deprecated `handleSubmit()` method.
   */
  readonly isSubmittingSignal: Signal<boolean> = this._isSubmitting.asReadonly();

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

    // Store initial form values as defaults
    this._captureDefaults();

    // Subscribe to valueChanges for reactive isDirtySignal
    this._valueChangesSub = this._form.valueChanges.subscribe(() => {
      this._computeDirty();
    });
  }

  /**
   * Clean up subscriptions. Call this when the FormBridge is no longer needed.
   */
  destroy(): void {
    this._valueChangesSub?.unsubscribe();
    this._valueChangesSub = null;
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
   * Clear all API errors from the form controls.
   * Restores client-side validation state.
   */
  clearApiErrors(): void {
    for (const key of Object.keys(this._form.controls)) {
      const control = this._form.controls[key];
      if (control) {
        control.setErrors(null);
        control.updateValueAndValidity();
      }
    }
    this._form.updateValueAndValidity({ onlySelf: false, emitEvent: true });
    this._apiErrors.set([]);
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

  /**
   * Wrap an Observable (typically an HTTP call) with automatic form state management.
   *
   * - Disables the form and sets isSubmittingSignal to true
   * - On success: re-enables the form
   * - On error: re-enables the form and applies API errors
   *
   * The error is re-thrown so your subscriber's error handler still runs.
   *
   * @deprecated Use the standalone `wrapSubmit()` function instead.
   * `wrapSubmit` is tree-shakeable and does not couple submit logic to FormBridge.
   *
   * @param source - The Observable to wrap (e.g. an HttpClient call)
   * @param options.extractError - Custom function to extract the error body (default: err.error ?? err)
   * @returns The wrapped Observable
   *
   * @example
   * ```typescript
   * bridge.handleSubmit(
   *   this.http.post('/api/save', this.form.value)
   * ).subscribe({
   *   next: () => this.router.navigate(['/success']),
   *   error: () => console.log('Errors applied to form automatically'),
   * });
   * ```
   */
  handleSubmit<T>(
    source: Observable<T>,
    options?: { extractError?: (err: unknown) => unknown }
  ): Observable<T> {
    this.disable();
    this._isSubmitting.set(true);
    this.clearApiErrors();

    const extract = options?.extractError ?? ((err: any) => err?.error ?? err);

    return source.pipe(
      tap(() => {
        this._isSubmitting.set(false);
        this.enable();
      }),
      catchError((err) => {
        this._isSubmitting.set(false);
        this.enable();
        this.applyApiErrors(extract(err));
        throw err;
      })
    );
  }

  // ---- Public API - Form State Management ----

  /**
   * Set default values for the form and reset to them.
   *
   * @deprecated Use `form.reset(values)` directly. FormBridge should only
   * handle API error mapping, not form state management.
   */
  setDefaultValues(values: Record<string, unknown>): void {
    for (const key of Object.keys(values)) {
      if (this._form.controls[key]) {
        this._defaultValues[key] = values[key];
      }
    }
    this.reset();
  }

  /**
   * Reset the form to its default values and clear all errors.
   *
   * @deprecated Use `form.reset()` and `bridge.clearApiErrors()` directly.
   */
  reset(): void {
    this._form.reset(this._defaultValues);
    this._apiErrors.set([]);
    this._isDirty.set(false);
  }

  /**
   * Enable all controls in the form.
   *
   * @deprecated Use the standalone `enableForm()` function instead.
   */
  enable(options?: EnableFormOptions): void {
    for (const key of Object.keys(this._form.controls)) {
      if (options?.except?.includes(key)) continue;
      this._form.controls[key].enable();
    }
    this._form.updateValueAndValidity({ onlySelf: false, emitEvent: true });
  }

  /**
   * Disable all controls in the form.
   *
   * @deprecated Use the standalone `disableForm()` function instead.
   */
  disable(options?: DisableFormOptions): void {
    for (const key of Object.keys(this._form.controls)) {
      if (options?.except?.includes(key)) continue;
      this._form.controls[key].disable();
    }
  }

  /**
   * Check if the form values have changed compared to the defaults.
   *
   * @deprecated Use the standalone `getDirtyValues()` function or
   * Angular's built-in `form.dirty`.
   */
  checkDirty(): boolean {
    this._computeDirty();
    return this._isDirty();
  }

  // ---- Public API - Utilities ----

  /**
   * Convert form values to FormData (for file uploads).
   * Delegates to the standalone `toFormData()` utility.
   *
   * @deprecated Use the standalone `toFormData()` function directly.
   */
  toFormData(values?: Record<string, unknown>): FormData {
    return toFormDataUtil(values ?? this._form.getRawValue());
  }

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
      const map = PRESET_CONSTRAINT_MAPS[preset.name];
      if (map) Object.assign(merged, map);
    }
    // If no preset maps found, fall back to class-validator
    if (Object.keys(merged).length === 0) {
      Object.assign(merged, CLASS_VALIDATOR_CONSTRAINT_MAP);
    }
    return merged;
  }

  private _captureDefaults(): void {
    const rawValues = this._form.getRawValue();
    for (const [key, value] of Object.entries(rawValues)) {
      this._defaultValues[key] = value;
    }
  }

  private _computeDirty(): void {
    const currentValues = this._form.getRawValue();
    let isDirty = false;
    for (const key of Object.keys(this._defaultValues)) {
      const current = currentValues[key];
      const stored = this._defaultValues[key];
      // Deep comparison via JSON.stringify to handle objects, arrays, dates
      if (current !== stored && JSON.stringify(current) !== JSON.stringify(stored)) {
        isDirty = true;
        break;
      }
    }
    this._isDirty.set(isDirty);
  }

  private _applyErrors(fieldErrors: ApiFieldError[]): ResolvedFieldError[] {
    const resolved: ResolvedFieldError[] = [];

    // Accumulate errors per control to avoid overwrite within a single applyApiErrors call
    const pendingErrors = new Map<AbstractControl, ValidationErrors>();

    for (const fieldError of fieldErrors) {
      let control: AbstractControl | null = this._form.controls[fieldError.field] ?? null;
      if (!control) {
        // Try nested path (e.g. 'address.city' or 'items.0.name')
        control = this._resolveNestedControl(fieldError.field);
        if (!control) {
          if (this._debug) {
            console.warn(
              `[ngx-api-forms] Field "${fieldError.field}" does not match any form control.`,
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

      // Accumulate: merge with already-pending errors for this control
      const existing = pendingErrors.get(control) ?? (this._mergeErrors ? (control.errors ?? {}) : {});
      pendingErrors.set(control, { ...existing, [finalErrorKey]: message });

      resolved.push({ field: fieldError.field, errorKey: finalErrorKey, message });
    }

    // Apply accumulated errors once per control
    for (const [control, errors] of pendingErrors) {
      control.markAsTouched();
      control.setErrors(errors);
    }

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
export function createFormBridge<T extends FormGroup = FormGroup>(form: T, config?: FormBridgeConfig): FormBridge<T> {
  return new FormBridge(form, config);
}

/**
 * Create a FormBridge and register automatic cleanup via Angular's `DestroyRef`.
 *
 * Must be called in an injection context (constructor, field initializer, or
 * inside `runInInjectionContext`). The bridge's internal subscriptions are
 * cleaned up automatically when the component/service is destroyed - no need
 * to call `destroy()` manually.
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
export function provideFormBridge<T extends FormGroup = FormGroup>(form: T, config?: FormBridgeConfig): FormBridge<T> {
  const bridge = new FormBridge(form, config);
  const destroyRef = inject(DestroyRef);
  destroyRef.onDestroy(() => bridge.destroy());
  return bridge;
}
