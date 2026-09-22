/**
 * Accessible first-invalid-field focus helper (Phase 10, WCAG 2.4.3).
 *
 * After a form submit fails client-side validation, moves keyboard/screen-reader
 * focus to the first field that failed so the user is brought directly to the
 * correction. Purely additive — it is an event-handler-time utility driven by
 * stable field DOM ids (never generated class names), so it has no effect on
 * SSR and never runs during ordinary typing.
 *
 * Forms that already render field-level errors via `aria-invalid` +
 * `aria-describedby`/`role=alert` keep that behavior; this only adds focus.
 */
export function focusFirstFieldError(
  fieldOrder: ReadonlyArray<string>,
  errors: Readonly<Record<string, string | undefined>>,
  idForField: (field: string) => string,
): void {
  for (const field of fieldOrder) {
    const message = errors[field];
    if (message && message.length > 0) {
      const element = document.getElementById(idForField(field));
      if (element && typeof element.focus === "function") {
        element.focus();
      }
      return;
    }
  }
}

/**
 * react-hook-form variant of `focusFirstFieldError`. RHF errors are typed
 * `FieldError` objects and inputs receive a stable `name` attribute via
 * `{...field}`. Used on the `handleSubmit(onValid, onInvalid)` error path so
 * focus moves to the first invalid field only after a failed submit — never
 * during ordinary typing.
 */
export function focusFirstFieldInForm(
  fieldOrder: ReadonlyArray<string>,
  errors: Readonly<Record<string, unknown>>,
): void {
  for (const field of fieldOrder) {
    if (errors[field]) {
      const node = document.querySelector<HTMLElement>(`[name="${field}"]`);
      if (node && typeof node.focus === "function") {
        node.focus();
      }
      return;
    }
  }
}
