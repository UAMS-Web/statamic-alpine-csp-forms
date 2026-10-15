// @vitest-environment jsdom

/**
 * Coverage for the public entry point of the field-conditions evaluator
 * (UAMS-Web/uams-statamic#3090). `validator.test.js` covers the whole vocabulary through this
 * function; these cases pin its own contract.
 *
 * @see resources/js/conditions/showField.js
 */

import { describe, expect, it } from 'vitest';

import { showField } from './showField.js';

describe('showField', () => {
	it('shows a field whose condition passes and hides one whose condition fails', () => {
		expect(showField({ if: { referral: 'equals Yes' } }, { referral: 'Yes' }, 'target')).toBe(true);
		expect(showField({ if: { referral: 'equals Yes' } }, { referral: 'No' }, 'target')).toBe(false);
	});

	it('reads the values as root values, so a $root. handle resolves', () => {
		expect(showField({ if: { '$root.referral': 'equals Yes' } }, { referral: 'Yes' }, 'target')).toBe(true);
	});

	it('shows a field with no conditions', () => {
		expect(showField({}, {}, 'target')).toBe(true);
	});
});
