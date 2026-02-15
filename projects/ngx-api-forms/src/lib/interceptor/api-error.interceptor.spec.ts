/**
 * Tests for apiErrorInterceptor and withFormBridge.
 */
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { FormBuilder, Validators } from '@angular/forms';

import { createFormBridge } from '../form-bridge/form-bridge';
import { classValidatorPreset } from '../presets/class-validator.preset';
import { laravelPreset } from 'ngx-api-forms/laravel';
import { apiErrorInterceptor, withFormBridge } from './api-error.interceptor';
import { ApiFieldError, ResolvedFieldError } from '../models/api-forms.models';

describe('apiErrorInterceptor', () => {
  let http: HttpClient;
  let httpTesting: HttpTestingController;
  let fb: FormBuilder;

  function setup(config?: Parameters<typeof apiErrorInterceptor>[0]): void {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([apiErrorInterceptor(config)])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
    fb = new FormBuilder();
  }

  afterEach(() => {
    httpTesting.verify();
  });

  // -- withFormBridge per-request ------------------------------------------

  it('should auto-apply errors to bridge on 422', () => {
    setup();

    const form = fb.group({ email: ['', Validators.required], name: [''] });
    const bridge = createFormBridge(form, { preset: classValidatorPreset() });

    http.post('/api/save', {}, withFormBridge(bridge)).subscribe({
      error: () => { /* expected */ },
    });

    httpTesting.expectOne('/api/save').flush(
      {
        statusCode: 422,
        message: [
          { property: 'email', constraints: { isEmail: 'email must be valid' } },
          { property: 'name', constraints: { isNotEmpty: 'name required' } },
        ],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(form.controls['email'].hasError('email')).toBeTrue();
    expect(form.controls['name'].hasError('required')).toBeTrue();
    expect(bridge.hasErrorsSignal()).toBeTrue();
    expect(bridge.errorsSignal().length).toBe(2);
  });

  it('should auto-apply errors to bridge on 400', () => {
    setup();

    const form = fb.group({ email: [''] });
    const bridge = createFormBridge(form, { preset: classValidatorPreset() });

    http.post('/api/save', {}, withFormBridge(bridge)).subscribe({
      error: () => { /* expected */ },
    });

    httpTesting.expectOne('/api/save').flush(
      {
        statusCode: 400,
        message: [
          { property: 'email', constraints: { isEmail: 'email must be valid' } },
        ],
      },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(form.controls['email'].hasError('email')).toBeTrue();
  });

  it('should not apply errors for non-matching status codes', () => {
    setup();

    const form = fb.group({ email: [''] });
    const bridge = createFormBridge(form, { preset: classValidatorPreset() });

    http.post('/api/save', {}, withFormBridge(bridge)).subscribe({
      error: () => { /* expected */ },
    });

    httpTesting.expectOne('/api/save').flush(
      { message: 'Internal Server Error' },
      { status: 500, statusText: 'Internal Server Error' },
    );

    expect(bridge.hasErrorsSignal()).toBeFalse();
  });

  it('should re-throw the error after applying', (done) => {
    setup();

    const form = fb.group({ email: [''] });
    const bridge = createFormBridge(form, { preset: classValidatorPreset() });

    http.post('/api/save', {}, withFormBridge(bridge)).subscribe({
      error: (err) => {
        expect(err.status).toBe(422);
        expect(bridge.hasErrorsSignal()).toBeTrue();
        done();
      },
    });

    httpTesting.expectOne('/api/save').flush(
      {
        statusCode: 422,
        message: [
          { property: 'email', constraints: { isEmail: 'email must be valid' } },
        ],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
  });

  it('should not interfere with requests without withFormBridge', () => {
    setup();

    http.get('/api/data').subscribe({
      error: () => { /* expected */ },
    });

    httpTesting.expectOne('/api/data').flush(
      { message: 'Bad Request' },
      { status: 400, statusText: 'Bad Request' },
    );

    // No crash - interceptor gracefully handles missing bridge
  });

  // -- Custom status codes -------------------------------------------------

  it('should respect custom statusCodes config', () => {
    setup({ statusCodes: [422] });

    const form = fb.group({ email: [''] });
    const bridge = createFormBridge(form, { preset: classValidatorPreset() });

    // 400 should NOT trigger (only 422 configured)
    http.post('/api/save', {}, withFormBridge(bridge)).subscribe({
      error: () => { /* expected */ },
    });

    httpTesting.expectOne('/api/save').flush(
      {
        statusCode: 400,
        message: [
          { property: 'email', constraints: { isEmail: 'email must be valid' } },
        ],
      },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(bridge.hasErrorsSignal()).toBeFalse();
  });

  // -- onError callback ---------------------------------------------------

  it('should call onError callback with parsed errors', () => {
    const captured: (ApiFieldError | ResolvedFieldError)[] = [];
    setup({
      onError: (errors) => { captured.push(...errors); },
    });

    const form = fb.group({ email: [''] });
    const bridge = createFormBridge(form, { preset: classValidatorPreset() });

    http.post('/api/save', {}, withFormBridge(bridge)).subscribe({
      error: () => { /* expected */ },
    });

    httpTesting.expectOne('/api/save').flush(
      {
        statusCode: 422,
        message: [
          { property: 'email', constraints: { isEmail: 'email must be valid' } },
        ],
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(captured.length).toBe(1);
    expect(captured[0].field).toBe('email');
  });

  it('should call onError with standalone parsing when no bridge is attached', () => {
    const captured: (ApiFieldError | ResolvedFieldError)[] = [];
    setup({
      preset: laravelPreset(),
      onError: (errors) => { captured.push(...errors); },
    });

    // Request WITHOUT withFormBridge
    http.post('/api/save', {}).subscribe({
      error: () => { /* expected */ },
    });

    httpTesting.expectOne('/api/save').flush(
      {
        message: 'Validation failed.',
        errors: { email: ['The email field is required.'] },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(captured.length).toBe(1);
  });

  // -- Laravel preset via withFormBridge -----------------------------------

  it('should work with different presets on the bridge', () => {
    setup();

    const form = fb.group({ email: [''], password: [''] });
    const bridge = createFormBridge(form, { preset: laravelPreset() });

    http.post('/api/login', {}, withFormBridge(bridge)).subscribe({
      error: () => { /* expected */ },
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

  // -- Success responses pass through ------------------------------------

  it('should not interfere with successful responses', (done) => {
    setup();

    const form = fb.group({ email: [''] });
    const bridge = createFormBridge(form, { preset: classValidatorPreset() });

    http.post('/api/save', {}, withFormBridge(bridge)).subscribe({
      next: (data) => {
        expect(data).toEqual({ id: 1 });
        expect(bridge.hasErrorsSignal()).toBeFalse();
        done();
      },
    });

    httpTesting.expectOne('/api/save').flush({ id: 1 }, { status: 200, statusText: 'OK' });
  });
});
