import { classValidatorPreset } from './class-validator.preset';
import { laravelPreset } from 'ngx-api-forms/laravel';
import { djangoPreset } from 'ngx-api-forms/django';
import { zodPreset } from 'ngx-api-forms/zod';
import { expressValidatorPreset } from 'ngx-api-forms/express-validator';
import { analogPreset } from 'ngx-api-forms/analog';
import { GLOBAL_ERROR_FIELD } from '../models/api-forms.models';

describe('Error Presets', () => {
  describe('classValidatorPreset', () => {
    const preset = classValidatorPreset();

    it('should have name "class-validator"', () => {
      expect(preset.name).toBe('class-validator');
    });

    it('should parse structured ValidationPipe errors', () => {
      const result = preset.parse({
        statusCode: 400,
        message: [
          {
            property: 'email',
            constraints: {
              isEmail: 'email must be an email',
              isNotEmpty: 'email should not be empty',
            },
          },
        ],
      });

      expect(result.length).toBe(2);
      expect(result[0]).toEqual({
        field: 'email',
        constraint: 'isEmail',
        message: 'email must be an email',
      });
    });

    it('should handle nested children', () => {
      const result = preset.parse({
        message: [
          {
            property: 'address',
            children: [
              {
                property: 'city',
                constraints: { isNotEmpty: 'city should not be empty' },
              },
            ],
          },
        ],
      });

      expect(result.length).toBe(1);
      expect(result[0].field).toBe('address.city');
    });

    it('should parse string messages with pattern matching', () => {
      const result = preset.parse({
        message: 'email is required',
      });

      expect(result.length).toBe(1);
      expect(result[0].constraint).toBe('required');
    });

    it('should return empty for unrecognized input', () => {
      expect(preset.parse(null)).toEqual([]);
      expect(preset.parse(undefined)).toEqual([]);
      expect(preset.parse(42)).toEqual([]);
      expect(preset.parse('just a string')).toEqual([]);
    });

    describe('noInference', () => {
      const noInf = classValidatorPreset({ noInference: true });

      it('should use serverError for string message fallback', () => {
        const result = noInf.parse({ message: 'email is required' });
        expect(result.length).toBe(1);
        expect(result[0].constraint).toBe('serverError');
        expect(result[0].message).toBe('email is required');
      });

      it('should still use structured constraint keys when available', () => {
        const result = noInf.parse({
          statusCode: 400,
          message: [
            { property: 'email', constraints: { isEmail: 'email must be valid' } },
          ],
        });
        expect(result.length).toBe(1);
        expect(result[0].constraint).toBe('isEmail');
      });
    });
  });

  describe('laravelPreset', () => {
    const preset = laravelPreset();

    it('should have name "laravel"', () => {
      expect(preset.name).toBe('laravel');
    });

    it('should parse standard Laravel errors', () => {
      const result = preset.parse({
        message: 'The given data was invalid.',
        errors: {
          email: ['The email field is required.'],
          name: ['The name must be at least 3 characters.'],
        },
      });

      expect(result.length).toBe(2);
      expect(result[0].field).toBe('email');
      expect(result[0].constraint).toBe('required');
    });

    it('should handle "already taken" as unique', () => {
      const result = preset.parse({
        errors: {
          email: ['The email has already been taken.'],
        },
      });

      expect(result[0].constraint).toBe('unique');
    });

    describe('noInference', () => {
      const noInf = laravelPreset({ noInference: true });

      it('should use serverError instead of inferred constraint', () => {
        const result = noInf.parse({
          errors: {
            email: ['The email field is required.'],
            name: ['The name must be at least 3 characters.'],
          },
        });

        expect(result.length).toBe(2);
        expect(result[0].constraint).toBe('serverError');
        expect(result[0].message).toBe('The email field is required.');
        expect(result[1].constraint).toBe('serverError');
      });
    });
  });

  describe('djangoPreset', () => {
    const preset = djangoPreset();

    it('should have name "django"', () => {
      expect(preset.name).toBe('django');
    });

    it('should parse DRF errors', () => {
      const result = preset.parse({
        email: ['This field is required.'],
        first_name: ['Ensure this field has at least 3 characters.'],
      });

      expect(result.length).toBe(2);
      expect(result[0].field).toBe('email');
      expect(result[0].constraint).toBe('required');
      // snake_case → camelCase
      expect(result[1].field).toBe('firstName');
    });

    it('should emit non_field_errors as global errors', () => {
      const result = preset.parse({
        non_field_errors: ['Unable to log in.'],
        email: ['This field is required.'],
      });

      expect(result.length).toBe(2);
      const global = result.filter(e => e.field === GLOBAL_ERROR_FIELD);
      expect(global.length).toBe(1);
      expect(global[0].message).toBe('Unable to log in.');
    });

    it('should keep snake_case when camelCase is disabled', () => {
      const noConvert = djangoPreset({ camelCase: false });
      const result = noConvert.parse({
        first_name: ['This field is required.'],
      });

      expect(result[0].field).toBe('first_name');
    });

    describe('noInference', () => {
      const noInf = djangoPreset({ noInference: true });

      it('should use serverError instead of inferred constraint', () => {
        const result = noInf.parse({
          email: ['This field is required.'],
          name: ['Ensure this field has at least 3 characters.'],
        });

        expect(result.length).toBe(2);
        expect(result[0].constraint).toBe('serverError');
        expect(result[0].message).toBe('This field is required.');
        expect(result[1].constraint).toBe('serverError');
      });

      it('should combine noInference with camelCase option', () => {
        const noInfNoCamel = djangoPreset({ noInference: true, camelCase: false });
        const result = noInfNoCamel.parse({
          first_name: ['This field is required.'],
        });

        expect(result[0].field).toBe('first_name');
        expect(result[0].constraint).toBe('serverError');
      });
    });
  });

  describe('zodPreset', () => {
    const preset = zodPreset();

    it('should have name "zod"', () => {
      expect(preset.name).toBe('zod');
    });

    it('should parse flattened errors', () => {
      const result = preset.parse({
        formErrors: [],
        fieldErrors: {
          email: ['Invalid email'],
          name: ['Required'],
        },
      });

      expect(result.length).toBe(2);
    });

    it('should parse raw issues', () => {
      const result = preset.parse({
        issues: [
          { code: 'too_small', minimum: 3, path: ['name'], message: 'Too short' },
          { code: 'invalid_string', validation: 'email', path: ['email'], message: 'Invalid email' },
        ],
      });

      expect(result.length).toBe(2);
      expect(result[0].constraint).toBe('minlength');
      expect(result[1].constraint).toBe('email');
    });

    it('should handle nested paths', () => {
      const result = preset.parse({
        issues: [
          { code: 'invalid_type', path: ['address', 'city'], message: 'Required' },
        ],
      });

      expect(result[0].field).toBe('address.city');
    });

    describe('noInference', () => {
      const noInf = zodPreset({ noInference: true });

      it('should use serverError for flattened errors', () => {
        const result = noInf.parse({
          formErrors: [],
          fieldErrors: {
            email: ['Invalid email'],
            name: ['Required'],
          },
        });

        expect(result.length).toBe(2);
        expect(result[0].constraint).toBe('serverError');
        expect(result[0].message).toBe('Invalid email');
        expect(result[1].constraint).toBe('serverError');
      });

      it('should use serverError for raw issues', () => {
        const result = noInf.parse({
          issues: [
            { code: 'too_small', minimum: 3, path: ['name'], message: 'Too short' },
            { code: 'invalid_string', validation: 'email', path: ['email'], message: 'Invalid email' },
          ],
        });

        expect(result.length).toBe(2);
        expect(result[0].constraint).toBe('serverError');
        expect(result[1].constraint).toBe('serverError');
      });
    });

    it('should parse formErrors as global errors', () => {
      const result = preset.parse({
        formErrors: ['Form is invalid', 'Check credentials'],
        fieldErrors: {
          email: ['Invalid email'],
        },
      });

      expect(result.length).toBe(3);
      const global = result.filter(e => e.field === GLOBAL_ERROR_FIELD);
      expect(global.length).toBe(2);
      expect(global[0].message).toBe('Form is invalid');
      expect(global[1].message).toBe('Check credentials');
    });

    it('should treat issues with empty path as global', () => {
      const result = preset.parse({
        issues: [
          { code: 'custom', path: [], message: 'Form-level error' },
          { code: 'invalid_string', validation: 'email', path: ['email'], message: 'Bad email' },
        ],
      });

      expect(result.length).toBe(2);
      const global = result.filter(e => e.field === GLOBAL_ERROR_FIELD);
      expect(global.length).toBe(1);
      expect(global[0].message).toBe('Form-level error');
    });
  });

  describe('expressValidatorPreset', () => {
    const preset = expressValidatorPreset();

    it('should have name "express-validator"', () => {
      expect(preset.name).toBe('express-validator');
    });

    it('should parse v7 format with { errors: [...] }', () => {
      const result = preset.parse({
        errors: [
          { type: 'field', path: 'email', msg: 'Invalid value', location: 'body' },
          { type: 'field', path: 'name', msg: 'Name is required', location: 'body' },
        ],
      });

      expect(result.length).toBe(2);
      expect(result[0].field).toBe('email');
      expect(result[0].constraint).toBe('invalid');
      expect(result[0].message).toBe('Invalid value');
      expect(result[1].field).toBe('name');
      expect(result[1].constraint).toBe('required');
    });

    it('should parse legacy v5/v6 format with param instead of path', () => {
      const result = preset.parse({
        errors: [
          { param: 'email', msg: 'Must be a valid email', location: 'body' },
        ],
      });

      expect(result.length).toBe(1);
      expect(result[0].field).toBe('email');
      expect(result[0].constraint).toBe('email');
    });

    it('should parse direct array format', () => {
      const result = preset.parse([
        { type: 'field', path: 'email', msg: 'Invalid value' },
        { type: 'field', path: 'name', msg: 'Name is required' },
      ]);

      expect(result.length).toBe(2);
      expect(result[0].field).toBe('email');
    });

    it('should route _error to global errors', () => {
      const result = preset.parse({
        errors: [
          { type: 'field', path: '_error', msg: 'Auth failed', location: 'body' },
          { type: 'field', path: 'email', msg: 'Invalid value', location: 'body' },
        ],
      });

      expect(result.length).toBe(2);
      const global = result.filter(e => e.field === GLOBAL_ERROR_FIELD);
      expect(global.length).toBe(1);
      expect(global[0].message).toBe('Auth failed');
    });

    it('should infer common constraints', () => {
      const cases: Array<[string, string]> = [
        ['Invalid value', 'invalid'],
        ['Email is required', 'required'],
        ['Must be a valid email', 'email'],
        ['Must be at least 3 characters', 'minlength'],
        ['Must be a number', 'number'],
        ['Must be an integer', 'integer'],
        ['Email already exists', 'unique'],
        ['Something custom', 'serverError'],
      ];

      for (const [msg, expected] of cases) {
        const result = preset.parse({ errors: [{ type: 'field', path: 'x', msg }] });
        expect(result[0].constraint).toBe(expected, `"${msg}" should map to "${expected}"`);
      }
    });

    it('should skip alternative type errors', () => {
      const result = preset.parse({
        errors: [
          { type: 'alternative', msg: 'At least one must pass' },
          { type: 'field', path: 'email', msg: 'Invalid value', location: 'body' },
        ],
      });

      expect(result.length).toBe(1);
      expect(result[0].field).toBe('email');
    });

    it('should return empty for unrecognized input', () => {
      expect(preset.parse(null)).toEqual([]);
      expect(preset.parse(undefined)).toEqual([]);
      expect(preset.parse(42)).toEqual([]);
      expect(preset.parse('just a string')).toEqual([]);
      expect(preset.parse({ message: 'NestJS style' })).toEqual([]);
    });

    it('should not match Laravel format (errors object with arrays)', () => {
      const result = preset.parse({
        errors: {
          email: ['The email field is required.'],
        },
      });
      expect(result.length).toBe(0);
    });

    describe('noInference', () => {
      const noInf = expressValidatorPreset({ noInference: true });

      it('should use serverError for all messages', () => {
        const result = noInf.parse({
          errors: [
            { type: 'field', path: 'email', msg: 'Email is required', location: 'body' },
          ],
        });
        expect(result.length).toBe(1);
        expect(result[0].constraint).toBe('serverError');
        expect(result[0].message).toBe('Email is required');
      });
    });
  });

  describe('constraintPatterns', () => {
    it('should use custom patterns in laravelPreset', () => {
      const preset = laravelPreset({
        constraintPatterns: {
          required: /est obligatoire/i,
          email: /courriel.*invalide/i,
        },
      });

      const result = preset.parse({
        errors: {
          email: ['Le champ courriel est invalide.'],
          name: ['Le champ est obligatoire.'],
        },
      });

      expect(result.length).toBe(2);
      expect(result[0].constraint).toBe('email');
      expect(result[1].constraint).toBe('required');
    });

    it('should fall through to English inference when custom patterns miss', () => {
      const preset = laravelPreset({
        constraintPatterns: {
          required: /est obligatoire/i,
        },
      });

      const result = preset.parse({
        errors: {
          email: ['The email field is required.'],
        },
      });

      // Falls through to English inference
      expect(result[0].constraint).toBe('required');
    });

    it('should use custom patterns in djangoPreset', () => {
      const preset = djangoPreset({
        constraintPatterns: {
          required: /ce champ est obligatoire/i,
        },
      });

      const result = preset.parse({
        email: ['Ce champ est obligatoire.'],
      });

      expect(result[0].constraint).toBe('required');
    });

    it('should use custom patterns in zodPreset (flattened format)', () => {
      const preset = zodPreset({
        constraintPatterns: {
          required: /obligatoire/i,
          email: /courriel/i,
        },
      });

      const result = preset.parse({
        formErrors: [],
        fieldErrors: {
          email: ['Courriel invalide'],
          name: ['Champ obligatoire'],
        },
      });

      expect(result.length).toBe(2);
      expect(result[0].constraint).toBe('email');
      expect(result[1].constraint).toBe('required');
    });

    it('should use custom patterns in expressValidatorPreset', () => {
      const preset = expressValidatorPreset({
        constraintPatterns: {
          required: /obligatoire/i,
        },
      });

      const result = preset.parse({
        errors: [
          { type: 'field', path: 'name', msg: 'Ce champ est obligatoire', location: 'body' },
        ],
      });

      expect(result[0].constraint).toBe('required');
    });

    it('should be ignored when noInference is true', () => {
      const preset = laravelPreset({
        noInference: true,
        constraintPatterns: { required: /obligatoire/i },
      });

      const result = preset.parse({
        errors: {
          name: ['Le champ est obligatoire.'],
        },
      });

      expect(result[0].constraint).toBe('serverError');
    });
  });

  // ===========================================================================
  // Schema-Based Inference (structured error codes)
  // ===========================================================================

  describe('Schema-based inference', () => {
    it('djangoPreset should use code from { message, code } objects', () => {
      const preset = djangoPreset();
      const result = preset.parse({
        email: [{ message: 'Ce champ est obligatoire.', code: 'required' }],
        name: [{ message: 'Doit contenir 3 caracteres', code: 'min_length' }],
      });

      expect(result.length).toBe(2);
      expect(result[0].constraint).toBe('required');
      expect(result[0].message).toBe('Ce champ est obligatoire.');
      expect(result[1].constraint).toBe('min_length');
    });

    it('djangoPreset should mix structured and string errors', () => {
      const preset = djangoPreset();
      const result = preset.parse({
        email: [
          { message: 'Obligatoire', code: 'required' },
          'Enter a valid email address.',
        ],
      });

      expect(result.length).toBe(2);
      expect(result[0].constraint).toBe('required');
      expect(result[1].constraint).toBe('email');
    });

    it('laravelPreset should use rule from { message, rule } objects', () => {
      const preset = laravelPreset();
      const result = preset.parse({
        errors: {
          email: [{ message: 'Le champ email est requis.', rule: 'required' }],
          name: [{ message: 'Le nom doit contenir 3 caracteres.', rule: 'min' }],
        },
      });

      expect(result.length).toBe(2);
      expect(result[0].constraint).toBe('required');
      expect(result[0].message).toBe('Le champ email est requis.');
      expect(result[1].constraint).toBe('min');
    });

    it('laravelPreset should mix structured and string errors', () => {
      const preset = laravelPreset();
      const result = preset.parse({
        errors: {
          email: [
            { message: 'Requis', rule: 'required' },
            'The email must be a valid email address.',
          ],
        },
      });

      expect(result.length).toBe(2);
      expect(result[0].constraint).toBe('required');
      expect(result[1].constraint).toBe('email');
    });

    it('expressValidatorPreset should use code field when present', () => {
      const preset = expressValidatorPreset();
      const result = preset.parse({
        errors: [
          { type: 'field', path: 'email', msg: 'Adresse invalide', code: 'email', location: 'body' },
          { type: 'field', path: 'name', msg: 'Champ obligatoire', code: 'required', location: 'body' },
        ],
      });

      expect(result.length).toBe(2);
      expect(result[0].constraint).toBe('email');
      expect(result[0].message).toBe('Adresse invalide');
      expect(result[1].constraint).toBe('required');
    });

    it('expressValidatorPreset should fall back to inference when no code', () => {
      const preset = expressValidatorPreset();
      const result = preset.parse({
        errors: [
          { type: 'field', path: 'email', msg: 'Must be a valid email', location: 'body' },
          { type: 'field', path: 'name', msg: 'Champ obligatoire', code: 'required', location: 'body' },
        ],
      });

      expect(result[0].constraint).toBe('email');  // inferred
      expect(result[1].constraint).toBe('required'); // from code
    });

    it('schema-based codes should bypass noInference', () => {
      const preset = djangoPreset({ noInference: true });
      const result = preset.parse({
        email: [{ message: 'Requis', code: 'required' }],
      });
      expect(result[0].constraint).toBe('required');
    });

    it('schema-based codes should bypass constraintPatterns', () => {
      const preset = laravelPreset({
        constraintPatterns: { custom: /.*/ },
      });
      const result = preset.parse({
        errors: {
          email: [{ message: 'Anything', rule: 'specific_rule' }],
        },
      });
      expect(result[0].constraint).toBe('specific_rule');
    });
  });

  // ===========================================================================
  // Analog Preset
  // ===========================================================================

  describe('analogPreset', () => {
    const preset = analogPreset();

    it('should have name "analog"', () => {
      expect(preset.name).toBe('analog');
    });

    it('should parse Nitro envelope { statusCode, data: { field: string[] } }', () => {
      const result = preset.parse({
        statusCode: 422,
        statusMessage: 'Validation failed',
        data: {
          email: ['This field is required.'],
          name: ['Must be at least 3 characters.'],
        },
      });

      expect(result.length).toBe(2);
      expect(result[0].field).toBe('email');
      expect(result[0].constraint).toBe('required');
      expect(result[1].field).toBe('name');
      expect(result[1].constraint).toBe('minlength');
    });

    it('should handle direct { field: string[] } format without envelope', () => {
      const result = preset.parse({
        email: ['Enter a valid email address.'],
      });

      expect(result.length).toBe(1);
      expect(result[0].constraint).toBe('email');
    });

    it('should route _errors and non_field_errors to global', () => {
      const result = preset.parse({
        statusCode: 422,
        data: {
          _errors: ['Request rate limited.'],
          non_field_errors: ['Invalid credentials.'],
          email: ['Required.'],
        },
      });

      const globalErrors = result.filter(e => e.field === GLOBAL_ERROR_FIELD);
      const fieldErrors = result.filter(e => e.field !== GLOBAL_ERROR_FIELD);

      expect(globalErrors.length).toBe(2);
      expect(fieldErrors.length).toBe(1);
      expect(fieldErrors[0].field).toBe('email');
    });

    it('should use statusMessage as global error when no data', () => {
      const result = preset.parse({
        statusCode: 500,
        statusMessage: 'Internal Server Error',
      });

      expect(result.length).toBe(1);
      expect(result[0].field).toBe(GLOBAL_ERROR_FIELD);
      expect(result[0].message).toBe('Internal Server Error');
    });

    it('should support structured { message, code } objects', () => {
      const result = preset.parse({
        statusCode: 422,
        data: {
          email: [{ message: 'Adresse email invalide', code: 'email' }],
          password: [{ message: 'Trop court', code: 'min_length' }],
        },
      });

      expect(result.length).toBe(2);
      expect(result[0].constraint).toBe('email');
      expect(result[0].message).toBe('Adresse email invalide');
      expect(result[1].constraint).toBe('min_length');
    });

    it('should support constraintPatterns', () => {
      const preset2 = analogPreset({
        constraintPatterns: {
          required: /obligatoire/i,
        },
      });

      const result = preset2.parse({
        statusCode: 422,
        data: {
          name: ['Ce champ est obligatoire'],
        },
      });

      expect(result[0].constraint).toBe('required');
    });

    it('should support noInference', () => {
      const preset2 = analogPreset({ noInference: true });
      const result = preset2.parse({
        statusCode: 422,
        data: {
          email: ['This field is required.'],
        },
      });

      expect(result[0].constraint).toBe('serverError');
    });

    it('should return empty for null/undefined', () => {
      expect(preset.parse(null)).toEqual([]);
      expect(preset.parse(undefined)).toEqual([]);
      expect(preset.parse(42)).toEqual([]);
      expect(preset.parse('string')).toEqual([]);
    });

    it('should return empty for arrays', () => {
      expect(preset.parse([1, 2, 3])).toEqual([]);
    });
  });

});
