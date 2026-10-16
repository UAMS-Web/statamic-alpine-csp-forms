/**
 * Coverage for the field-conditions vocabulary (UAMS-Web/uams-statamic#3090). The lists must match
 * Statamic's own, which `tests/Feature/Forms/FieldConditionsConstantsParityTest.php`
 * checks against the vendor source; these cases pin the exported values and
 * that they cannot be changed at runtime.
 *
 * @see resources/js/conditions/constants.js
 */

import { describe, expect, it } from 'vitest';

import { ALIASES, KEYS, NUMBER_SPECIFIC_COMPARISONS, OPERATORS } from './constants.js';

describe('constants', () => {
	it('lists the condition keys in precedence order', () => {
		expect(KEYS).toEqual(['if', 'if_any', 'show_when', 'show_when_any', 'unless', 'unless_any', 'hide_when', 'hide_when_any']);
	});

	it('lists the operators', () => {
		expect(OPERATORS).toEqual(['equals', 'not', 'contains', 'contains_any', 'includes_any', '===', '!==', '>', '>=', '<', '<=', 'custom']);
	});

	it('maps each alias onto an operator', () => {
		expect(ALIASES).toEqual({ is: 'equals', '==': 'equals', isnt: 'not', '!=': 'not', includes: 'contains' });

		for (const operator of Object.values(ALIASES)) {
			expect(OPERATORS).toContain(operator);
		}
	});

	it('lists the numeric comparisons', () => {
		expect(NUMBER_SPECIFIC_COMPARISONS).toEqual(['>', '>=', '<', '<=']);
	});

	it('freezes every list', () => {
		for (const value of [KEYS, OPERATORS, ALIASES, NUMBER_SPECIFIC_COMPARISONS]) {
			expect(Object.isFrozen(value)).toBe(true);
		}
	});
});
