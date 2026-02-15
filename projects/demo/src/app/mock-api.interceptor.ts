import { HttpInterceptorFn, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { delay, Observable, of, throwError } from 'rxjs';

/**
 * Mock API interceptor for the demo page.
 * Intercepts POST requests to /mock-api/* and returns simulated responses
 * that mimic real backend validation errors.
 */
export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/mock-api/')) return next(req);

  const endpoint = req.url.replace('/mock-api/', '');
  const body = req.body as Record<string, unknown> | null;

  switch (endpoint) {
    case 'register': {
      const errors: Record<string, string[]> = {};
      if (!body?.['email'] || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body['email'] as string)) {
        errors['email'] = ['This field is required.', 'Enter a valid email address.'];
      }
      if (!body?.['username'] || (body['username'] as string).length < 4) {
        errors['username'] = ['Ensure this field has at least 4 characters.'];
      }
      if (!body?.['password'] || (body['password'] as string).length < 8) {
        errors['password'] = ['Ensure this field has at least 8 characters.'];
      }
      if (body?.['email'] === 'taken@example.com') {
        errors['email'] = ['A user with that email already exists.'];
        errors['non_field_errors'] = ['Unable to create account with provided details.'];
      }

      if (Object.keys(errors).length > 0) {
        return delayedError(422, errors);
      }
      return delayedSuccess({ id: 1, email: body?.['email'], username: body?.['username'] });
    }

    default:
      return next(req);
  }
};

function delayedError(status: number, body: unknown): Observable<never> {
  return new Observable(subscriber => {
    const timer = setTimeout(() => {
      subscriber.error(new HttpErrorResponse({
        status,
        statusText: 'Unprocessable Entity',
        error: body,
        url: '/mock-api/',
      }));
    }, 800);
    return () => clearTimeout(timer);
  });
}

function delayedSuccess<T>(body: T): Observable<HttpResponse<T>> {
  return of(new HttpResponse({ status: 200, body })).pipe(delay(800));
}
