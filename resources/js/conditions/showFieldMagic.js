/**
 * Front-end forms: expose the field-conditions evaluator to Alpine attribute
 * expressions as the `$showField` magic.
 *
 * WHY THIS EXISTS
 *
 * `@alpinejs/csp` evaluates `x-*` attributes with an AST interpreter instead of
 * `new Function()`, which is what lets the site drop `script-src 'unsafe-eval'`
 * (#1859). That interpreter resolves identifiers **only** from the Alpine scope
 * stack, and additionally refuses any value it finds in its `globalThis`
 * snapshot. So the expression Statamic's stock Alpine driver emits —
 *
 *     Statamic.$conditions.showField({…}, $data, '<handle>')
 *
 * — throws `Undefined variable: Statamic` at the first gate and
 * `Accessing global variables is prohibited in the CSP build` at the second.
 * Every field on a public form is wrapped in `<template x-if="…">`, so the
 * observable failure is a form that renders its heading and Submit button with
 * no input fields at all.
 *
 * A magic moves the lookup out of the attribute and into module scope, where
 * ordinary imports are allowed. `UAMSWeb\AlpineCspForms\JsDrivers\AlpineCsp` emits the
 * matching call — same three arguments, same order, only the callee changes:
 *
 *     $showField({…}, $data, '<handle>')
 *
 * WHAT CHANGED IN #1956
 *
 * This used to forward to `window.Statamic.$conditions.showField`, supplied by
 * a 98 KB vendor bundle that `layout.antlers.html` loaded on every public page
 * — and whose evaluator decided every comparison with `eval()`, the last
 * `'unsafe-eval'` consumer on the front end. The evaluator is now ours, so the
 * forward is a direct import and no `Statamic` global is involved. That is what
 * allowed the script tag to be removed.
 *
 * FAILURE MODE
 *
 * An unexpected throw returns `true` (show the field) rather than propagating.
 * Failing open degrades to a form that ignores its conditional logic; failing
 * closed renders a form with no inputs — the exact symptom
 * `fields.antlers.html`'s troubleshooting note describes, and a far worse
 * outcome on a patient-facing site. The only throw the evaluator raises by
 * design is a missing `currentFieldPath`, which is a template defect rather
 * than anything a visitor can cause.
 *
 * @see resources/js/conditions/showField.js  the evaluator entry point
 * @see src/JsDrivers/AlpineCsp.php     the driver that emits the `$showField(…)` call
 * @see UAMS-Web/uams-statamic#1902  the decision to own the public field-conditions evaluator
 */

import { showField } from './showField.js';

/**
 * Register the `$showField` magic on an Alpine instance.
 *
 * Must run before `Alpine.start()`: the initial DOM walk evaluates every
 * `x-if` wrapper, and an unregistered magic resolves as an undefined variable.
 *
 * @param {import('@alpinejs/csp').Alpine} Alpine
 */
export function registerShowFieldMagic(Alpine) {
	Alpine.magic('showField', () => (conditions, data, currentFieldPath) => {
		try {
			return showField(conditions, data, currentFieldPath);
		} catch (error) {
			// Fail open — see the FAILURE MODE note above.
			console.error('Field condition evaluation failed; showing the field.', error);

			return true;
		}
	});
}
