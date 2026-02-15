/*
 * Public API Surface of ngx-api-forms
 */

// Models and types
export * from './lib/models/api-forms.models';

// Core
export { FormBridge, createFormBridge, provideFormBridge } from './lib/form-bridge/form-bridge';

// Presets
export {
  classValidatorPreset,
  CLASS_VALIDATOR_CONSTRAINT_MAP,
} from './lib/presets/class-validator.preset';
export {
  laravelPreset,
  LARAVEL_CONSTRAINT_MAP,
} from './lib/presets/laravel.preset';
export {
  djangoPreset,
  DJANGO_CONSTRAINT_MAP,
} from './lib/presets/django.preset';
export {
  zodPreset,
  ZOD_CONSTRAINT_MAP,
} from './lib/presets/zod.preset';

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
