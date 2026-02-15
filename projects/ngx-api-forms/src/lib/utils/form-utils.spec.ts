import { FormBuilder, FormGroup } from '@angular/forms';
import { of, throwError } from 'rxjs';
import {
  toFormData,
  enableForm,
  disableForm,
  clearFormErrors,
  getDirtyValues,
  hasError,
  getErrorMessage,
  parseApiErrors,
  wrapSubmit,
} from './form-utils';
import { laravelPreset } from 'ngx-api-forms/laravel';
import { zodPreset } from 'ngx-api-forms/zod';

describe('Form Utilities', () => {
  let fb: FormBuilder;
  let form: FormGroup;

  beforeEach(() => {
    fb = new FormBuilder();
    form = fb.group({
      email: ['test@test.com'],
      name: ['John'],
      age: [25],
    });
  });

  describe('toFormData', () => {
    it('should convert simple values', () => {
      const fd = toFormData({ email: 'a@b.com', name: 'John' });
      expect(fd.get('email')).toBe('a@b.com');
      expect(fd.get('name')).toBe('John');
    });

    it('should skip null/undefined', () => {
      const fd = toFormData({ email: 'a@b.com', name: null as unknown, age: undefined as unknown });
      expect(fd.get('email')).toBe('a@b.com');
      expect(fd.get('name')).toBeNull();
      expect(fd.get('age')).toBeNull();
    });

    it('should handle dates', () => {
      const date = new Date('2026-01-01');
      const fd = toFormData({ date });
      expect(fd.get('date')).toBe(date.toISOString());
    });

    it('should handle arrays', () => {
      const fd = toFormData({ tags: ['a', 'b', 'c'] });
      expect(fd.getAll('tags')).toEqual(['a', 'b', 'c']);
    });

    it('should JSON-stringify objects', () => {
      const fd = toFormData({ meta: { foo: 'bar' } });
      expect(fd.get('meta')).toBe('{"foo":"bar"}');
    });
  });

  describe('enableForm / disableForm', () => {
    it('should disable all controls', () => {
      disableForm(form);
      expect(form.controls['email'].disabled).toBeTrue();
      expect(form.controls['name'].disabled).toBeTrue();
      expect(form.controls['age'].disabled).toBeTrue();
    });

    it('should disable with exceptions', () => {
      disableForm(form, { except: ['email'] });
      expect(form.controls['email'].enabled).toBeTrue();
      expect(form.controls['name'].disabled).toBeTrue();
    });

    it('should enable all controls', () => {
      disableForm(form);
      enableForm(form);
      expect(form.controls['email'].enabled).toBeTrue();
      expect(form.controls['name'].enabled).toBeTrue();
    });

    it('should enable with exceptions', () => {
      disableForm(form);
      enableForm(form, { except: ['name'] });
      expect(form.controls['email'].enabled).toBeTrue();
      expect(form.controls['name'].disabled).toBeTrue();
    });
  });

  describe('clearFormErrors', () => {
    it('should clear all errors from all controls', () => {
      form.controls['email'].setErrors({ required: true });
      form.controls['name'].setErrors({ minlength: true });

      clearFormErrors(form);

      expect(form.controls['email'].errors).toBeNull();
      expect(form.controls['name'].errors).toBeNull();
    });
  });

  describe('getDirtyValues', () => {
    it('should return only dirty fields', () => {
      form.controls['email'].setValue('changed@test.com');
      form.controls['email'].markAsDirty();

      const dirty = getDirtyValues(form);
      expect(dirty).toEqual({ email: 'changed@test.com' });
    });

    it('should return empty if nothing dirty', () => {
      expect(getDirtyValues(form)).toEqual({});
    });
  });

  describe('hasError', () => {
    it('should detect specific error', () => {
      form.controls['email'].setErrors({ required: true });
      expect(hasError(form, 'required')).toBeTrue();
      expect(hasError(form, 'email')).toBeFalse();
    });
  });

  describe('getErrorMessage', () => {
    it('should return string error value', () => {
      form.controls['email'].setErrors({ email: 'Invalid email address' });
      expect(getErrorMessage(form, 'email', 'email')).toBe('Invalid email address');
    });

    it('should return error key for non-string values', () => {
      form.controls['email'].setErrors({ required: true });
      expect(getErrorMessage(form, 'email', 'required')).toBe('required');
    });

    it('should return first error if no key specified', () => {
      form.controls['email'].setErrors({ required: 'This field is required' });
      expect(getErrorMessage(form, 'email')).toBe('This field is required');
    });

    it('should return null for no errors', () => {
      expect(getErrorMessage(form, 'email')).toBeNull();
    });
  });

  describe('parseApiErrors', () => {
    it('should parse class-validator errors by default', () => {
      const apiError = {
        statusCode: 400,
        message: [
          { property: 'email', constraints: { isEmail: 'email must be a valid email' } },
        ],
      };

      const result = parseApiErrors(apiError);
      expect(result.length).toBe(1);
      expect(result[0].field).toBe('email');
      expect(result[0].constraint).toBe('isEmail');
    });

    it('should accept a single preset', () => {
      const apiError = {
        message: 'The given data was invalid.',
        errors: {
          email: ['The email field is required.'],
        },
      };

      const result = parseApiErrors(apiError, laravelPreset());
      expect(result.length).toBe(1);
      expect(result[0].field).toBe('email');
      expect(result[0].constraint).toBe('required');
    });

    it('should try multiple presets in order', () => {
      const zodError = {
        fieldErrors: {
          name: ['String must contain at least 3 character(s)'],
        },
      };

      // Laravel won't match, Zod will
      const result = parseApiErrors(zodError, [laravelPreset(), zodPreset()]);
      expect(result.length).toBe(1);
      expect(result[0].field).toBe('name');
      expect(result[0].constraint).toBe('minlength');
    });

    it('should return empty array for unrecognized payloads', () => {
      expect(parseApiErrors('random string')).toEqual([]);
      expect(parseApiErrors(null)).toEqual([]);
      expect(parseApiErrors(42)).toEqual([]);
    });

    it('should warn in debug mode when no preset matches', () => {
      spyOn(console, 'warn');
      parseApiErrors('not a valid payload', undefined, { debug: true });
      expect(console.warn).toHaveBeenCalled();
      const args = (console.warn as jasmine.Spy).calls.first().args;
      expect(args[0]).toContain('no preset produced results');
    });

    it('should not warn when debug is false', () => {
      spyOn(console, 'warn');
      parseApiErrors('not a valid payload', undefined, { debug: false });
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('wrapSubmit', () => {
    it('should disable form then re-enable on success', (done) => {
      wrapSubmit(form, of('ok')).subscribe({
        next: (val) => {
          expect(val).toBe('ok');
          expect(form.enabled).toBeTrue();
          done();
        },
      });

      // Form should have been disabled synchronously but by the time
      // subscribe fires the tap has re-enabled it
    });

    it('should re-enable form on error', (done) => {
      wrapSubmit(form, throwError(() => new Error('fail'))).subscribe({
        error: (err) => {
          expect(err.message).toBe('fail');
          expect(form.enabled).toBeTrue();
          done();
        },
      });
    });

    it('should call onError callback', (done) => {
      const spy = jasmine.createSpy('onError');

      wrapSubmit(form, throwError(() => new Error('fail')), {
        onError: spy,
      }).subscribe({
        error: () => {
          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy.calls.first().args[0].message).toBe('fail');
          done();
        },
      });
    });
  });
});
