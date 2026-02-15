/**
 * Laravel validation error preset.
 *
 * Parses the standard Laravel validation error format:
 * ```json
 * {
 *   "message": "The given data was invalid.",
 *   "errors": {
 *     "email": ["The email field is required.", "The email must be a valid email address."],
 *     "name": ["The name must be at least 3 characters."]
 *   }
 * }
 * ```
 */
import { ApiFieldError, ConstraintMap, ErrorPreset, LaravelValidationErrors } from 'ngx-api-forms';

/**
 * Shape of a structured Laravel error object (when using a custom exception handler
 * that includes the validation `rule` name).
 */
interface LaravelStructuredError {
  message: string;
  rule: string;
}

/**
 * Infers a constraint key from a Laravel validation message.
 *
 * @remarks
 * This function relies on English-language pattern matching (e.g. "is required",
 * "must be a valid email"). If your Laravel backend returns translated messages,
 * the inference will fall back to 'serverError'. In that case, use structured
 * error codes (`{ message, rule }`) or `constraintPatterns` for reliable i18n.
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

  if (lower.includes('is required') || lower.includes('field is required')) return 'required';
  if (lower.includes('must be a valid email')) return 'email';
  if (lower.includes('must be at least') && lower.includes('character')) return 'minlength';
  if (lower.includes('must not be greater than') && lower.includes('character')) return 'maxlength';
  if (lower.includes('must be at least')) return 'min';
  if (lower.includes('must not be greater than')) return 'max';
  if (lower.includes('must be a number')) return 'number';
  if (lower.includes('must be an integer')) return 'integer';
  if (lower.includes('must be a date')) return 'date';
  if (lower.includes('must be a valid url')) return 'url';
  if (lower.includes('has already been taken')) return 'unique';
  if (lower.includes('must match')) return 'pattern';
  if (lower.includes('must be a valid phone')) return 'phone';
  if (lower.includes('format is invalid')) return 'invalid';
  if (lower.includes('must be accepted')) return 'accepted';
  if (lower.includes('confirmation does not match')) return 'confirmed';
  if (lower.includes('must be a file')) return 'file';
  if (lower.includes('must be an image')) return 'image';

  return 'serverError';
}

/**
 * Default constraint map for Laravel.
 */
export const LARAVEL_CONSTRAINT_MAP: ConstraintMap = {
  required: 'required',
  email: 'email',
  minlength: 'minlength',
  maxlength: 'maxlength',
  min: 'min',
  max: 'max',
  number: 'number',
  integer: 'integer',
  date: 'date',
  url: 'url',
  unique: 'unique',
  pattern: 'pattern',
  phone: 'phone',
  invalid: 'invalid',
  accepted: 'accepted',
  confirmed: 'confirmed',
  file: 'file',
  image: 'image',
  serverError: 'serverError',
};

/**
 * Creates a Laravel validation error preset.
 *
 * @param options.noInference - When true, skips English-language constraint guessing.
 *   The raw error message is used directly and the constraint is set to `'serverError'`.
 *   Use this when your backend returns translated or custom messages.
 * @param options.constraintPatterns - Custom regex patterns for constraint inference.
 *   Keys are constraint names, values are RegExp tested against the raw message.
 *   Checked before the built-in English patterns.
 *   Example: `{ required: /obligatoire/i, email: /courriel.*invalide/i }`
 *
 * @example
 * ```typescript
 * import { laravelPreset } from 'ngx-api-forms/laravel';
 *
 * // Default: infer constraint from English messages
 * const bridge = createFormBridge(form, { preset: laravelPreset() });
 *
 * // No inference: raw messages, no guessing
 * const bridge = createFormBridge(form, { preset: laravelPreset({ noInference: true }) });
 * ```
 */
export function laravelPreset(options?: { noInference?: boolean; constraintPatterns?: Record<string, RegExp> }): ErrorPreset {
  const skipInference = options?.noInference ?? false;
  const userPatterns = options?.constraintPatterns;
  return {
    name: 'laravel',
    constraintMap: LARAVEL_CONSTRAINT_MAP,
    parse(error: unknown): ApiFieldError[] {
      if (!error || typeof error !== 'object') return [];

      const err = error as Record<string, unknown>;

      // Standard Laravel format: { errors: { field: [messages] } }
      let errors: LaravelValidationErrors | undefined;

      if (err['errors'] && typeof err['errors'] === 'object') {
        errors = err['errors'] as LaravelValidationErrors;
      }
      // Direct format: { field: [messages] } (without wrapper)
      else if (!err['statusCode'] && !err['message']) {
        errors = err as unknown as LaravelValidationErrors;
      }

      if (!errors) return [];

      const result: ApiFieldError[] = [];

      for (const [field, messages] of Object.entries(errors)) {
        if (!Array.isArray(messages)) continue;

        // Laravel uses dot notation for nested fields (e.g. 'address.city')
        const normalizedField = field.replace(/\.\*/g, '').replace(/\.\d+\./g, '.');

        for (const item of messages) {
          // Structured format: { message: string, rule: string }
          if (typeof item === 'object' && item !== null && 'message' in item && 'rule' in item) {
            const structured = item as LaravelStructuredError;
            result.push({ field: normalizedField, constraint: structured.rule, message: structured.message });
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
          result.push({ field: normalizedField, constraint, message: item });
        }
      }

      return result;
    },
  };
}
