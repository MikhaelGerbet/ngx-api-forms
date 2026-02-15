/**
 * express-validator error preset.
 *
 * Parses the standard express-validator error format (v7+):
 * ```json
 * {
 *   "errors": [
 *     { "type": "field", "value": "", "msg": "Invalid value", "path": "email", "location": "body" }
 *   ]
 * }
 * ```
 *
 * Also handles the legacy v5/v6 format:
 * ```json
 * {
 *   "errors": [
 *     { "param": "email", "msg": "Invalid value", "location": "body" }
 *   ]
 * }
 * ```
 *
 * And the alternative grouped format (from `validationResult().mapped()` or `.array()`):
 * ```json
 * [
 *   { "type": "field", "path": "email", "msg": "Invalid email" }
 * ]
 * ```
 */
import { ApiFieldError, ConstraintMap, ErrorPreset, GLOBAL_ERROR_FIELD } from 'ngx-api-forms';

/**
 * Shape of a single express-validator v7 error.
 */
interface ExpressValidatorError {
  type?: string;
  path?: string;
  param?: string;  // legacy v5/v6
  msg: string;
  location?: string;
  value?: unknown;
  code?: string;    // custom error code for schema-based inference
}

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

/**
 * Infers a constraint key from an express-validator error message.
 *
 * @remarks
 * Relies on English-language pattern matching. Falls back to 'serverError'
 * for unrecognized messages.
 */
function inferConstraint(message: string): string {
  const lower = message.toLowerCase();

  if (lower === 'invalid value') return 'invalid';
  if (lower.includes('is required') || lower.includes('must not be empty') || lower.includes('should not be empty')) return 'required';
  if (lower.includes('must be an email') || lower.includes('valid email') || lower.includes('is not a valid e-mail')) return 'email';
  if (lower.includes('must be at least') && lower.includes('char')) return 'minlength';
  if (lower.includes('must be at most') && lower.includes('char')) return 'maxlength';
  if (lower.includes('must be at least') || lower.includes('greater than or equal') || lower.includes('minimum')) return 'min';
  if (lower.includes('must be at most') || lower.includes('less than or equal') || lower.includes('maximum')) return 'max';
  if (lower.includes('must be a number') || lower.includes('must be numeric')) return 'number';
  if (lower.includes('must be an integer')) return 'integer';
  if (lower.includes('valid date')) return 'date';
  if (lower.includes('valid url')) return 'url';
  if (lower.includes('already exists') || lower.includes('already in use') || lower.includes('already been taken')) return 'unique';
  if (lower.includes('must match') || lower.includes('does not match')) return 'pattern';
  if (lower.includes('valid phone')) return 'phone';
  if (lower.includes('must be a boolean')) return 'boolean';
  if (lower.includes('must be an array')) return 'array';

  return 'serverError';
}

/**
 * Default constraint map for express-validator.
 */
export const EXPRESS_VALIDATOR_CONSTRAINT_MAP: ConstraintMap = {
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
  boolean: 'boolean',
  array: 'array',
  invalid: 'invalid',
  serverError: 'serverError',
};

/**
 * Extracts the field name from an express-validator error.
 * v7 uses `path`, v5/v6 uses `param`. Falls back to the global sentinel.
 */
function extractField(err: ExpressValidatorError): string {
  const raw = err.path ?? err.param;
  if (!raw || raw === '_error') return GLOBAL_ERROR_FIELD;
  // express-validator uses dot notation for nested fields (e.g. 'address.city')
  return raw;
}

/**
 * Creates an express-validator error preset.
 *
 * @param options.noInference - When true, skips English-language constraint guessing.
 *   All errors use `constraint: 'serverError'` with the original message preserved.
 * @param options.constraintPatterns - Custom regex patterns for constraint inference.
 *   Keys are constraint names, values are RegExp tested against the raw message.
 *   Checked before the built-in English patterns.
 *
 * @example
 * ```typescript
 * import { expressValidatorPreset } from 'ngx-api-forms/express-validator';
 *
 * const bridge = createFormBridge(form, { preset: expressValidatorPreset() });
 *
 * // No inference: raw messages, no guessing
 * const bridge = createFormBridge(form, { preset: expressValidatorPreset({ noInference: true }) });
 * ```
 */
export function expressValidatorPreset(options?: { noInference?: boolean; constraintPatterns?: Record<string, RegExp> }): ErrorPreset {
  const skipInference = options?.noInference ?? false;
  const userPatterns = options?.constraintPatterns;

  return {
    name: 'express-validator',
    constraintMap: EXPRESS_VALIDATOR_CONSTRAINT_MAP,
    parse(error: unknown): ApiFieldError[] {
      if (!error || typeof error !== 'object') return [];

      let errors: ExpressValidatorError[] | undefined;

      // Format 1: { errors: [...] } (standard express-validator output)
      if (!Array.isArray(error)) {
        const obj = error as Record<string, unknown>;
        if (Array.isArray(obj['errors'])) {
          const arr = obj['errors'] as unknown[];
          // Verify it looks like express-validator errors (not Laravel / NestJS)
          if (arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null && 'msg' in arr[0]) {
            errors = arr as ExpressValidatorError[];
          }
        }
      }

      // Format 2: Direct array (from validationResult().array())
      if (!errors && Array.isArray(error)) {
        const arr = error as unknown[];
        if (arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null && 'msg' in arr[0]) {
          errors = arr as ExpressValidatorError[];
        }
      }

      if (!errors || errors.length === 0) return [];

      const result: ApiFieldError[] = [];

      for (const err of errors) {
        if (typeof err.msg !== 'string') continue;

        // express-validator can produce 'alternative' and 'alternative_grouped' types
        // for oneOf() chains. Skip non-field errors unless they are type 'field' or legacy.
        if (err.type && err.type !== 'field' && !err.param) continue;

        const field = extractField(err);
        let constraint: string;
        if (err.code) {
          // Schema-based: use structured code directly (language-independent)
          constraint = err.code;
        } else if (skipInference) {
          constraint = 'serverError';
        } else if (userPatterns) {
          constraint = matchUserPatterns(err.msg, userPatterns) ?? inferConstraint(err.msg);
        } else {
          constraint = inferConstraint(err.msg);
        }
        result.push({ field, constraint, message: err.msg });
      }

      return result;
    },
  };
}
