/**
 * Integration test: HttpClient -> FormBridge
 *
 * Verifies the full flow from an HTTP 422 response through preset parsing
 * to Angular form control errors, using Angular's HttpTestingController.
 */
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

import { createFormBridge } from '../form-bridge/form-bridge';
import { classValidatorPreset } from '../presets/class-validator.preset';
import { laravelPreset } from '../presets/laravel.preset';
import { djangoPreset } from '../presets/django.preset';
import { zodPreset } from '../presets/zod.preset';
import { parseApiErrors } from '../utils/form-utils';

describe('HttpClient Integration', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let fb: FormBuilder;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    fb = new FormBuilder();
  });

  afterEach(() => {
    httpTesting.verify();
  });

  // -- NestJS / class-validator -------------------------------------------

  it('should apply class-validator errors from a 422 response', () => {
    const form = fb.group({
      email: ['', Validators.required],
      name: [''],
    });
    const bridge = createFormBridge(form, { preset: classValidatorPreset() });

    http.post('/api/register', form.value).subscribe({
      error: (err) => bridge.applyApiErrors(err.error),
    });

    httpTesting.expectOne('/api/register').flush(
      {
        statusCode: 422,
        message: [
          { property: 'email', constraints: { isEmail: 'email must be a valid email' } },
          { property: 'name', constraints: { isNotEmpty: 'name should not be empty' } },
        ],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(form.controls['email'].hasError('email')).toBeTrue();
    expect(form.controls['name'].hasError('required')).toBeTrue();
    expect(bridge.hasErrorsSignal()).toBeTrue();
    expect(bridge.errorsSignal().length).toBe(2);
  });

  // -- Laravel ------------------------------------------------------------

  it('should apply Laravel errors from a 422 response', () => {
    const form = fb.group({
      email: [''],
      password: [''],
    });
    const bridge = createFormBridge(form, { preset: laravelPreset() });

    http.post('/api/login', form.value).subscribe({
      error: (err) => bridge.applyApiErrors(err.error),
    });

    httpTesting.expectOne('/api/login').flush(
      {
        message: 'The given data was invalid.',
        errors: {
          email: ['The email field is required.'],
          password: ['The password must be at least 8 characters.'],
        },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(form.controls['email'].hasError('required')).toBeTrue();
    expect(form.controls['password'].errors).toBeTruthy();
    expect(bridge.errorsSignal().length).toBe(2);
  });

  // -- Django REST Framework -----------------------------------------------

  it('should apply Django REST errors from a 400 response', () => {
    const form = fb.group({
      email: [''],
      username: [''],
    });
    const bridge = createFormBridge(form, { preset: djangoPreset() });

    http.post('/api/users', form.value).subscribe({
      error: (err) => bridge.applyApiErrors(err.error),
    });

    httpTesting.expectOne('/api/users').flush(
      {
        email: ['This field is required.'],
        username: ['A user with that username already exists.'],
      },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(form.controls['email'].hasError('required')).toBeTrue();
    expect(form.controls['username'].errors).toBeTruthy();
    expect(bridge.errorsSignal().length).toBe(2);
  });

  // -- Zod -----------------------------------------------------------------

  it('should apply Zod flat errors from a 422 response', () => {
    const form = fb.group({
      email: [''],
      age: [null],
    });
    const bridge = createFormBridge(form, { preset: zodPreset() });

    http.post('/api/profile', form.value).subscribe({
      error: (err) => bridge.applyApiErrors(err.error),
    });

    httpTesting.expectOne('/api/profile').flush(
      {
        fieldErrors: {
          email: ['Invalid email'],
          age: ['Expected number, received nan'],
        },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(form.controls['email'].errors).toBeTruthy();
    expect(form.controls['age'].errors).toBeTruthy();
    expect(bridge.errorsSignal().length).toBe(2);
  });

  // -- parseApiErrors standalone ------------------------------------------

  it('should parse errors from HttpErrorResponse without a form', () => {
    let parsedErrors: ReturnType<typeof parseApiErrors> = [];

    http.post('/api/data', {}).subscribe({
      error: (err) => {
        parsedErrors = parseApiErrors(err.error, classValidatorPreset());
      },
    });

    httpTesting.expectOne('/api/data').flush(
      {
        statusCode: 400,
        message: [
          { property: 'title', constraints: { isNotEmpty: 'title should not be empty' } },
        ],
      },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(parsedErrors.length).toBe(1);
    expect(parsedErrors[0].field).toBe('title');
    expect(parsedErrors[0].constraint).toBe('isNotEmpty');
  });

  // -- Multi-preset -------------------------------------------------------

  it('should try multiple presets until one matches', () => {
    const form = fb.group({ email: [''] });
    const bridge = createFormBridge(form, {
      preset: [laravelPreset(), classValidatorPreset()],
    });

    http.post('/api/save', form.value).subscribe({
      error: (err) => bridge.applyApiErrors(err.error),
    });

    // Send a class-validator payload - Laravel won't match, class-validator will
    httpTesting.expectOne('/api/save').flush(
      {
        statusCode: 400,
        message: [
          { property: 'email', constraints: { isEmail: 'email must be a valid email' } },
        ],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(form.controls['email'].hasError('email')).toBeTrue();
  });

  // -- Debug mode warns on unmatched fields --------------------------------

  it('should warn in debug mode when a field does not match any control', () => {
    const form = fb.group({ email: [''] });
    const bridge = createFormBridge(form, {
      preset: classValidatorPreset(),
      debug: true,
    });
    spyOn(console, 'warn');

    http.post('/api/test', form.value).subscribe({
      error: (err) => bridge.applyApiErrors(err.error),
    });

    httpTesting.expectOne('/api/test').flush(
      {
        statusCode: 400,
        message: [
          { property: 'unknownField', constraints: { isNotEmpty: 'should not be empty' } },
        ],
      },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(console.warn).toHaveBeenCalledWith(
      jasmine.stringContaining('unknownField'),
      jasmine.anything(),
      jasmine.anything(),
    );
  });
});
