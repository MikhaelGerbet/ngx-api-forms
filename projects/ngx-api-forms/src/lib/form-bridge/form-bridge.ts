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
import { signal, computed, Signal, WritableSignal } from '@angular/core';
import { FormGroup, ValidationErrors } from '@angular/forms';

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
export class FormBridge {
  private readonly _form: FormGroup;
  private readonly _presets: ErrorPreset[];
  private readonly _constraintMap: ConstraintMap;
  private readonly _i18n: I18nConfig | undefined;
  private readonly _catchAll: boolean;
  private readonly _mergeErrors: boolean;
  private readonly _defaultValues: Record<string, unknown> = {};
  private readonly _interceptors: ErrorInterceptor[] = [];

  /** Signal containing the last set of resolved API errors */
  private readonly _apiErrors: WritableSignal<ResolvedFieldError[]> = signal([]);

  /** Signal containing dirty state tracking */
  private readonly _isDirty: WritableSignal<boolean> = signal(false);

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

  /** Whether the form has been modified from its default values */
  readonly isDirtySignal: Signal<boolean> = this._isDirty.asReadonly();

  constructor(form: FormGroup, config?: FormBridgeConfig) {
    this._form = form;
    this._catchAll = config?.catchAll ?? false;
    this._mergeErrors = config?.mergeErrors ?? false;
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
   */
  addInterceptor(interceptor: ErrorInterceptor): void {
    this._interceptors.push(interceptor);
  }

  // ---- Public API - Form State Management ----

  /**
   * Set default values for the form and reset to them.
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
   */
  reset(): void {
    this._form.reset(this._defaultValues);
    this._apiErrors.set([]);
    this._isDirty.set(false);
  }

  /**
   * Enable all controls in the form.
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
   */
  disable(options?: DisableFormOptions): void {
    for (const key of Object.keys(this._form.controls)) {
      if (options?.except?.includes(key)) continue;
      this._form.controls[key].disable();
    }
  }

  /**
   * Check if the form values have changed compared to the defaults.
   */
  checkDirty(): boolean {
    const currentValues = this._form.getRawValue();
    let isDirty = false;

    for (const key of Object.keys(this._defaultValues)) {
      if (currentValues[key] !== this._defaultValues[key]) {
        isDirty = true;
        break;
      }
    }

    this._isDirty.set(isDirty);
    return isDirty;
  }

  /**
   * Get the current default values.
   */
  getDefaultValues(): Record<string, unknown> {
    return { ...this._defaultValues };
  }

  // ---- Public API - Utilities ----

  /**
   * Convert form values to FormData (for file uploads).
   *
   * Handles: Files, Arrays, null/undefined, nested objects.
   */
  toFormData(values?: Record<string, unknown>): FormData {
    const data = values ?? this._form.getRawValue();
    const formData = new FormData();

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue;

      if (value instanceof File) {
        formData.append(key, value);
        continue;
      }

      if (value instanceof Blob) {
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
   * Get the raw form value (including disabled controls).
   */
  getRawValue(): Record<string, unknown> {
    return this._form.getRawValue();
  }

  /**
   * Access the underlying FormGroup.
   */
  get form(): FormGroup {
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

  private _applyErrors(fieldErrors: ApiFieldError[]): ResolvedFieldError[] {
    const resolved: ResolvedFieldError[] = [];

    for (const fieldError of fieldErrors) {
      const control = this._form.controls[fieldError.field];
      if (!control) {
        // Try nested path (e.g. 'address.city')
        const nestedControl = this._resolveNestedControl(fieldError.field);
        if (!nestedControl) continue;

        const errorKey = this._resolveErrorKey(fieldError.constraint);
        const message = this._resolveMessage(fieldError);
        const currentErrors = this._mergeErrors ? (nestedControl.errors ?? {}) : {};
        nestedControl.setErrors({ ...currentErrors, [errorKey]: message });
        nestedControl.markAsTouched();
        resolved.push({ field: fieldError.field, errorKey, message });
        continue;
      }

      const errorKey = this._resolveErrorKey(fieldError.constraint);
      const message = this._resolveMessage(fieldError);

      if (!errorKey && !this._catchAll) continue;

      const finalErrorKey = errorKey || 'generic';
      const currentErrors = this._mergeErrors ? (control.errors ?? {}) : {};
      control.setErrors({ ...currentErrors, [finalErrorKey]: message });
      control.markAsTouched();

      resolved.push({ field: fieldError.field, errorKey: finalErrorKey, message });
    }

    return resolved;
  }

  private _resolveNestedControl(path: string): import('@angular/forms').AbstractControl | null {
    const parts = path.split('.');
    let current: import('@angular/forms').AbstractControl = this._form;

    for (const part of parts) {
      if (current instanceof FormGroup) {
        const child = current.controls[part];
        if (!child) return null;
        current = child;
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
export function createFormBridge(form: FormGroup, config?: FormBridgeConfig): FormBridge {
  return new FormBridge(form, config);
}
