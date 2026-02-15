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
import { ApiFieldError, ConstraintMap, ErrorPreset, GLOBAL_ERROR_FIELD } from 'ngx-api-forms';

/**
 * Shape of a structured DRF error object (when using a custom exception handler
 * that includes the validator `code`).
 */
interface DjangoStructuredError {
  message: string;
  code: string;
}

/**
 * Infers a constraint key from a Django REST Framework validation message.
 *
 * @remarks
 * This function relies on English-language pattern matching (e.g. "this field is required",
 * "valid email"). If your Django backend returns translated messages (USE_I18N=True with
 * non-English locale), the inference will fall back to 'serverError'. In that case, use
 * structured error codes (`{ message, code }`) or `constraintPatterns` for reliable i18n.
 */
/**
 * Tries user-provided constraint patterns against a message.
 * Returns the matched constraint key or null.
 */
function matchUserPatterns(message: string, patterns: Record<string, RegExp>): string | null {
  for (const [constraint, regex] of Object.entries(patterns)) {
    if (regex.test(message)) return constraint;
  }
  return null;
}

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

  return 'serverError';
}

/**
 * Converts Django snake_case field names to camelCase.
 */
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Default constraint map for Django REST Framework.
 */
export const DJANGO_CONSTRAINT_MAP: ConstraintMap = {
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

/**
 * Creates a Django REST Framework validation error preset.
 *
 * @param options.camelCase - If true, converts snake_case field names to camelCase (default: true)
 * @param options.noInference - When true, skips English-language constraint guessing.
 *   The raw error message is used directly and the constraint is set to `'serverError'`.
 *   Use this when your backend returns translated or custom messages.
 * @param options.constraintPatterns - Custom regex patterns for constraint inference.
 *   Keys are constraint names, values are RegExp tested against the raw message.
 *   Checked before the built-in English patterns.
 *   Example: `{ required: /ce champ est obligatoire/i, email: /adresse.*invalide/i }`
 *
 * @example
 * ```typescript
 * import { djangoPreset } from 'ngx-api-forms/django';
 *
 * // Default: infer constraint from English messages
 * const bridge = createFormBridge(form, { preset: djangoPreset() });
 *
 * // No inference: raw messages, no guessing
 * const bridge = createFormBridge(form, { preset: djangoPreset({ noInference: true }) });
 * ```
 */
export function djangoPreset(options?: { camelCase?: boolean; noInference?: boolean; constraintPatterns?: Record<string, RegExp> }): ErrorPreset {
  const shouldCamelCase = options?.camelCase ?? true;
  const skipInference = options?.noInference ?? false;
  const userPatterns = options?.constraintPatterns;

  return {
    name: 'django',
    constraintMap: DJANGO_CONSTRAINT_MAP,
    parse(error: unknown): ApiFieldError[] {
      if (!error || typeof error !== 'object' || Array.isArray(error)) return [];

      const errors = error as Record<string, unknown>;
      const result: ApiFieldError[] = [];

      for (const [rawField, messages] of Object.entries(errors)) {
        if (!Array.isArray(messages)) continue;

        const isGlobal = rawField === 'non_field_errors' || rawField === 'detail';
        const field = isGlobal
          ? GLOBAL_ERROR_FIELD
          : (shouldCamelCase ? snakeToCamel(rawField) : rawField);

        for (const item of messages) {
          // Structured format: { message: string, code: string }
          if (typeof item === 'object' && item !== null && 'message' in item && 'code' in item) {
            const structured = item as DjangoStructuredError;
            result.push({ field, constraint: structured.code, message: structured.message });
            continue;
          }

          // Standard format: plain string
          if (typeof item !== 'string') continue;
          let constraint: string;
          if (skipInference) {
            constraint = 'serverError';
          } else if (userPatterns) {
            constraint = matchUserPatterns(item, userPatterns) ?? inferConstraint(item);
          } else {
            constraint = inferConstraint(item);
          }
          result.push({ field, constraint, message: item });
        }
      }

      return result;
    },
  };
}
