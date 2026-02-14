import { classValidatorPreset } from './class-validator.preset';
import { laravelPreset } from './laravel.preset';
import { djangoPreset } from './django.preset';
import { zodPreset } from './zod.preset';

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

    it('should skip non_field_errors', () => {
      const result = preset.parse({
        non_field_errors: ['Unable to log in.'],
        email: ['This field is required.'],
      });

      expect(result.length).toBe(1);
    });

    it('should keep snake_case when camelCase is disabled', () => {
      const noConvert = djangoPreset({ camelCase: false });
      const result = noConvert.parse({
        first_name: ['This field is required.'],
      });

      expect(result[0].field).toBe('first_name');
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
  });
});
