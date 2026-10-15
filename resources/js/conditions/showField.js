/**
 * The public entry point for field conditions: should this field be shown?
 *
 * Replaces `Statamic.$conditions.showField`, which reached the page only
 * because `layout.antlers.html` loaded 98 KB of vendor bundle to supply it —
 * a bundle whose evaluator decided every comparison with `eval()`. Same
 * signature and same argument order as the vendor's, so the call site in
 * `showFieldMagic.js` is a one-word change.
 *
 * @see resources/js/conditions/validator.js     the evaluator itself
 * @see resources/js/conditions/showFieldMagic.js the Alpine magic that calls this
 * @see UAMS-Web/uams-statamic#1902  the decision to own the public field-conditions evaluator
 */

import { Validator } from './validator.js';

/**
 * @param {Record<string, unknown>} field the field config carrying `if`/`unless`/etc.
 * @param {Record<string, unknown>} values the form's current values
 * @param {string} currentFieldPath dotted path of the field being evaluated
 * @returns {boolean}
 * @throws {Error} when `currentFieldPath` is missing — nested handles cannot be resolved without it
 */
export function showField(field, values, currentFieldPath) {
	return new Validator(field, values, null, currentFieldPath).usingRootValues().passesConditions();
}
