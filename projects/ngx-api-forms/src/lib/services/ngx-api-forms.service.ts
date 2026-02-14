/**
 * NgxApiFormsService — Injectable Angular service.
 *
 * Provides a factory for creating FormBridge instances.
 * Use this in components that need DI integration.
 *
 * For simpler use cases, prefer the `createFormBridge()` function directly.
 */
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';

import { FormBridgeConfig } from '../models/api-forms.models';
import { FormBridge } from '../form-bridge/form-bridge';

/**
 * Injectable service for creating FormBridge instances.
 *
 * @example
 * ```typescript
 * @Component({ ... })
 * export class MyComponent {
 *   private apiFormsService = inject(NgxApiFormsService);
 *   private form = inject(FormBuilder).group({ ... });
 *
 *   private bridge = this.apiFormsService.create(this.form, {
 *     preset: classValidatorPreset(),
 *   });
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class NgxApiFormsService {
  /**
   * Create a new FormBridge for the given form.
   * Each call creates an isolated instance (no shared state).
   */
  create(form: FormGroup, config?: FormBridgeConfig): FormBridge {
    return new FormBridge(form, config);
  }
}
