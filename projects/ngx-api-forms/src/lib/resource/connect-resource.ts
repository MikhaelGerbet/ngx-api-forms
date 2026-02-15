/**
 * Connects an Angular Resource's error signal to a FormBridge.
 *
 * When the error signal emits a truthy value, `bridge.applyApiErrors()` is called.
 * When it becomes falsy (resource reloads successfully), `bridge.clearApiErrors()` is called.
 *
 * Works with `resource()`, `rxResource()`, or any custom signal that carries
 * an error payload. Requires Angular 16+ (uses `effect()`).
 *
 * Must be called in an injection context (constructor, field initializer)
 * or with an explicit `Injector` via the `injector` option.
 */
import { effect, Injector, Signal, EffectRef } from '@angular/core';
import { FormBridge } from '../form-bridge/form-bridge';

/**
 * Options for `connectResource`.
 */
export interface ConnectResourceOptions {
  /**
   * An Angular Injector. Required when calling `connectResource` outside
   * of an injection context (e.g. inside a callback or ngOnInit).
   */
  injector?: Injector;
}

/**
 * Wire a signal-based resource's error output to a FormBridge.
 *
 * The effect automatically applies API errors when the signal is truthy
 * and clears them when it becomes falsy (e.g. on successful reload).
 *
 * @param bridge - The FormBridge instance to receive errors
 * @param errorSignal - A signal carrying the error payload (e.g. `myResource.error`)
 * @param options - Optional injector for use outside injection context
 * @returns The EffectRef, allowing manual cleanup if needed
 *
 * @example
 * ```typescript
 * // In a component (injection context)
 * private bridge = createFormBridge(this.form, { preset: djangoPreset() });
 * private userResource = rxResource({
 *   loader: () => this.http.post('/api/users', this.form.value),
 * });
 *
 * private ref = connectResource(this.bridge, this.userResource.error);
 * ```
 *
 * @example
 * ```typescript
 * // Outside injection context
 * ngOnInit() {
 *   connectResource(this.bridge, this.myResource.error, {
 *     injector: this.injector,
 *   });
 * }
 * ```
 */
export function connectResource(
  bridge: FormBridge,
  errorSignal: Signal<unknown>,
  options?: ConnectResourceOptions,
): EffectRef {
  return effect(() => {
    const error = errorSignal();
    if (error) {
      bridge.applyApiErrors(error);
    } else {
      bridge.clearApiErrors();
    }
  }, { injector: options?.injector });
}
