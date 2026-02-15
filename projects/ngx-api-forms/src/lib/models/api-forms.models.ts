/**
 * ngx-api-forms - Models & Interfaces
 *
 * Core types for bridging API validation errors to Angular Reactive Forms.
 */

import { FormGroup } from '@angular/forms';

// ---------------------------------------------------------------------------
// API Error Structures
// ---------------------------------------------------------------------------

/**
 * A single field-level validation error returned by the API.
 */
export interface ApiFieldError {
  /** The form control name / field property name */
  field: string;
  /** The validation constraint key (e.g. 'required', 'minLength', 'isEmail') */
  constraint: string;
  /** The human-readable error message */
  message: string;
}

/**
 * Raw error shape from class-validator / NestJS (ValidationPipe).
 * This is the standard shape when `exceptionFactory` is not customized.
 */
export interface ClassValidatorError {
  property: string;
  constraints?: Record<string, string>;
  children?: ClassValidatorError[];
}

/**
 * Raw error shape from Laravel validation.
 * Laravel returns `{ errors: { field: ['message1', 'message2'] } }`.
 */
export type LaravelValidationErrors = Record<string, string[]>;

/**
 * Raw error shape from Django REST Framework.
 * DRF returns `{ field: ['message1', 'message2'] }`.
 */
export type DjangoValidationErrors = Record<string, string[]>;

/**
 * Raw error shape from Zod (.flatten()).
 * Zod returns `{ fieldErrors: { field: ['message1'] } }`.
 */
export interface ZodFlatError {
  formErrors: string[];
  fieldErrors: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Global (Non-Field) Errors
// ---------------------------------------------------------------------------

/**
 * Sentinel field name used by presets to tag errors that are not bound to a
 * specific form control (e.g. Django `non_field_errors`, Zod `formErrors`).
 *
 * FormBridge also routes any ApiFieldError whose field does not match a control
 * to `globalErrorsSignal`, so custom presets do not need to use this constant -
 * unmatched fields are captured automatically.
 */
export const GLOBAL_ERROR_FIELD = '__global__';

/**
 * An error that does not belong to any specific form control.
 *
 * Sources:
 * - Django `non_field_errors` / `detail`
 * - Zod `formErrors`
 * - Any API error whose field name does not match a control in the form
 */
export interface GlobalError {
  /** The human-readable error message */
  message: string;
  /** The constraint key (e.g. 'serverError') */
  constraint: string;
  /** The original field name from the API response, if any */
  originalField?: string;
}

// ---------------------------------------------------------------------------
// Error Preset
// ---------------------------------------------------------------------------

/**
 * An ErrorPreset knows how to parse a specific API error shape
 * into a normalized array of `ApiFieldError`.
 *
 * This is the extension point for supporting any backend.
 */
export interface ErrorPreset {
  /** Unique name for identification (e.g. 'class-validator', 'laravel') */
  readonly name: string;

  /**
   * Parse the raw API error body into normalized field errors.
   * Should return an empty array if the format is not recognized.
   */
  parse(error: unknown): ApiFieldError[];

  /**
   * Optional constraint map shipped with this preset.
   * When provided, FormBridge merges it into its constraint resolution table
   * automatically - no need to pass a `constraintMap` in the config.
   */
  readonly constraintMap?: ConstraintMap;
}

// ---------------------------------------------------------------------------
// Error Mapping
// ---------------------------------------------------------------------------

/**
 * Maps a constraint key to an Angular validation error key.
 * For example: `{ isEmail: 'email', minLength: 'minlength' }`
 */
export type ConstraintMap = Record<string, string>;

/**
 * Configuration for i18n error message resolution.
 */
export interface I18nConfig {
  /**
   * Prefix for i18n translation keys.
   * Example: 'forms.errors' → key becomes 'forms.errors.email.required'
   */
  prefix?: string;

  /**
   * Custom resolver function for translating error keys.
   * If provided, this is called instead of using a prefix.
   *
   * @param field - The form field name
   * @param constraint - The constraint key
   * @param message - The original API message
   * @returns The translated message, or null to use the original
   */
  resolver?: (field: string, constraint: string, message: string) => string | null;
}

// ---------------------------------------------------------------------------
// FormBridge Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration options for creating a FormBridge instance.
 */
export interface FormBridgeConfig {
  /**
   * The error preset to use for parsing API errors.
   * Can be a single preset or an array (tried in order).
   */
  preset?: ErrorPreset | ErrorPreset[];

  /**
   * Custom constraint-to-Angular-error mapping.
   * Overrides the defaults from the preset.
   * Example: `{ isEmail: 'email', isNotEmpty: 'required' }`
   */
  constraintMap?: ConstraintMap;

  /**
   * i18n configuration for error messages.
   */
  i18n?: I18nConfig;

  /**
   * When true, unmapped API errors are set as `{ generic: message }` on the control.
   * When false (default), unmapped errors are ignored.
   */
  catchAll?: boolean;

  /**
   * When true, existing validation errors on the form are preserved
   * when applying API errors (merged). When false (default), API errors
   * replace existing errors on affected controls.
   */
  mergeErrors?: boolean;

  /**
   * When true, logs warnings to the console when:
   * - No preset produces results for a given error payload.
   * - A parsed error field does not match any form control.
   *
   * Useful during development. Should be disabled in production.
   */
  debug?: boolean;
}

// ---------------------------------------------------------------------------
// FormBridge State
// ---------------------------------------------------------------------------

/**
 * Represents a resolved error on a specific form field.
 */
export interface ResolvedFieldError {
  /** The form control name */
  field: string;
  /** The Angular validation error key (e.g. 'required', 'email') */
  errorKey: string;
  /** The error message */
  message: string;
}

/**
 * Return type for `getFirstError()`.
 */
export interface FirstError {
  field: string;
  errorKey: string;
  message: string;
}

/**
 * Options for `enableForm()`.
 */
export interface EnableFormOptions {
  /** Control names to exclude from enabling */
  except?: string[];
}

/**
 * Options for `disableForm()`.
 */
export interface DisableFormOptions {
  /** Control names to exclude from disabling */
  except?: string[];
}

// ---------------------------------------------------------------------------
// Utility Types
// ---------------------------------------------------------------------------

/**
 * Extract control names from a typed FormGroup.
 */
export type FormControlNames<T extends FormGroup> = T extends FormGroup<infer C>
  ? Extract<keyof C, string>
  : string;

/**
 * Signature for a custom error handler that can intercept
 * errors before they are applied to the form.
 */
export type ErrorInterceptor = (
  errors: ApiFieldError[],
  form: FormGroup
) => ApiFieldError[];
