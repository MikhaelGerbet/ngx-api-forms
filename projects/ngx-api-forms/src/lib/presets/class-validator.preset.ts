/**
 * class-validator / NestJS error preset.
 *
 * Parses the standard ValidationPipe error format:
 * ```json
 * {
 *   "statusCode": 400,
 *   "message": [
 *     { "property": "email", "constraints": { "isEmail": "email must be an email" } }
 *   ],
 *   "error": "Bad Request"
 * }
 * ```
 *
 * Also handles flat string messages from NestJS:
 * ```json
 * { "statusCode": 400, "message": "email is already used" }
 * ```
 */
import { ApiFieldError, ClassValidatorError, ErrorPreset } from '../models/api-forms.models';

function flattenErrors(
  errors: ClassValidatorError[],
  parentPath: string = ''
): ApiFieldError[] {
  const result: ApiFieldError[] = [];

  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      for (const [constraint, message] of Object.entries(error.constraints)) {
        result.push({ field: path, constraint, message });
      }
    }

    // Recursively handle nested validation (e.g. nested DTOs)
    if (error.children && error.children.length > 0) {
      result.push(...flattenErrors(error.children, path));
    }
  }

  return result;
}

function parseStringMessage(message: string): ApiFieldError[] {
  // Attempt to extract field name and constraint from common class-validator messages
  const patterns: Array<{ regex: RegExp; constraint: string }> = [
    { regex: /^(\w+) is required$/, constraint: 'required' },
    { regex: /^(\w+) must be shorter/, constraint: 'maxLength' },
    { regex: /^(\w+) must be longer/, constraint: 'minLength' },
    { regex: /^(\w+) must not be less/, constraint: 'min' },
    { regex: /^(\w+) must not be more/, constraint: 'max' },
    { regex: /^(\w+) must be an? email/, constraint: 'isEmail' },
    { regex: /^(\w+) must be an? valid phone/, constraint: 'isPhoneNumber' },
    { regex: /^(\w+) must be one of the following/, constraint: 'isEnum' },
    { regex: /^(\w+) must be an? Date/, constraint: 'isDate' },
    { regex: /^(\w+) must be an? IBAN/, constraint: 'isIBAN' },
    { regex: /^(\w+) must be an? EAN/, constraint: 'isEAN' },
    { regex: /^(\w+) must be an? URL/, constraint: 'isUrl' },
    { regex: /^(\w+) must be an? valid url/i, constraint: 'isUrl' },
    { regex: /^(\w+) is not valid/i, constraint: 'invalid' },
    { regex: /^(\w+) is already taken/i, constraint: 'unique' },
    { regex: /^(\w+) is already used/i, constraint: 'unique' },
    { regex: /^(\w+) must be a valid decimal/i, constraint: 'isDecimal' },
    { regex: /^Email is already used/i, constraint: 'unique' },
    { regex: /^File url is already used/i, constraint: 'unique' },
  ];

  for (const { regex, constraint } of patterns) {
    const match = message.match(regex);
    if (match) {
      const field = match[1]
        ? match[1].charAt(0).toLowerCase() + match[1].slice(1)
        : 'unknown';
      return [{ field, constraint, message }];
    }
  }

  // Special cases with specific field mapping
  if (/email is already used/i.test(message)) {
    return [{ field: 'email', constraint: 'unique', message }];
  }
  if (/file url is already used/i.test(message)) {
    return [{ field: 'url', constraint: 'unique', message }];
  }
  if (/file is required/i.test(message)) {
    return [{ field: 'file', constraint: 'required', message }];
  }

  return [];
}

/**
 * Creates a class-validator / NestJS error preset.
 *
 * @example
 * ```typescript
 * import { classValidatorPreset } from 'ngx-api-forms';
 *
 * const bridge = createFormBridge(form, {
 *   preset: classValidatorPreset()
 * });
 * ```
 */
export function classValidatorPreset(): ErrorPreset {
  return {
    name: 'class-validator',
    parse(error: unknown): ApiFieldError[] {
      if (!error || typeof error !== 'object') return [];

      const err = error as Record<string, unknown>;

      // Standard NestJS ValidationPipe format: { message: ClassValidatorError[] }
      if (Array.isArray(err['message'])) {
        const messages = err['message'];

        // Check if it's an array of ClassValidatorError objects
        if (messages.length > 0 && typeof messages[0] === 'object' && 'property' in messages[0]) {
          return flattenErrors(messages as ClassValidatorError[]);
        }

        // It might be an array of strings (simple messages)
        if (messages.length > 0 && typeof messages[0] === 'string') {
          const results: ApiFieldError[] = [];
          for (const msg of messages as string[]) {
            results.push(...parseStringMessage(msg));
          }
          return results;
        }
      }

      // Single string message: { message: "email is required" }
      if (typeof err['message'] === 'string') {
        return parseStringMessage(err['message'] as string);
      }

      // Direct array (no wrapper): [{ property: 'email', constraints: {...} }]
      if (Array.isArray(error)) {
        const items = error as unknown[];
        if (items.length > 0 && typeof items[0] === 'object' && items[0] !== null && 'property' in items[0]) {
          return flattenErrors(items as ClassValidatorError[]);
        }
      }

      return [];
    },
  };
}

/**
 * Default constraint map for class-validator.
 * Maps class-validator constraint names to Angular form error keys.
 */
export const CLASS_VALIDATOR_CONSTRAINT_MAP: Record<string, string> = {
  isNotEmpty: 'required',
  isEmail: 'email',
  minLength: 'minlength',
  maxLength: 'maxlength',
  min: 'min',
  max: 'max',
  isPhoneNumber: 'phone',
  isEnum: 'enum',
  isDate: 'date',
  isDateString: 'date',
  isIBAN: 'iban',
  isEAN: 'ean',
  isUrl: 'url',
  isURL: 'url',
  isDecimal: 'decimal',
  isNumber: 'number',
  isInt: 'integer',
  isBoolean: 'boolean',
  isString: 'string',
  isArray: 'array',
  arrayMinSize: 'minlength',
  arrayMaxSize: 'maxlength',
  matches: 'pattern',
  isStrongPassword: 'password',
  unique: 'unique',
  invalid: 'invalid',
  required: 'required',
};
