// Node.js test for ng-add schematic (injectInterceptor)
// Run: node --test projects/ngx-api-forms/schematics/ng-add/index.spec.js

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { injectInterceptor } = require('./index');

describe('injectInterceptor', () => {
  it('should add interceptor to existing withInterceptors array', () => {
    const input = [
      "import { provideHttpClient, withInterceptors } from '@angular/common/http';",
      '',
      'export const appConfig = {',
      '  providers: [',
      '    provideHttpClient(withInterceptors([myInterceptor]))',
      '  ]',
      '};',
    ].join('\n');

    const result = injectInterceptor(input);
    assert.ok(result.includes('apiErrorInterceptor()'));
    assert.ok(result.includes('myInterceptor, apiErrorInterceptor()'));
  });

  it('should add withInterceptors to bare provideHttpClient()', () => {
    const input = [
      "import { provideHttpClient } from '@angular/common/http';",
      '',
      'export const appConfig = {',
      '  providers: [',
      '    provideHttpClient()',
      '  ]',
      '};',
    ].join('\n');

    const result = injectInterceptor(input);
    assert.ok(result.includes('withInterceptors([apiErrorInterceptor()])'));
    assert.ok(result.includes('provideHttpClient(withInterceptors'));
  });

  it('should add provideHttpClient when only providers array exists', () => {
    const input = [
      "import { ApplicationConfig } from '@angular/core';",
      '',
      'export const appConfig: ApplicationConfig = {',
      '  providers: [',
      '    provideZonelessChangeDetection(),',
      '  ]',
      '};',
    ].join('\n');

    const result = injectInterceptor(input);
    assert.ok(result.includes('provideHttpClient(withInterceptors([apiErrorInterceptor()]))'));
    assert.ok(result.includes("import { apiErrorInterceptor } from 'ngx-api-forms'"));
  });

  it('should not modify if apiErrorInterceptor already present', () => {
    const input = [
      "import { apiErrorInterceptor } from 'ngx-api-forms';",
      "import { provideHttpClient, withInterceptors } from '@angular/common/http';",
      '',
      'export const appConfig = {',
      '  providers: [',
      '    provideHttpClient(withInterceptors([apiErrorInterceptor()]))',
      '  ]',
      '};',
    ].join('\n');

    const result = injectInterceptor(input);
    assert.equal(result, input);
  });

  it('should add to existing ngx-api-forms import', () => {
    const input = [
      "import { provideFormBridge } from 'ngx-api-forms';",
      "import { provideHttpClient, withInterceptors } from '@angular/common/http';",
      '',
      'export const appConfig = {',
      '  providers: [',
      '    provideHttpClient(withInterceptors([]))',
      '  ]',
      '};',
    ].join('\n');

    const result = injectInterceptor(input);
    assert.ok(result.includes('provideFormBridge, apiErrorInterceptor'));
    assert.ok(result.includes('apiErrorInterceptor()'));
  });

  it('should handle provideHttpClient with existing args', () => {
    const input = [
      "import { provideHttpClient, withFetch } from '@angular/common/http';",
      '',
      'export const appConfig = {',
      '  providers: [',
      '    provideHttpClient(withFetch())',
      '  ]',
      '};',
    ].join('\n');

    const result = injectInterceptor(input);
    assert.ok(result.includes('provideHttpClient(withFetch(), withInterceptors([apiErrorInterceptor()]))'));
  });

  it('should add HTTP imports when missing', () => {
    const input = [
      "import { ApplicationConfig } from '@angular/core';",
      '',
      'export const appConfig: ApplicationConfig = {',
      '  providers: [',
      '    provideZonelessChangeDetection(),',
      '  ]',
      '};',
    ].join('\n');

    const result = injectInterceptor(input);
    assert.ok(result.includes("import { provideHttpClient, withInterceptors } from '@angular/common/http'"));
  });
});
