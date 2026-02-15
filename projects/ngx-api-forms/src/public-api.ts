/*
 * Public API Surface of ngx-api-forms
 */

// Models and types
export * from './lib/models/api-forms.models';

// Core
export { FormBridge, createFormBridge, provideFormBridge } from './lib/form-bridge/form-bridge';

// Presets (default only - others available via secondary entry points)
export { classValidatorPreset, CLASS_VALIDATOR_CONSTRAINT_MAP } from './lib/presets/class-validator.preset';

// Directives
export { NgxFormErrorDirective } from './lib/directives/form-error.directive';

// Interceptor
export {
  apiErrorInterceptor,
  withFormBridge,
  FORM_BRIDGE,
} from './lib/interceptor/api-error.interceptor';
export type { ApiErrorInterceptorConfig } from './lib/interceptor/api-error.interceptor';

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
