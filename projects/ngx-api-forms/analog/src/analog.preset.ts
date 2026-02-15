/**
 * Analog / Nitro / h3 error preset.
 *
 * Analog uses Nitro (powered by h3) for API routes. Validation errors thrown
 * via `createError()` are wrapped in a Nitro envelope:
 *
 * ```json
 * {
 *   "statusCode": 422,
 *   "statusMessage": "Validation failed",
 *   "data": {
 *     "email": ["This field is required."],
 *     "name": ["Must be at least 3 characters."]
 *   }
 * }
 * ```
 *
 * This preset unwraps the `data` field and parses it as a flat
 * `{ field: string[] }` structure (Django-like). It also supports:
 *
 * - Structured error codes: `{ "email": [{ "message": "...", "code": "required" }] }`
 * - `non_field_errors` / `_errors` routed to `globalErrorsSignal`
 * - `statusMessage` used as a global error when `data` is absent
 * - Direct `{ field: string[] }` format (without Nitro envelope)
 *
 * For Zod validation in Analog routes, prefer `zodPreset` instead.
 *
 * @example
 * ```typescript
 * // server/routes/api/register.post.ts
 * import { defineEventHandler, readBody, createError } from 'h3';
 *
 * export default defineEventHandler(async (event) => {
 *   const body = await readBody(event);
 *   const errors: Record<string, string[]> = {};
 *
 *   if (!body.email) errors.email = ['This field is required.'];
 *   if (body.password?.length < 8) errors.password = ['Must be at least 8 characters.'];
 *
 *   if (Object.keys(errors).length > 0) {
 *     throw createError({ statusCode: 422, data: errors });
 *   }
 *
 *   return { id: 1, email: body.email };
 * });
 * ```
 */
import { ApiFieldError, ConstraintMap, ErrorPreset, GLOBAL_ERROR_FIELD } from 'ngx-api-forms';

/** Shape of a structured error with a code (language-independent). */
interface StructuredError {
  message: string;
  code: string;
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
 * Infers a constraint key from a validation message.
 */
function inferConstraint(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('required') || lower.includes('may not be blank')) return 'required';
  if (lower.includes('valid email') || lower.includes('must be an email')) return 'email';
  if (lower.includes('at least') && lower.includes('character')) return 'minlength';
  if (lower.includes('at most') && lower.includes('character')) return 'maxlength';
  if (lower.includes('at least') || lower.includes('greater than or equal') || lower.includes('minimum')) return 'min';
  if (lower.includes('at most') || lower.includes('less than or equal') || lower.includes('maximum')) return 'max';
  if (lower.includes('must be a number') || lower.includes('numeric')) return 'number';
  if (lower.includes('must be an integer')) return 'integer';
  if (lower.includes('valid date')) return 'date';
  if (lower.includes('valid url')) return 'url';
  if (lower.includes('already exists') || lower.includes('already taken')) return 'unique';
  if (lower.includes('must match') || lower.includes('does not match')) return 'pattern';

  return 'serverError';
}

/**
 * Default constraint map for Analog / h3.
 */
export const ANALOG_CONSTRAINT_MAP: ConstraintMap = {
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
  invalid: 'invalid',
  serverError: 'serverError',
};

/**
 * Creates a preset for Analog / Nitro / h3 API routes.
 *
 * Unwraps the h3 `createError({ data })` envelope automatically.
 * Supports both plain string arrays and structured `{ message, code }` objects.
 *
 * @param options.noInference - Skip English-language constraint guessing.
 * @param options.constraintPatterns - Custom regex patterns for constraint inference.
 *
 * @example
 * ```typescript
 * import { analogPreset } from 'ngx-api-forms/analog';
 *
 * const bridge = provideFormBridge(form, { preset: analogPreset() });
 * ```
 */
export function analogPreset(options?: { noInference?: boolean; constraintPatterns?: Record<string, RegExp> }): ErrorPreset {
  const skipInference = options?.noInference ?? false;
  const userPatterns = options?.constraintPatterns;

  return {
    name: 'analog',
    constraintMap: ANALOG_CONSTRAINT_MAP,
    parse(error: unknown): ApiFieldError[] {
      if (!error || typeof error !== 'object' || Array.isArray(error)) return [];

      const err = error as Record<string, unknown>;

      // Unwrap Nitro/h3 envelope: { statusCode, statusMessage, data }
      let fieldData: Record<string, unknown> | undefined;

      if (err['data'] && typeof err['data'] === 'object' && !Array.isArray(err['data'])) {
        fieldData = err['data'] as Record<string, unknown>;
      }
      // Direct format (no envelope): { field: [messages] }
      else if (!err['statusCode'] && !err['message'] && !err['errors']) {
        fieldData = err as Record<string, unknown>;
      }
      // Nitro envelope without structured data: { statusCode, statusMessage }
      else if (typeof err['statusMessage'] === 'string' && !err['data']) {
        return [{
          field: GLOBAL_ERROR_FIELD,
          constraint: 'serverError',
          message: err['statusMessage'] as string,
        }];
      }

      if (!fieldData) return [];

      const result: ApiFieldError[] = [];

      for (const [rawField, messages] of Object.entries(fieldData)) {
        if (!Array.isArray(messages)) continue;

        const isGlobal = rawField === 'non_field_errors' || rawField === '_errors';
        const field = isGlobal ? GLOBAL_ERROR_FIELD : rawField;

        for (const item of messages) {
          // Structured format: { message: string, code: string }
          if (typeof item === 'object' && item !== null && 'message' in item && 'code' in item) {
            const structured = item as StructuredError;
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
