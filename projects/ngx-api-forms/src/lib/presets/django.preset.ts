/**
 * Django REST Framework validation error preset.
 *
 * Parses the standard DRF validation error format:
 * ```json
 * {
 *   "email": ["This field is required."],
 *   "name": ["Ensure this field has at least 3 characters."]
 * }
 * ```
 *
 * Also handles non-field errors:
 * ```json
 * {
 *   "non_field_errors": ["Unable to log in with provided credentials."],
 *   "email": ["Enter a valid email address."]
 * }
 * ```
 */
import { ApiFieldError, DjangoValidationErrors, ErrorPreset } from '../models/api-forms.models';

/**
 * Infers a constraint key from a Django REST Framework validation message.
 *
 * @remarks
 * This function relies on English-language pattern matching (e.g. "this field is required",
 * "valid email"). If your Django backend returns translated messages (USE_I18N=True with
 * non-English locale), the inference will fall back to 'invalid'. In that case, use a
 * `constraintMap` in your FormBridgeConfig or write a custom preset.
 */
function inferConstraint(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('this field is required') || lower.includes('this field may not be blank')) return 'required';
  if (lower.includes('valid email')) return 'email';
  if (lower.includes('at least') && lower.includes('character')) return 'minlength';
  if (lower.includes('no more than') && lower.includes('character')) return 'maxlength';
  if (lower.includes('ensure this value is greater than or equal')) return 'min';
  if (lower.includes('ensure this value is less than or equal')) return 'max';
  if (lower.includes('a valid integer')) return 'integer';
  if (lower.includes('a valid number')) return 'number';
  if (lower.includes('valid date')) return 'date';
  if (lower.includes('valid url')) return 'url';
  if (lower.includes('already exists')) return 'unique';
  if (lower.includes('valid phone')) return 'phone';
  if (lower.includes('does not match')) return 'pattern';

  return 'invalid';
}

/**
 * Converts Django snake_case field names to camelCase.
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Creates a Django REST Framework validation error preset.
 *
 * @param options.camelCase - If true, converts snake_case field names to camelCase (default: true)
 * @param options.noInference - When true, skips English-language constraint guessing.
 *   The raw error message is used directly and the constraint is set to `'serverError'`.
 *   Use this when your backend returns translated or custom messages.
 *
 * @example
 * ```typescript
 * import { djangoPreset } from 'ngx-api-forms';
 *
 * // Default: infer constraint from English messages
 * const bridge = createFormBridge(form, { preset: djangoPreset() });
 *
 * // No inference: raw messages, no guessing
 * const bridge = createFormBridge(form, { preset: djangoPreset({ noInference: true }) });
 * ```
 */
export function djangoPreset(options?: { camelCase?: boolean; noInference?: boolean }): ErrorPreset {
  const shouldCamelCase = options?.camelCase ?? true;
  const skipInference = options?.noInference ?? false;

  return {
    name: 'django',
    parse(error: unknown): ApiFieldError[] {
      if (!error || typeof error !== 'object' || Array.isArray(error)) return [];

      const errors = error as DjangoValidationErrors;
      const result: ApiFieldError[] = [];

      for (const [rawField, messages] of Object.entries(errors)) {
        if (!Array.isArray(messages)) continue;

        // Skip non-field errors (can be handled separately by the consumer)
        if (rawField === 'non_field_errors' || rawField === 'detail') continue;

        const field = shouldCamelCase ? snakeToCamel(rawField) : rawField;

        for (const message of messages) {
          if (typeof message !== 'string') continue;
          result.push({
            field,
            constraint: skipInference ? 'serverError' : inferConstraint(message),
            message,
          });
        }
      }

      return result;
    },
  };
}

/**
 * Default constraint map for Django REST Framework.
 */
export const DJANGO_CONSTRAINT_MAP: Record<string, string> = {
  required: 'required',
  email: 'email',
  minlength: 'minlength',
  maxlength: 'maxlength',
  min: 'min',
  max: 'max',
  integer: 'integer',
  number: 'number',
  date: 'date',
  url: 'url',
  unique: 'unique',
  phone: 'phone',
  pattern: 'pattern',
  invalid: 'invalid',
  serverError: 'serverError',
};
