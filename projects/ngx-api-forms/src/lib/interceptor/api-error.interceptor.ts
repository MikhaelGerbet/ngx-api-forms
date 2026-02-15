/**
 * Angular HttpInterceptorFn that automatically applies API validation errors
 * to a FormBridge instance attached via HttpContext.
 *
 * Two usage patterns:
 * 1. Per-request: tag individual requests with `withFormBridge(bridge)` --
 *    the interceptor catches 422/400 and calls `bridge.applyApiErrors()`.
 * 2. Global: provide a custom `onError` callback in the interceptor config
 *    to centralize error handling (e.g. dispatch to a store or service).
 */
import {
  HttpContext,
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { FormBridge } from '../form-bridge/form-bridge';
import { ApiFieldError, ErrorPreset, ResolvedFieldError } from '../models/api-forms.models';
import { classValidatorPreset } from '../presets/class-validator.preset';
import { parseApiErrors } from '../utils/form-utils';

/**
 * HttpContext token that carries a FormBridge reference on a request.
 * Used by `withFormBridge()` to tag requests for automatic error handling.
 */
export const FORM_BRIDGE = new HttpContextToken<FormBridge | null>(() => null);

/**
 * Configuration for `apiErrorInterceptor`.
 */
export interface ApiErrorInterceptorConfig {
  /**
   * Preset(s) used for standalone parsing when no FormBridge is attached
   * but `onError` is provided. Ignored when a FormBridge is attached
   * (the bridge uses its own presets).
   * Defaults to `classValidatorPreset()`.
   */
  preset?: ErrorPreset | ErrorPreset[];

  /**
   * HTTP status codes that trigger error handling.
   * Defaults to `[422, 400]`.
   */
  statusCodes?: number[];

  /**
   * Global callback invoked for every matching error response,
   * whether or not a FormBridge is attached.
   * Receives the parsed field errors and the raw HttpErrorResponse.
   * When a FormBridge is attached, receives ResolvedFieldError[];
   * otherwise receives ApiFieldError[] from standalone parsing.
   */
  onError?: (errors: (ApiFieldError | ResolvedFieldError)[], response: HttpErrorResponse) => void;
}

/**
 * Create an Angular functional HTTP interceptor that handles API validation errors.
 *
 * When a response matches one of the configured status codes (default: 422, 400):
 * - If the request was tagged with `withFormBridge(bridge)`, errors are automatically
 *   applied to that bridge. Zero code needed in `subscribe()`.
 * - If an `onError` callback is provided, it is called with the parsed errors for
 *   global handling (store, toast, logging, etc.).
 * - The error is always re-thrown so downstream `catchError` or `error` callbacks
 *   still fire when needed.
 *
 * @example
 * ```typescript
 * // app.config.ts
 * import { provideHttpClient, withInterceptors } from '@angular/common/http';
 * import { apiErrorInterceptor } from 'ngx-api-forms';
 *
 * export const appConfig = {
 *   providers: [
 *     provideHttpClient(
 *       withInterceptors([apiErrorInterceptor()])
 *     ),
 *   ],
 * };
 *
 * // component.ts -- zero error handling code
 * this.http.post('/api/save', data, withFormBridge(this.bridge)).subscribe({
 *   next: () => this.router.navigate(['/done']),
 * });
 * ```
 */
export function apiErrorInterceptor(config?: ApiErrorInterceptorConfig): HttpInterceptorFn {
  const statusCodes = config?.statusCodes ?? [422, 400];
  const fallbackPreset = config?.preset ?? classValidatorPreset();

  return (req, next) => {
    return next(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (statusCodes.includes(error.status)) {
          const bridge = req.context.get(FORM_BRIDGE);

          if (bridge) {
            bridge.applyApiErrors(error.error);
          }

          if (config?.onError) {
            const parsed = bridge
              ? bridge.errorsSignal()
              : parseApiErrors(error.error, fallbackPreset);
            config.onError(parsed, error);
          }
        }

        return throwError(() => error);
      }),
    );
  };
}

/**
 * Attach a FormBridge to an HTTP request via HttpContext.
 *
 * When used with `apiErrorInterceptor`, the interceptor automatically calls
 * `bridge.applyApiErrors()` on 422/400 responses. No error handling needed
 * in `subscribe()`.
 *
 * @param bridge - The FormBridge instance to receive API errors
 * @returns An options object to spread into HttpClient methods
 *
 * @example
 * ```typescript
 * // Errors are applied automatically -- no subscribe error handler needed
 * this.http.post('/api/save', data, withFormBridge(this.bridge)).subscribe();
 *
 * // Works with all HttpClient methods
 * this.http.put('/api/users/1', data, withFormBridge(this.bridge)).subscribe();
 * ```
 */
export function withFormBridge(bridge: FormBridge): { context: HttpContext } {
  return {
    context: new HttpContext().set(FORM_BRIDGE, bridge),
  };
}
