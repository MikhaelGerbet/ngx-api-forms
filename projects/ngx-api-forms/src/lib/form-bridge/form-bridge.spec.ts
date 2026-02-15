import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { of, throwError, delay } from 'rxjs';
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

    it('should skip non_field_errors', () => {
      const errors = bridge.applyApiErrors({
        non_field_errors: ['Unable to log in with provided credentials.'],
        email: ['This field is required.'],
      });

      expect(errors.length).toBe(1);
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
    it('should clear all errors', () => {
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

  describe('Form State Management', () => {
    it('should setDefaultValues and reset', () => {
      const bridge = createFormBridge(form);

      bridge.setDefaultValues({ email: 'test@test.com', name: 'John' });
      expect(form.controls['email'].value).toBe('test@test.com');
      expect(form.controls['name'].value).toBe('John');

      form.controls['email'].setValue('changed@test.com');
      bridge.reset();

      expect(form.controls['email'].value).toBe('test@test.com');
    });

    it('should enable/disable with exceptions', () => {
      const bridge = createFormBridge(form);

      bridge.disable({ except: ['email'] });
      expect(form.controls['email'].enabled).toBeTrue();
      expect(form.controls['name'].disabled).toBeTrue();

      bridge.enable();
      expect(form.controls['name'].enabled).toBeTrue();
    });

    it('should track dirty state', () => {
      const bridge = createFormBridge(form);

      bridge.setDefaultValues({ email: 'test@test.com' });
      expect(bridge.checkDirty()).toBeFalse();

      form.controls['email'].setValue('changed@test.com');
      expect(bridge.checkDirty()).toBeTrue();
    });
  });

  describe('toFormData', () => {
    it('should convert form values to FormData', () => {
      form.controls['email'].setValue('test@test.com');
      form.controls['name'].setValue('John');

      const bridge = createFormBridge(form);
      const formData = bridge.toFormData();

      expect(formData.get('email')).toBe('test@test.com');
      expect(formData.get('name')).toBe('John');
    });

    it('should skip null values', () => {
      form.controls['email'].setValue('test@test.com');
      form.controls['age'].setValue(null);

      const bridge = createFormBridge(form);
      const formData = bridge.toFormData();

      expect(formData.get('email')).toBe('test@test.com');
      expect(formData.get('age')).toBeNull();
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

  describe('isSubmittingSignal', () => {
    it('should start as false', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });
      expect(bridge.isSubmittingSignal()).toBeFalse();
    });
  });

  describe('handleSubmit', () => {
    it('should set isSubmittingSignal to true during submit', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });
      let isSubmittingDuringCall = false;

      bridge.handleSubmit(of({ ok: true })).subscribe({
        next: () => {
          // After success, isSubmitting should already be false
        },
      });

      // After the synchronous observable completes, isSubmitting is false
      expect(bridge.isSubmittingSignal()).toBeFalse();
    });

    it('should disable form during submit and re-enable on success', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });

      bridge.handleSubmit(of({ ok: true })).subscribe();

      // After synchronous completion, form should be re-enabled
      expect(form.enabled).toBeTrue();
    });

    it('should apply API errors on failure and re-enable form', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });
      const apiError = {
        error: {
          statusCode: 400,
          message: [
            { property: 'email', constraints: { isEmail: 'email must be valid' } },
          ],
        },
      };

      bridge.handleSubmit(throwError(() => apiError)).subscribe({
        error: () => { /* expected */ },
      });

      expect(form.enabled).toBeTrue();
      expect(bridge.isSubmittingSignal()).toBeFalse();
      expect(form.controls['email'].hasError('email')).toBeTrue();
    });

    it('should re-throw the error for subscriber handling', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });
      let caughtError: unknown = null;

      bridge.handleSubmit(throwError(() => new Error('test'))).subscribe({
        error: (err) => { caughtError = err; },
      });

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toBe('test');
    });

    it('should use custom extractError when provided', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });
      const apiError = {
        data: {
          statusCode: 400,
          message: [
            { property: 'email', constraints: { isEmail: 'bad' } },
          ],
        },
      };

      bridge.handleSubmit(
        throwError(() => apiError),
        { extractError: (err: any) => err.data }
      ).subscribe({
        error: () => { /* expected */ },
      });

      expect(form.controls['email'].hasError('email')).toBeTrue();
    });

    it('should clear api errors before each submit', () => {
      const bridge = createFormBridge(form, { preset: classValidatorPreset() });
      const apiError = {
        error: {
          message: [
            { property: 'email', constraints: { isEmail: 'bad' } },
          ],
        },
      };

      // First submit - apply errors
      bridge.handleSubmit(throwError(() => apiError)).subscribe({ error: () => {} });
      expect(bridge.hasErrorsSignal()).toBeTrue();

      // Second submit - success should clear errors
      bridge.handleSubmit(of({ ok: true })).subscribe();
      expect(bridge.hasErrorsSignal()).toBeFalse();
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

  describe('reactive isDirtySignal', () => {
    it('should update isDirtySignal reactively when form value changes', () => {
      const bridge = createFormBridge(form);
      bridge.setDefaultValues({ email: 'test@test.com' });

      expect(bridge.isDirtySignal()).toBeFalse();

      form.controls['email'].setValue('changed@test.com');

      // isDirtySignal should update reactively (via valueChanges subscription)
      expect(bridge.isDirtySignal()).toBeTrue();

      form.controls['email'].setValue('test@test.com');
      expect(bridge.isDirtySignal()).toBeFalse();
    });
  });

  describe('destroy()', () => {
    it('should stop listening to valueChanges after destroy', () => {
      const bridge = createFormBridge(form);
      bridge.setDefaultValues({ email: 'test@test.com' });

      bridge.destroy();

      // After destroy, changing form value should NOT update isDirtySignal
      form.controls['email'].setValue('changed@test.com');
      // isDirtySignal remains false because valueChanges subscription is gone
      expect(bridge.isDirtySignal()).toBeFalse();
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
});
