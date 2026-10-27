/**
 * Front-end forms: expose Statamic's field-conditions evaluator to Alpine
 * attribute expressions as the `$showField` magic.
 *
 * WHY THIS EXISTS
 *
 * `@alpinejs/csp` evaluates `x-*` attributes with an AST interpreter instead of
 * `new Function()`, which is what lets a site drop `script-src 'unsafe-eval'`.
 * That interpreter resolves identifiers **only** from the Alpine scope stack,
 * and additionally refuses any value it finds in its `globalThis` snapshot. So
 * the expression Statamic's stock Alpine driver emits,
 *
 *     Statamic.$conditions.showField({…}, $data, '<handle>')
 *
 * throws `Undefined variable: Statamic` at the first gate and
 * `Accessing global variables is prohibited in the CSP build` at the second.
 * Every field on a public form is wrapped in `<template x-if="…">`, so the
 * observable failure is a form that renders its heading and Submit button with
 * no input fields at all.
 *
 * A magic moves the lookup out of the attribute and into module scope, where
 * reading a global is allowed. `UAMSWeb\AlpineCspForms\JsDrivers\AlpineCsp`
 * emits the matching call (same three arguments, same order, only the callee
 * changes):
 *
 *     $showField({…}, $data, '<handle>')
 *
 * WHERE THE EVALUATOR COMES FROM
 *
 * The magic forwards to `window.Statamic.$conditions.showField`, which
 * Statamic's front-end `helpers.js` defines. Until `statamic/cms` `v6.35.1`
 * that evaluator decided every comparison with `eval()`, so the add-on carried
 * its own copy; `statamic/cms#15564` removed the `eval()`, and the copy was
 * retired so the Control Panel and public pages evaluate conditions with the
 * same code (UAMS-Web/uams-statamic#1931). The host therefore loads
 * `helpers.js` ahead of this script.
 *
 * CUSTOM CONDITIONS
 *
 * `helpers.js` looks a `custom` condition up with `Statamic.$conditions.get()`,
 * but the front-end `$conditions` object defines only `showField()`; `get()`
 * and `add()` exist in the Control Panel alone. So where `get()` is missing the
 * magic supplies one that reads `window.StatamicCustomConditions`, the registry
 * a host writes its public-page custom conditions to. An unregistered name
 * then reaches `helpers.js`'s own "was not properly defined" error and hides
 * the field, as it does in the Control Panel.
 *
 * FAILURE MODE
 *
 * Every failure shows the field rather than hiding it. Failing open degrades
 * to a form that ignores its conditional logic; failing closed renders a form
 * with no inputs, a far worse outcome on a patient-facing site. A missing
 * `window.Statamic` is reported once, naming the script that defines it,
 * rather than on every field of every form.
 *
 * @see src/JsDrivers/AlpineCsp.php  the driver that emits the `$showField(…)` call
 * @see UAMS-Web/statamic-alpine-csp-forms#18  forwarding to Statamic's evaluator
 */

/** The script that defines `window.Statamic.$conditions`, named in the missing-global error. */
export const HELPERS_SCRIPT = '/vendor/statamic/frontend/js/helpers.js';

/**
 * Give Statamic's front-end evaluator a custom-condition lookup where it has none.
 *
 * Leaves an existing `get()` alone, so a page that also loads the Control
 * Panel's condition registry keeps it.
 *
 * @param {{ get?: unknown }} conditions  `window.Statamic.$conditions`
 */
function ensureCustomConditionLookup(conditions) {
	if (typeof conditions.get !== 'function') {
		conditions.get = (name) => window.StatamicCustomConditions?.[name];
	}
}

/**
 * Register the `$showField` magic on an Alpine instance.
 *
 * Must run before `Alpine.start()`: the initial DOM walk evaluates every
 * `x-if` wrapper, and an unregistered magic resolves as an undefined variable.
 *
 * @param {import('@alpinejs/csp').Alpine} Alpine
 */
export function registerShowFieldMagic(Alpine) {
	let reportedMissingEvaluator = false;

	Alpine.magic('showField', () => (conditions, data, currentFieldPath) => {
		// Read the global on every call, not at registration, so a host that
		// loads helpers.js after this script still works once it has loaded.
		const evaluator = window.Statamic?.$conditions;

		if (typeof evaluator?.showField !== 'function') {
			if (!reportedMissingEvaluator) {
				reportedMissingEvaluator = true;
				console.error(
					`Statamic's field-conditions evaluator is missing: load ${HELPERS_SCRIPT} (helpers.js) before the Alpine CSP Forms script. Showing every conditional field.`,
				);
			}

			return true;
		}

		try {
			ensureCustomConditionLookup(evaluator);

			return evaluator.showField(conditions, data, currentFieldPath);
		} catch (error) {
			// Fail open, see the FAILURE MODE note above.
			console.error('Field condition evaluation failed; showing the field.', error);

			return true;
		}
	});
}
