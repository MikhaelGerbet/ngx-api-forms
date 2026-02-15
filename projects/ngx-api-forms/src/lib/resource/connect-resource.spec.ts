import { TestBed } from '@angular/core/testing';
import { signal, Injector, provideZonelessChangeDetection } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { createFormBridge } from '../form-bridge/form-bridge';
import { classValidatorPreset } from '../presets/class-validator.preset';
import { connectResource } from './connect-resource';

describe('connectResource', () => {
  let injector: Injector;
  const fb = new FormBuilder();

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    injector = TestBed.inject(Injector);
  });

  it('should apply errors when errorSignal becomes truthy', () => {
    const form = fb.group({ email: ['', Validators.required], name: [''] });
    const bridge = createFormBridge(form, { preset: classValidatorPreset() });
    const errorSignal = signal<unknown>(undefined);

    connectResource(bridge, errorSignal, { injector });

    errorSignal.set({
      statusCode: 400,
      message: [
        { property: 'email', constraints: { isEmail: 'email must be valid' } },
      ],
    });

    TestBed.flushEffects();

    expect(bridge.errorsSignal().length).toBe(1);
    expect(form.controls['email'].hasError('email')).toBeTrue();
  });

  it('should clear errors when errorSignal becomes falsy', () => {
    const form = fb.group({ email: ['', Validators.required], name: [''] });
    const bridge = createFormBridge(form, { preset: classValidatorPreset() });
    const errorSignal = signal<unknown>(undefined);

    connectResource(bridge, errorSignal, { injector });

    // First apply errors
    errorSignal.set({
      statusCode: 400,
      message: [
        { property: 'email', constraints: { isEmail: 'bad' } },
      ],
    });
    TestBed.flushEffects();
    expect(bridge.errorsSignal().length).toBe(1);

    // Clear on success
    errorSignal.set(undefined);
    TestBed.flushEffects();
    expect(bridge.errorsSignal().length).toBe(0);
  });

  it('should return an EffectRef', () => {
    const form = fb.group({ email: [''] });
    const bridge = createFormBridge(form, { preset: classValidatorPreset() });
    const errorSignal = signal<unknown>(undefined);

    const ref = connectResource(bridge, errorSignal, { injector });
    expect(ref).toBeTruthy();
  });

  it('should route global errors through the bridge', () => {
    const form = fb.group({ email: ['', Validators.required], name: [''] });
    const bridge = createFormBridge(form, { preset: classValidatorPreset() });
    const errorSignal = signal<unknown>(undefined);

    connectResource(bridge, errorSignal, { injector });

    errorSignal.set({
      statusCode: 400,
      message: [
        { property: 'unknownField', constraints: { isNotEmpty: 'required' } },
      ],
    });

    TestBed.flushEffects();

    // Unmatched field should end up in globalErrorsSignal
    expect(bridge.globalErrorsSignal().length).toBe(1);
    expect(bridge.globalErrorsSignal()[0].originalField).toBe('unknownField');
  });
});
