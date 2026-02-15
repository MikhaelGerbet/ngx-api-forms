import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { apiErrorInterceptor } from 'ngx-api-forms';
import { mockApiInterceptor } from './mock-api.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(
      withInterceptors([mockApiInterceptor, apiErrorInterceptor()])
    ),
  ]
};
