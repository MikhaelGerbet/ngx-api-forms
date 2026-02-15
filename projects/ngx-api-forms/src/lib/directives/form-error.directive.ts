/**
 * NgxFormError directive.
 *
 * Automatically displays the error message for a form control.
 * Works with both client-side validators and API errors set by FormBridge.
 *
 * @example
 * ```html
 * <input formControlName="email" />
 * <span ngxFormError="email" [form]="myForm"></span>
 * <!-- Displays: "email must be a valid email" -->
 *
 * <!-- With custom error map -->
 * <span ngxFormError="email"
 *       [form]="myForm"
 *       [errorMessages]="{ required: 'Email is required', email: 'Invalid email' }">
 * </span>
 * ```
 */
import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Renderer2,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormGroup, AbstractControl } from '@angular/forms';
import { Subscription, merge } from 'rxjs';

@Directive({
  selector: '[ngxFormError]',
  standalone: true,
})
export class NgxFormErrorDirective implements OnInit, OnChanges, OnDestroy {
  private readonly el = inject(ElementRef);
  private readonly renderer = inject(Renderer2);

  /** The form control name to observe */
  @Input('ngxFormError') controlName!: string;

  /** The parent FormGroup */
  @Input() form!: FormGroup;

  /**
   * Optional map of error keys to display messages.
   * If not provided, the raw error value is used (which is the API message
   * when set by FormBridge).
   */
  @Input() errorMessages?: Record<string, string>;

  /**
   * CSS class applied to the host element when an error is displayed.
   * Default: 'ngx-form-error-visible'
   */
  @Input() errorClass = 'ngx-form-error-visible';

  /**
   * Whether to show errors only when the control is touched.
   * Default: true
   */
  @Input() showOnTouched = true;

  private subscription: Subscription | null = null;

  ngOnInit(): void {
    this._subscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['form'] || changes['controlName']) && !changes['form']?.firstChange) {
      this._subscribe();
    }
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private _subscribe(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;

    const control = this.form?.get(this.controlName);
    if (!control) {
      this._hide();
      return;
    }

    this.subscription = merge(control.statusChanges, control.valueChanges).subscribe(() => {
      this._updateDisplay(control);
    });

    this._updateDisplay(control);
  }

  private _updateDisplay(control: AbstractControl): void {
    if (!control.errors || (this.showOnTouched && !control.touched && !control.dirty)) {
      this._hide();
      return;
    }

    const errorKeys = Object.keys(control.errors);
    if (errorKeys.length === 0) {
      this._hide();
      return;
    }

    const firstKey = errorKeys[0];
    const rawValue = control.errors[firstKey];
    let message: string;

    // Priority: custom errorMessages map > raw string value > error key
    if (this.errorMessages?.[firstKey]) {
      message = this.errorMessages[firstKey];
    } else if (typeof rawValue === 'string') {
      message = rawValue;
    } else {
      message = firstKey;
    }

    this._show(message);
  }

  private _show(message: string): void {
    const el = this.el.nativeElement;
    this.renderer.setProperty(el, 'textContent', message);
    this.renderer.addClass(el, this.errorClass);
    this.renderer.setStyle(el, 'display', '');
  }

  private _hide(): void {
    const el = this.el.nativeElement;
    this.renderer.setProperty(el, 'textContent', '');
    this.renderer.removeClass(el, this.errorClass);
    this.renderer.setStyle(el, 'display', 'none');
  }
}
