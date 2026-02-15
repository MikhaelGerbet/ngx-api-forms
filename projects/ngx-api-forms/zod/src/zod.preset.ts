/**
 * Zod error preset.
 *
 * Parses errors from `ZodError.flatten()`:
 * ```json
 * {
 *   "formErrors": [],
 *   "fieldErrors": {
 *     "email": ["Invalid email"],
 *     "name": ["String must contain at least 3 character(s)"]
 *   }
 * }
 * ```
 *
 * Also supports raw `ZodError.issues`:
 * ```json
 * [
 *   { "code": "too_small", "minimum": 3, "path": ["name"], "message": "..." },
 *   { "code": "invalid_string", "validation": "email", "path": ["email"], "message": "..." }
 * ]
 * ```
 */
import { ApiFieldError, ConstraintMap, ErrorPreset, GLOBAL_ERROR_FIELD, ZodFlatError } from 'ngx-api-forms';

interface ZodIssue {
  code: string;
  path: (string | number)[];
  message: string;
  minimum?: number;
  maximum?: number;
  validation?: string;
}

/**
 * Infers a constraint key from a Zod error message string.
 *
 * @remarks
 * Used only for the flattened format (`ZodError.flatten()`), where the structured
 * `code` field is not available. Relies on English-language pattern matching.
 * The raw issues format uses `zodCodeToConstraint` instead, which is language-independent.
 * If your Zod messages are customized or translated, prefer returning raw issues
 * (`ZodError.issues`) rather than the flattened format.
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

function inferConstraintFromMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('required') || lower.includes('invalid_type')) return 'required';
  if (lower.includes('email')) return 'email';
  if (lower.includes('url')) return 'url';
  if (lower.includes('at least') || lower.includes('too_small') || lower.includes('must contain at least')) return 'minlength';
  if (lower.includes('at most') || lower.includes('too_big') || lower.includes('must contain at most')) return 'maxlength';
  if (lower.includes('greater than or equal')) return 'min';
  if (lower.includes('less than or equal')) return 'max';
  return 'serverError';
}

function zodCodeToConstraint(issue: ZodIssue): string {
  switch (issue.code) {
    case 'too_small':
      return issue.minimum !== undefined ? 'minlength' : 'min';
    case 'too_big':
      return issue.maximum !== undefined ? 'maxlength' : 'max';
    case 'invalid_string':
      return issue.validation ?? 'serverError';
    case 'invalid_type':
      return 'required';
    case 'invalid_enum_value':
      return 'enum';
    case 'invalid_date':
      return 'date';
    case 'custom':
      return 'custom';
    default:
      return issue.code || 'serverError';
  }
}

/**
 * Default constraint map for Zod.
 */
export const ZOD_CONSTRAINT_MAP: ConstraintMap = {
  required: 'required',
  email: 'email',
  url: 'url',
  uuid: 'uuid',
  minlength: 'minlength',
  maxlength: 'maxlength',
  min: 'min',
  max: 'max',
  regex: 'pattern',
  enum: 'enum',
  date: 'date',
  custom: 'custom',
  invalid: 'invalid',
  serverError: 'serverError',
};

/**
 * Creates a Zod error preset.
 *
 * Supports both `.flatten()` and raw `.issues` formats.
 *
 * @param options.noInference - When true, skips constraint guessing entirely.
 *   The raw error message is used directly and the constraint is set to `'serverError'`.
 *   Useful for custom or translated Zod error messages.
 * @param options.constraintPatterns - Custom regex patterns for constraint inference.
 *   Keys are constraint names, values are RegExp tested against the raw message.
 *   Checked before the built-in English patterns (flattened format only;
 *   the raw issues format uses structured `code` fields which are language-independent).
 *
 * @example
 * ```typescript
 * import { zodPreset } from 'ngx-api-forms/zod';
 *
 * const bridge = createFormBridge(form, { preset: zodPreset() });
 *
 * // No inference: raw messages, no guessing
 * const bridge = createFormBridge(form, { preset: zodPreset({ noInference: true }) });
 * ```
 */
export function zodPreset(options?: { noInference?: boolean; constraintPatterns?: Record<string, RegExp> }): ErrorPreset {
  const skipInference = options?.noInference ?? false;
  const userPatterns = options?.constraintPatterns;

  function inferMessage(message: string): string {
    if (userPatterns) {
      const match = matchUserPatterns(message, userPatterns);
      if (match) return match;
    }
    return inferConstraintFromMessage(message);
  }

  return {
    name: 'zod',
    constraintMap: ZOD_CONSTRAINT_MAP,
    parse(error: unknown): ApiFieldError[] {
      if (!error || typeof error !== 'object') return [];

      // Format 1: Flattened error { fieldErrors: { ... }, formErrors: [...] }
      const flat = error as Partial<ZodFlatError>;
      if (flat.fieldErrors && typeof flat.fieldErrors === 'object') {
        const result: ApiFieldError[] = [];

        // Collect form-level (global) errors
        if (Array.isArray(flat.formErrors)) {
          for (const message of flat.formErrors) {
            if (typeof message !== 'string') continue;
            result.push({ field: GLOBAL_ERROR_FIELD, constraint: 'serverError', message });
          }
        }

        for (const [field, messages] of Object.entries(flat.fieldErrors)) {
          if (!Array.isArray(messages)) continue;
          for (const message of messages) {
            if (typeof message !== 'string') continue;
            result.push({ field, constraint: skipInference ? 'serverError' : inferMessage(message), message });
          }
        }
        return result;
      }

      // Format 2: Raw issues array
      const err = error as Record<string, unknown>;
      if (Array.isArray(err['issues'])) {
        const issues = err['issues'] as ZodIssue[];
        return issues.map((issue) => ({
          field: issue.path && issue.path.length > 0
            ? issue.path.map(String).join('.')
            : GLOBAL_ERROR_FIELD,
          constraint: skipInference ? 'serverError' : zodCodeToConstraint(issue),
          message: issue.message,
        }));
      }

      // Format 3: Direct array of issues
      if (Array.isArray(error)) {
        const issues = error as ZodIssue[];
        if (issues.length > 0 && 'code' in issues[0] && 'path' in issues[0]) {
          return issues.map((issue) => ({
            field: issue.path && issue.path.length > 0
              ? issue.path.map(String).join('.')
              : GLOBAL_ERROR_FIELD,
            constraint: skipInference ? 'serverError' : zodCodeToConstraint(issue),
            message: issue.message,
          }));
        }
      }

      // Format 4: Wrapped { errors: { fieldErrors: {...}, formErrors: [...] } } or { error: {...} }
      if (err['errors'] && typeof err['errors'] === 'object') {
        const nested = err['errors'] as Partial<ZodFlatError>;
        if (nested.fieldErrors && typeof nested.fieldErrors === 'object') {
          const result: ApiFieldError[] = [];

          // Collect form-level (global) errors from wrapped format
          if (Array.isArray(nested.formErrors)) {
            for (const message of nested.formErrors) {
              if (typeof message !== 'string') continue;
              result.push({ field: GLOBAL_ERROR_FIELD, constraint: 'serverError', message });
            }
          }

          for (const [field, messages] of Object.entries(nested.fieldErrors)) {
            if (!Array.isArray(messages)) continue;
            for (const message of messages) {
              if (typeof message !== 'string') continue;
              result.push({ field, constraint: skipInference ? 'serverError' : inferMessage(message), message });
            }
          }
          return result;
        }
      }

      return [];
    },
  };
}
