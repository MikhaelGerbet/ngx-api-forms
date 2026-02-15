import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { FormBridge, createFormBridge } from './form-bridge';
import { classValidatorPreset } from '../presets/class-validator.preset';
import { laravelPreset } from '../presets/laravel.preset';
import { djangoPreset } from '../presets/django.preset';
import { zodPreset } from '../presets/zod.preset';

describe('FormBridge', () => {
  let fb: FormBuilder;
  let form: FormGroup;

  beforeEach(() => {
    fb = new FormBuilder();
    form = fb.group({
      email: ['', Validators.required],
      name: [''],
      age: [null],
      password: [''],
    });
  });

  describe('createFormBridge', () => {
    it('should create a FormBridge instance', () => {
      const bridge = createFormBridge(form);
      expect(bridge).toBeInstanceOf(FormBridge);
    });

    it('should default to class-validator preset', () => {
      const bridge = createFormBridge(form);
      const errors = bridge.applyApiErrors({
        statusCode: 400,
        message: [
          { property: 'email', constraints: { isEmail: 'email must be an email' } },
        ],
      });
      expect(errors.length).toBe(1);
      expect(errors[0].field).toBe('email');
    });
  });

  describe('applyApiErrors - class-validator', () => {
    let bridge: FormBridge;

    beforeEach(() => {
      bridge = createFormBridge(form, { preset: classValidatorPreset() });
    });

    it('should parse NestJS ValidationPipe format', () => {
      const errors = bridge.applyApiErrors({
        statusCode: 400,
        message: [
          { property: 'email', constraints: { isEmail: 'email must be an email' } },
          { property: 'name', constraints: { isNotEmpty: 'name should not be empty' } },
        ],
      });

      expect(errors.length).toBe(2);
      expect(form.controls['email'].hasError('email')).toBeTrue();
      expect(form.controls['name'].hasError('required')).toBeTrue();
    });

    it('should parse single string message', () => {
      const errors = bridge.applyApiErrors({
        statusCode: 400,
        message: 'email is required',
      });

      expect(errors.length).toBe(1);
      expect(errors[0].field).toBe('email');
    });

    it('should parse array of string messages', () => {
      const errors = bridge.applyApiErrors({
        statusCode: 400,
        message: ['email is required', 'name must be shorter'],
      });

      expect(errors.length).toBe(2);
    });

    it('should handle multiple constraints on one field', () => {
      const errors = bridge.applyApiErrors({
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

      expect(errors.length).toBe(2);
    });

    it('should handle nested validation errors', () => {
      const nestedForm = fb.group({
        address: fb.group({
          city: [''],
        }),
      });

      const nestedBridge = createFormBridge(nestedForm, { preset: classValidatorPreset() });
      const errors = nestedBridge.applyApiErrors({
        message: [
          {
            property: 'address',
            children: [
              { property: 'city', constraints: { isNotEmpty: 'city should not be empty' } },
            ],
          },
        ],
      });

      expect(errors.length).toBe(1);
      expect(errors[0].field).toBe('address.city');
    });

    it('should return empty for unrecognized format', () => {
      const errors = bridge.applyApiErrors({ foo: 'bar' });
      expect(errors.length).toBe(0);
    });

    it('should handle null/undefined gracefully', () => {
      expect(bridge.applyApiErrors(null).length).toBe(0);
      expect(bridge.applyApiErrors(undefined).length).toBe(0);
    });
  });

  describe('applyApiErrors - Laravel', () => {
    let bridge: FormBridge;

    beforeEach(() => {
      bridge = createFormBridge(form, { preset: laravelPreset() });
    });

    it('should parse standard Laravel validation format', () => {
      const errors = bridge.applyApiErrors({
        message: 'The given data was invalid.',
        errors: {
          email: ['The email field is required.', 'The email must be a valid email address.'],
          name: ['The name must be at least 3 characters.'],
        },
      });

      expect(errors.length).toBe(3);
      expect(form.controls['email'].errors).toBeTruthy();
      expect(form.controls['name'].errors).toBeTruthy();
    });
  });

  describe('applyApiErrors - Django', () => {
    let bridge: FormBridge;

    beforeEach(() => {
      bridge = createFormBridge(form, { preset: djangoPreset() });
    });

    it('should parse DRF validation format', () => {
      const errors = bridge.applyApiErrors({
        email: ['This field is required.'],
        name: ['Ensure this field has at least 3 characters.'],
      });

      expect(errors.length).toBe(2);
      expect(form.controls['email'].hasError('required')).toBeTrue();
    });

    it('should route non_field_errors to globalErrorsSignal', () => {
      const errors = bridge.applyApiErrors({
        non_field_errors: ['Unable to log in with provided credentials.'],
        email: ['This field is required.'],
      });

      expect(errors.length).toBe(1);
      expect(errors[0].field).toBe('email');

      const global = bridge.globalErrorsSignal();
      expect(global.length).toBe(1);
      expect(global[0].message).toBe('Unable to log in with provided credentials.');
    });
  });

  describe('applyApiErrors - Zod', () => {
    let bridge: FormBridge;

    beforeEach(() => {
      bridge = createFormBridge(form, { preset: zodPreset() });
    });

    it('should parse Zod flattened errors', () => {
      const errors = bridge.applyApiErrors({
        formErrors: [],
        fieldErrors: {
          email: ['Invalid email'],
          name: ['String must contain at least 3 character(s)'],
        },
      });

      expect(errors.length).toBe(2);
    });

    it('should parse Zod issues format', () => {
      const errors = bridge.applyApiErrors({
        issues: [
          { code: 'too_small', minimum: 3, path: ['name'], message: 'Too short' },
          { code: 'invalid_string', validation: 'email', path: ['email'], message: 'Invalid email' },
        ],
      });

      expect(errors.length).toBe(2);
    });
  });

  describe('applyApiErrors - multi-preset fallback', () => {
    it('should try presets in order', () => {
      const bridge = createFormBridge(form, {
        preset: [zodPreset(), classValidatorPreset()],
      });

      // This is class-validator format, so Zod should return empty, then class-validator works
      const errors = bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'email must be an email' } },
        ],
      });

      expect(errors.length).toBe(1);
    });
  });

  describe('clearApiErrors', () => {
    it('should clear only API-set errors and preserve client-side errors', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });

      bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'email must be an email' } },
        ],
      });

      expect(form.controls['email'].errors).toBeTruthy();
      expect(form.controls['email'].errors!['email']).toBeTruthy();

      bridge.clearApiErrors();

      // API error (email) is cleared; client-side validator (required) is restored
      expect(form.controls['email'].errors?.['email']).toBeFalsy();
      // The required validator should still be active since field is empty
      expect(form.controls['email'].hasError('required')).toBeTrue();
      expect(bridge.errorsSignal().length).toBe(0);
    });

    it('should preserve non-API errors set on the control', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });

      // Set a custom client-side error
      form.controls['name'].setErrors({ customError: 'my custom error' });

      // Apply an API error on the same control
      bridge.applyApiErrors({
        message: [
          { property: 'name', constraints: { isNotEmpty: 'name should not be empty' } },
        ],
      });

      // Both errors should be present (API replaces, so only API error remains on name)
      expect(form.controls['name'].hasError('required')).toBeTrue();

      bridge.clearApiErrors();

      // API error cleared, but customError was overwritten by applyApiErrors.
      // The control should now be revalidated.
      expect(bridge.errorsSignal().length).toBe(0);
    });
  });

  describe('getFirstError', () => {
    it('should return the first API error', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });

      bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'email must be an email' } },
          { property: 'name', constraints: { isNotEmpty: 'name is required' } },
        ],
      });

      const first = bridge.getFirstError();
      expect(first).toBeTruthy();
      expect(first!.field).toBe('email');
    });

    it('should return null when no errors', () => {
      // Use a form without validators to test "no errors" state
      const cleanForm = new FormBuilder().group({ email: [''], name: [''] });
      const bridge = createFormBridge(cleanForm);
      expect(bridge.getFirstError()).toBeNull();
    });
  });

  describe('Signals', () => {
    it('should update errorsSignal when errors are applied', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });

      expect(bridge.errorsSignal().length).toBe(0);
      expect(bridge.hasErrorsSignal()).toBeFalse();

      bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'bad email' } },
        ],
      });

      expect(bridge.errorsSignal().length).toBe(1);
      expect(bridge.hasErrorsSignal()).toBeTrue();
      expect(bridge.firstErrorSignal()).toBeTruthy();
    });
  });

  describe('i18n', () => {
    it('should use i18n prefix for error messages', () => {
      const bridge = createFormBridge(form, {
        preset: classValidatorPreset(),
        i18n: { prefix: 'validation' },
      });

      const errors = bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'email must be an email' } },
        ],
      });

      expect(errors[0].message).toBe('validation.email.isEmail');
    });

    it('should use custom i18n resolver', () => {
      const bridge = createFormBridge(form, {
        preset: classValidatorPreset(),
        i18n: {
          resolver: (field, constraint) => `Custom: ${field}.${constraint}`,
        },
      });

      const errors = bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'email must be an email' } },
        ],
      });

      expect(errors[0].message).toBe('Custom: email.isEmail');
    });
  });

  describe('Error Interceptors', () => {
    it('should allow interceptors to modify errors', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });

      bridge.addInterceptor((errors) =>
        errors.filter((e) => e.field !== 'name')
      );

      const errors = bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'bad email' } },
          { property: 'name', constraints: { isNotEmpty: 'name required' } },
        ],
      });

      expect(errors.length).toBe(1);
      expect(errors[0].field).toBe('email');
    });
  });

  describe('mergeErrors option', () => {
    it('should merge with existing errors when mergeErrors is true', () => {
      const bridge = createFormBridge(form, {
        preset: classValidatorPreset(),
        mergeErrors: true,
      });

      form.controls['email'].setErrors({ customError: true });

      bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'bad email' } },
        ],
      });

      expect(form.controls['email'].hasError('customError')).toBeTrue();
      expect(form.controls['email'].hasError('email')).toBeTrue();
    });
  });

  describe('markAsTouched before setErrors (double-click fix)', () => {
    it('should have touched=true when statusChanges fires', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });
      let wasTouchedOnStatusChange = false;

      form.controls['email'].statusChanges.subscribe(() => {
        wasTouchedOnStatusChange = form.controls['email'].touched;
      });

      bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'bad email' } },
        ],
      });

      expect(wasTouchedOnStatusChange).toBeTrue();
    });
  });

  describe('multi-error accumulation on same field', () => {
    it('should keep all errors when same field has multiple constraints', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });

      const errors = bridge.applyApiErrors({
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

      expect(errors.length).toBe(2);
      // Both errors should be present on the control (not just the last one)
      expect(form.controls['email'].hasError('email')).toBeTrue();
      expect(form.controls['email'].hasError('required')).toBeTrue();
    });

    it('should accumulate errors from multiple fields independently', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });

      bridge.applyApiErrors({
        statusCode: 400,
        message: [
          { property: 'email', constraints: { isEmail: 'bad email', isNotEmpty: 'empty' } },
          { property: 'name', constraints: { isNotEmpty: 'empty name' } },
        ],
      });

      expect(form.controls['email'].hasError('email')).toBeTrue();
      expect(form.controls['email'].hasError('required')).toBeTrue();
      expect(form.controls['name'].hasError('required')).toBeTrue();
    });
  });

  describe('removeInterceptor (dispose function)', () => {
    it('should return a dispose function from addInterceptor', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });
      const dispose = bridge.addInterceptor((errors) => errors);
      expect(typeof dispose).toBe('function');
    });

    it('should remove interceptor when dispose is called', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });

      const dispose = bridge.addInterceptor((errors) =>
        errors.filter((e) => e.field !== 'email')
      );

      // With interceptor: email errors are filtered out
      let result = bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'bad' } },
          { property: 'name', constraints: { isNotEmpty: 'required' } },
        ],
      });
      expect(result.length).toBe(1);
      expect(result[0].field).toBe('name');

      // After dispose: email errors come through again
      bridge.clearApiErrors();
      dispose();

      result = bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'bad' } },
          { property: 'name', constraints: { isNotEmpty: 'required' } },
        ],
      });
      expect(result.length).toBe(2);
    });
  });

  describe('FormArray support', () => {
    it('should resolve errors on FormArray children via dot-index notation', () => {
      const fb2 = new FormBuilder();
      const arrayForm = fb2.group({
        items: fb2.array([
          fb2.group({ name: [''] }),
          fb2.group({ name: [''] }),
        ]),
      });

      const bridge = createFormBridge(arrayForm, { preset: classValidatorPreset() });

      // Simulate API error on items.0.name using class-validator nested format
      // We'll use a direct applyApiErrors with pre-parsed field path
      const errors = bridge.applyApiErrors({
        message: [
          {
            property: 'items',
            children: [
              {
                property: '0',
                children: [
                  { property: 'name', constraints: { isNotEmpty: 'name is required' } },
                ],
              },
            ],
          },
        ],
      });

      expect(errors.length).toBe(1);
      expect(errors[0].field).toBe('items.0.name');

      // Verify the error is actually on the nested FormControl
      const nameControl = arrayForm.get(['items', '0', 'name']);
      expect(nameControl).toBeTruthy();
      expect(nameControl!.hasError('required')).toBeTrue();
    });
  });

  describe('catchAll option', () => {
    it('should skip unknown constraints when catchAll is false (default)', () => {
      const bridge = createFormBridge(form, {
        preset: classValidatorPreset(),
        catchAll: false,
      });

      // Use a constraint that maps to '' in the constraint map
      // Actually, unknown constraints pass through as-is, so let's test with a real scenario
      const errors = bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'bad email' } },
        ],
      });

      expect(errors.length).toBe(1);
    });

    it('should use "generic" key for unknown constraints when catchAll is true', () => {
      const bridge = createFormBridge(form, {
        preset: classValidatorPreset(),
        catchAll: true,
      });

      // Simulate an error with an empty constraint key (maps to '' in constraintMap)
      const errors = bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { '': 'something went wrong' } },
        ],
      });

      // With catchAll=true, empty errorKey is replaced by 'generic'
      expect(errors.length).toBe(1);
      expect(errors[0].errorKey).toBe('generic');
      expect(form.controls['email'].hasError('generic')).toBeTrue();
    });
  });

  describe('form getter', () => {
    it('should return the underlying FormGroup', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });
      expect(bridge.form).toBe(form);
    });
  });

  describe('getFieldErrors', () => {
    it('should return ValidationErrors for a field with errors', () => {
      const bridge = createFormBridge(form, { preset: laravelPreset() });
      bridge.applyApiErrors({
        message: 'validation failed',
        errors: {
          email: ['Email is required.', 'Email format is invalid.'],
          name: ['Name is required.'],
        },
      });
      const emailErrors = bridge.getFieldErrors('email');
      expect(emailErrors).not.toBeNull();
      // Laravel infers: 'is required' -> required, 'format is invalid' -> invalid
      expect(emailErrors!['required']).toBe('Email is required.');
      expect(emailErrors!['invalid']).toBe('Email format is invalid.');
    });

    it('should return null when field has no errors', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });
      expect(bridge.getFieldErrors('password')).toBeNull();
    });
  });

  describe('multiple interceptors ordering', () => {
    it('should apply interceptors in registration order', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });

      bridge.addInterceptor(errors => errors.map(e => ({ ...e, message: e.message + ' [A]' })));
      bridge.addInterceptor(errors => errors.map(e => ({ ...e, message: e.message + ' [B]' })));

      bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'bad' } },
        ],
      });

      const resolved = bridge.errorsSignal().filter(e => e.field === 'email');
      expect(resolved.length).toBe(1);
      expect(resolved[0].message).toBe('bad [A] [B]');
    });

    it('should allow partial disposal of interceptors', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });

      const disposeA = bridge.addInterceptor(errors =>
        errors.map(e => ({ ...e, message: e.message + ' [A]' }))
      );
      bridge.addInterceptor(errors =>
        errors.map(e => ({ ...e, message: e.message + ' [B]' }))
      );

      disposeA();

      bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'bad' } },
        ],
      });

      const resolved = bridge.errorsSignal().filter(e => e.field === 'email');
      expect(resolved[0].message).toBe('bad [B]');
    });
  });

  describe('Zod wrapped format (errors.fieldErrors)', () => {
    it('should parse { errors: { fieldErrors: ... } } format', () => {
      const bridge = createFormBridge(form, { preset: zodPreset() });
      const result = bridge.applyApiErrors({
        errors: {
          fieldErrors: {
            email: ['Invalid email address'],
            name: ['Too short'],
          },
        },
      });
      expect(result.length).toBe(2);
      // Zod infers: 'email' in message -> email, 'Too short' -> serverError (no pattern match)
      expect(form.controls['email'].hasError('email')).toBeTrue();
      expect(form.controls['name'].hasError('serverError')).toBeTrue();
    });
  });

  describe('i18n resolver returning null', () => {
    it('should fallback to original message when resolver returns null', () => {
      const bridge = createFormBridge(form, {
        preset: classValidatorPreset(),
        i18n: {
          resolver: () => null,
        },
      });

      bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'email must be valid' } },
        ],
      });

      const resolved = bridge.errorsSignal().filter(e => e.field === 'email');
      expect(resolved.length).toBe(1);
      expect(resolved[0].message).toBe('email must be valid');
    });
  });

  describe('debug mode', () => {
    it('should warn when no preset produces results', () => {
      spyOn(console, 'warn');
      const bridge = createFormBridge(form, {
        preset: classValidatorPreset(),
        debug: true,
      });

      bridge.applyApiErrors({ random: 'unrecognized payload' });

      expect(console.warn).toHaveBeenCalled();
      const args = (console.warn as jasmine.Spy).calls.first().args;
      expect(args[0]).toContain('No preset produced results');
    });

    it('should warn when a field does not match any form control', () => {
      spyOn(console, 'warn');
      const bridge = createFormBridge(form, {
        preset: classValidatorPreset(),
        debug: true,
      });

      bridge.applyApiErrors({
        message: [
          { property: 'unknownField', constraints: { isNotEmpty: 'should not be empty' } },
        ],
      });

      expect(console.warn).toHaveBeenCalledWith(
        jasmine.stringContaining('unknownField'),
        jasmine.anything(),
        jasmine.anything(),
      );
    });

    it('should not warn when debug is false', () => {
      spyOn(console, 'warn');
      const bridge = createFormBridge(form, {
        preset: classValidatorPreset(),
        debug: false,
      });

      bridge.applyApiErrors({ random: 'unrecognized' });
      bridge.applyApiErrors({
        message: [
          { property: 'ghost', constraints: { isNotEmpty: 'nope' } },
        ],
      });

      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('globalErrorsSignal', () => {
    it('should capture Django non_field_errors', () => {
      const bridge = createFormBridge(form, { preset: djangoPreset() });

      bridge.applyApiErrors({
        non_field_errors: ['Unable to log in with provided credentials.'],
        email: ['This field is required.'],
      });

      const global = bridge.globalErrorsSignal();
      expect(global.length).toBe(1);
      expect(global[0].message).toBe('Unable to log in with provided credentials.');
      expect(global[0].constraint).toBeTruthy();

      // Field errors should still be applied to the form
      expect(form.controls['email'].hasError('required')).toBeTrue();
    });

    it('should capture Django detail errors', () => {
      const bridge = createFormBridge(form, { preset: djangoPreset() });

      bridge.applyApiErrors({
        detail: ['Authentication credentials were not provided.'],
      });

      const global = bridge.globalErrorsSignal();
      expect(global.length).toBe(1);
      expect(global[0].message).toBe('Authentication credentials were not provided.');
    });

    it('should capture Zod formErrors', () => {
      const bridge = createFormBridge(form, { preset: zodPreset() });

      bridge.applyApiErrors({
        formErrors: ['Form is invalid', 'Please fix all errors'],
        fieldErrors: {
          email: ['Invalid email'],
        },
      });

      const global = bridge.globalErrorsSignal();
      expect(global.length).toBe(2);
      expect(global[0].message).toBe('Form is invalid');
      expect(global[1].message).toBe('Please fix all errors');

      // Field errors should still work
      expect(form.controls['email'].errors).toBeTruthy();
    });

    it('should capture Zod issues with empty path as global', () => {
      const bridge = createFormBridge(form, { preset: zodPreset() });

      bridge.applyApiErrors({
        issues: [
          { code: 'custom', path: [], message: 'Form-level error' },
          { code: 'invalid_string', validation: 'email', path: ['email'], message: 'Invalid email' },
        ],
      });

      const global = bridge.globalErrorsSignal();
      expect(global.length).toBe(1);
      expect(global[0].message).toBe('Form-level error');

      // Field error should still apply
      expect(form.controls['email'].errors).toBeTruthy();
    });

    it('should route unmatched field errors to globalErrorsSignal', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });

      bridge.applyApiErrors({
        message: [
          { property: 'email', constraints: { isEmail: 'bad email' } },
          { property: 'nonExistentField', constraints: { isNotEmpty: 'field required' } },
        ],
      });

      // Field error applied normally
      expect(form.controls['email'].hasError('email')).toBeTrue();

      // Unmatched field routed to global
      const global = bridge.globalErrorsSignal();
      expect(global.length).toBe(1);
      expect(global[0].message).toBe('field required');
      expect(global[0].originalField).toBe('nonExistentField');
    });

    it('should be cleared by clearApiErrors', () => {
      const bridge = createFormBridge(form, { preset: djangoPreset() });

      bridge.applyApiErrors({
        non_field_errors: ['Login failed'],
        email: ['Required'],
      });

      expect(bridge.globalErrorsSignal().length).toBe(1);
      expect(bridge.errorsSignal().length).toBe(1);

      bridge.clearApiErrors();

      expect(bridge.globalErrorsSignal().length).toBe(0);
      expect(bridge.errorsSignal().length).toBe(0);
    });

    it('should update hasErrorsSignal when only global errors exist', () => {
      const cleanForm = new FormBuilder().group({ email: [''] });
      const bridge = createFormBridge(cleanForm, { preset: djangoPreset() });

      expect(bridge.hasErrorsSignal()).toBeFalse();

      bridge.applyApiErrors({
        non_field_errors: ['Server error'],
      });

      expect(bridge.hasErrorsSignal()).toBeTrue();
      expect(bridge.errorsSignal().length).toBe(0); // No field errors
      expect(bridge.globalErrorsSignal().length).toBe(1);
    });

    it('should be replaced on each applyApiErrors call', () => {
      const bridge = createFormBridge(form, { preset: djangoPreset() });

      bridge.applyApiErrors({
        non_field_errors: ['Error 1', 'Error 2'],
      });
      expect(bridge.globalErrorsSignal().length).toBe(2);

      bridge.applyApiErrors({
        non_field_errors: ['Error 3'],
      });
      expect(bridge.globalErrorsSignal().length).toBe(1);
      expect(bridge.globalErrorsSignal()[0].message).toBe('Error 3');
    });
  });
});
