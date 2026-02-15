/*
 * Public API Surface of ngx-api-forms
 */

// Models and types
export * from './lib/models/api-forms.models';

// Core
export { FormBridge, createFormBridge, provideFormBridge } from './lib/form-bridge/form-bridge';

// Presets
export { classValidatorPreset } from './lib/presets/class-validator.preset';
export { laravelPreset } from './lib/presets/laravel.preset';
export { djangoPreset } from './lib/presets/django.preset';
export { zodPreset } from './lib/presets/zod.preset';

// Directives
export { NgxFormErrorDirective } from './lib/directives/form-error.directive';

// Utility functions (tree-shakeable)
export {
  parseApiErrors,
  wrapSubmit,
  toFormData,
  enableForm,
  disableForm,
  clearFormErrors,
  getDirtyValues,
  hasError,
  getErrorMessage,
} from './lib/utils/form-utils';
