// @vitest-environment jsdom

/**
 * Coverage for the owned field-conditions evaluator (#1956).
 *
 * Only two conditional fields exist on live forms today, both `'equals Yes'`,
 * so these tests — not production traffic — are the evidence for every other
 * operator, key and value shape. That is a residual the #1902 decision names
 * explicitly, and it is why this file covers the whole vocabulary rather than
 * the paths that happen to be exercised.
 *
 * The vendor comparison points are recorded where behavior deliberately
 * diverges, so a future reader can tell an intentional fix from a porting slip.
 *
 * @see resources/js/conditions/validator.js
 * @see tests/Feature/Forms/FieldConditionsConstantsParityTest.php
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { showField } from './showField.js';

/** Evaluate a single-field condition against a flat set of values. */
function show(conditions, values, path = 'target') {
	return showField(conditions, values, path);
}

afterEach(() => {
	delete window.StatamicCustomConditions;
	vi.restoreAllMocks();
});

describe('no conditions', () => {
	it('shows a field that declares none', () => {
		expect(show({}, { other: 'anything' })).toBe(true);
	});
});

describe('an empty group', () => {
	// `[]` and `{}` are truthy, so the key is chosen and its logic runs over no
	// conditions: ALL of none passes, ANY of none fails, then the key's inversion.
	// The notification gate reads it the same way (#2895), so these values are
	// shared with ConditionalLogicEvaluatorTest.
	const expected = {
		if: true,
		if_any: false,
		show_when: true,
		show_when_any: false,
		unless: false,
		unless_any: true,
		hide_when: false,
		hide_when_any: true,
	};

	for (const [key, result] of Object.entries(expected)) {
		it(`reads \`${key}\` with no conditions as ${result}`, () => {
			for (const group of [[], {}]) {
				for (const value of ['Yes', '', undefined]) {
					expect(show({ [key]: group }, { a: value })).toBe(result);
				}
			}
		});
	}
});

describe('condition keys', () => {
	it('shows when an `if` passes and hides when it fails', () => {
		expect(show({ if: { a: 'equals Yes' } }, { a: 'Yes' })).toBe(true);
		expect(show({ if: { a: 'equals Yes' } }, { a: 'No' })).toBe(false);
	});

	it('requires every condition under `if`', () => {
		const conditions = { if: { a: 'equals Yes', b: 'equals Yes' } };

		expect(show(conditions, { a: 'Yes', b: 'Yes' })).toBe(true);
		expect(show(conditions, { a: 'Yes', b: 'No' })).toBe(false);
	});

	it('requires only one condition under `if_any`', () => {
		const conditions = { if_any: { a: 'equals Yes', b: 'equals Yes' } };

		expect(show(conditions, { a: 'Yes', b: 'No' })).toBe(true);
		expect(show(conditions, { a: 'No', b: 'No' })).toBe(false);
	});

	it('inverts for `unless`', () => {
		expect(show({ unless: { a: 'equals Yes' } }, { a: 'Yes' })).toBe(false);
		expect(show({ unless: { a: 'equals Yes' } }, { a: 'No' })).toBe(true);
	});

	it('inverts for `hide_when`', () => {
		expect(show({ hide_when: { a: 'equals Yes' } }, { a: 'Yes' })).toBe(false);
		expect(show({ hide_when: { a: 'equals Yes' } }, { a: 'No' })).toBe(true);
	});

	it('treats `show_when` as a synonym for `if`', () => {
		expect(show({ show_when: { a: 'equals Yes' } }, { a: 'Yes' })).toBe(true);
		expect(show({ show_when: { a: 'equals Yes' } }, { a: 'No' })).toBe(false);
	});

	it('inverts and passes on any for `unless_any`', () => {
		const conditions = { unless_any: { a: 'equals Yes', b: 'equals Yes' } };

		// One passing condition means "hide", because the key inverts.
		expect(show(conditions, { a: 'Yes', b: 'No' })).toBe(false);
		expect(show(conditions, { a: 'No', b: 'No' })).toBe(true);
	});

	it('honors only the first key in KEYS order when a field carries two', () => {
		// `if` precedes `unless`, so the `unless` is ignored entirely rather
		// than combined. Pinning this stops a refactor from silently making
		// the two keys intersect.
		const conditions = { if: { a: 'equals Yes' }, unless: { a: 'equals Yes' } };

		expect(show(conditions, { a: 'Yes' })).toBe(true);
	});

	it('reads a list of conditions on one field as separate conditions', () => {
		// Upstream's own cases from statamic/cms#14593, which Statamic reads
		// from 6.31.0, so the Control Panel and the public page agree.
		const values = { status: 'published', audience: 'members', age: 22 };

		expect(show({ if_any: { status: ['is archived', 'is published'], audience: 'is guests' } }, values)).toBe(true);
		expect(show({ if_any: { status: ['is archived', 'is draft'], audience: 'is guests' } }, values)).toBe(false);
		expect(show({ if: { age: ['> 18', '< 65'], audience: 'is members' } }, values)).toBe(true);
		expect(show({ if: { age: ['> 18', '< 21'], audience: 'is members' } }, values)).toBe(false);
		expect(show({ unless_any: { status: ['is archived', 'is draft'], audience: 'is guests' } }, values)).toBe(true);
		expect(show({ hide_when_any: { status: ['is archived', 'is published'], audience: 'is guests' } }, values)).toBe(false);
	});
});

describe('operators', () => {
	it.each([
		['equals', 'Yes', 'Yes', true],
		['equals', 'Yes', 'No', false],
		['is', 'Yes', 'Yes', true],
		['not', 'Yes', 'No', true],
		['not', 'Yes', 'Yes', false],
		['isnt', 'Yes', 'No', true],
	])('applies `%s %s` against %j', (operator, rhs, stored, expected) => {
		expect(show({ if: { a: `${operator} ${rhs}` } }, { a: stored })).toBe(expected);
	});

	it.each([
		['>', '18', 21, true],
		['>', '18', 18, false],
		['>=', '18', 18, true],
		['<', '18', 17, true],
		['<=', '18', 18, true],
		['<=', '18', 19, false],
	])('applies `%s %s` against %j', (operator, rhs, stored, expected) => {
		expect(show({ if: { a: `${operator} ${rhs}` } }, { a: stored })).toBe(expected);
	});

	it('coerces a numeric string to a number for the ordering operators', () => {
		// The stored value arrives from an <input> as a string; `'9' > '18'`
		// would be true under string comparison.
		expect(show({ if: { a: '> 18' } }, { a: '9' })).toBe(false);
		expect(show({ if: { a: '> 18' } }, { a: '21' })).toBe(true);
	});

	it('applies `===` and `!==` without coercing', () => {
		expect(show({ if: { a: '=== Yes' } }, { a: 'Yes' })).toBe(true);
		expect(show({ if: { a: '=== Yes' } }, { a: 'No' })).toBe(false);
	});

	it('never matches `===` against a number, because a blueprint value is a string', () => {
		// Surprising but correct, and the vendor agrees: the right-hand side is
		// parsed out of the condition string, so it is always `'1'` and never
		// `1`. `===` is therefore only useful against string-valued fields —
		// worth pinning so nobody "fixes" it into a loose comparison.
		expect(show({ if: { a: '=== 1' } }, { a: 1 })).toBe(false);
		expect(show({ if: { a: '=== 1' } }, { a: '1' })).toBe(true);
		expect(show({ if: { a: '!== 1' } }, { a: 1 })).toBe(true);
	});

	it('applies `contains` to a string', () => {
		expect(show({ if: { a: 'contains phys' } }, { a: 'physician' })).toBe(true);
		expect(show({ if: { a: 'contains phys' } }, { a: 'self' })).toBe(false);
	});

	it('applies `contains` to an array', () => {
		expect(show({ if: { a: 'contains self' } }, { a: ['self', 'physician'] })).toBe(true);
		expect(show({ if: { a: 'contains other' } }, { a: ['self', 'physician'] })).toBe(false);
	});

	it('applies `contains_any` to an array', () => {
		expect(show({ if: { a: 'contains_any self,other' } }, { a: ['physician', 'self'] })).toBe(true);
		expect(show({ if: { a: 'contains_any x,y' } }, { a: ['physician', 'self'] })).toBe(false);
	});

	it('applies `contains_any` to a string', () => {
		expect(show({ if: { a: 'contains_any self,phys' } }, { a: 'physician' })).toBe(true);
		// Needles chosen to appear nowhere in the haystack. An obvious-looking
		// `y` would have matched, since it sits in the middle of the word.
		expect(show({ if: { a: 'contains_any q,w' } }, { a: 'physician' })).toBe(false);
	});

	it('treats a `contains_any` needle as a literal, not a pattern', () => {
		// Formerly a deliberate divergence: the vendor built
		// `new RegExp(needles.join('|'))` with the needles unescaped, so `a.b`
		// matched `axb`. statamic/cms#15531 made it literal in 6.35.0.
		expect(show({ if: { a: 'contains_any a.b' } }, { a: 'axb' })).toBe(false);
		expect(show({ if: { a: 'contains_any a.b' } }, { a: 'a.b' })).toBe(true);
	});

	it('declines a `contains_any` condition against an object', () => {
		// DELIBERATE DIVERGENCE. The vendor stringifies the object and searches
		// `[object Object]`, so the needle `object` would match a date range.
		expect(show({ if: { a: 'contains_any object' } }, { a: { start: '2026-01-01' } })).toBe(false);
	});

	it('reads a bare value as an equality test', () => {
		expect(show({ if: { a: 'Yes' } }, { a: 'Yes' })).toBe(true);
		expect(show({ if: { a: 'Yes' } }, { a: 'No' })).toBe(false);
	});

	it('keeps `contains_any` from being claimed by the `contains` it starts with', () => {
		// The Converter takes the LAST matching operator; if that order broke,
		// the value would parse as the literal `_any self,other`.
		expect(show({ if: { a: 'contains_any self,other' } }, { a: ['self'] })).toBe(true);
	});

	it('applies `includes_any` as membership and `contains_any` as a substring test', () => {
		// Upstream's cases from statamic/cms#13135, which made the two distinct
		// in 6.35.0. Against a string, `includes_any` asks whether the value is
		// one of the list; `contains_any` whether it contains one of them.
		const values = {
			cancellation_reasons: ['found another service', 'other'],
			example_string: 'The quick brown fox jumps over the lazy dog',
			age: 13,
			empty_string: '',
			null_value: null,
		};
		const passes = (handle, rhs) => show({ if: { [handle]: rhs } }, values);

		expect(passes('cancellation_reasons', 'includes_any sick, other')).toBe(true);
		expect(passes('cancellation_reasons', 'includes_any sick, found another')).toBe(false);
		expect(passes('cancellation_reasons', 'contains_any sick, other')).toBe(true);
		expect(passes('cancellation_reasons', 'contains_any sick, expensive')).toBe(false);

		expect(passes('example_string', 'includes_any parrot, The quick brown fox jumps over the lazy dog')).toBe(true);
		expect(passes('example_string', 'includes_any parrot, hops')).toBe(false);
		expect(passes('example_string', 'includes_any parrot, lazy dog')).toBe(false);
		expect(passes('example_string', 'contains_any parrot, lazy dog')).toBe(true);
		expect(passes('example_string', 'contains_any parrot, hops')).toBe(false);

		expect(passes('age', 'includes_any fox, 13')).toBe(true);
		expect(passes('age', 'contains_any fox, 13')).toBe(true);
		expect(passes('age', 'includes_any fox, 14')).toBe(false);
		expect(passes('age', 'contains_any fox, 14')).toBe(false);

		expect(passes('empty_string', 'contains_any fox, 13')).toBe(false);
		expect(passes('null_value', 'contains_any fox, 13')).toBe(false);
	});
});

describe('value shapes', () => {
	it('compares against a real null', () => {
		expect(show({ if: { a: 'equals null' } }, { a: null })).toBe(true);
	});

	it('compares against real booleans', () => {
		expect(show({ if: { a: 'equals true' } }, { a: true })).toBe(true);
		expect(show({ if: { a: 'equals false' } }, { a: false })).toBe(true);
		expect(show({ if: { a: 'equals true' } }, { a: false })).toBe(false);
	});

	it('treats a missing, null or blank value as `empty`', () => {
		expect(show({ if: { a: 'empty' } }, {})).toBe(true);
		expect(show({ if: { a: 'empty' } }, { a: null })).toBe(true);
		expect(show({ if: { a: 'empty' } }, { a: '' })).toBe(true);
		expect(show({ if: { a: 'empty' } }, { a: '   ' })).toBe(true);
		expect(show({ if: { a: 'empty' } }, { a: [] })).toBe(true);
	});

	it('does not treat a populated value as `empty`', () => {
		expect(show({ if: { a: 'empty' } }, { a: 'Yes' })).toBe(false);
		expect(show({ if: { a: 'empty' } }, { a: ['x'] })).toBe(false);
	});

	it('does not treat a number or a boolean as `empty`', () => {
		// Formerly a deliberate divergence: the vendor's isEmpty was
		// `Object.keys(value).length === 0`, and `Object.keys(5)` is `[]`, so
		// it reported every number and boolean as empty. statamic/cms#15257
		// fixed numbers in 6.30.0 and #15529 booleans in 6.35.0.
		expect(show({ if: { a: 'empty' } }, { a: 5 })).toBe(false);
		expect(show({ if: { a: 'empty' } }, { a: 0 })).toBe(false);
		expect(show({ if: { a: 'empty' } }, { a: true })).toBe(false);
		expect(show({ if: { a: 'empty' } }, { a: false })).toBe(false);
	});

	it('trims a stored string before comparing', () => {
		expect(show({ if: { a: 'equals Yes' } }, { a: '  Yes  ' })).toBe(true);
	});

	it('declines a scalar comparison against a structure', () => {
		expect(show({ if: { a: 'equals Yes' } }, { a: { nested: 'Yes' } })).toBe(false);
	});
});

describe('the operand-coercion trap', () => {
	it('compares a numeric value against a string right-hand side loosely', () => {
		// The regression this file exists to prevent. The vendor hands `eval`
		// JSON-stringified operands and lets it re-parse them; swapping in a
		// comparator while keeping the stringification compares 5 against the
		// four characters `"5"` and flips this to false.
		expect(show({ if: { a: 'equals 5' } }, { a: 5 })).toBe(true);
		expect(show({ if: { a: 'equals 5' } }, { a: '5' })).toBe(true);
	});

	it('does not throw on an undefined left-hand side', () => {
		// Routing both operands through JSON.parse instead would throw a
		// SyntaxError here, where the vendor returned false.
		expect(() => show({ if: { missing: 'equals Yes' } }, {})).not.toThrow();
		expect(show({ if: { missing: 'equals Yes' } }, {})).toBe(false);
	});
});

describe('nested field paths', () => {
	it('reads a sibling within the same set', () => {
		const values = { set: { a: 'Yes', target: '' } };

		expect(show({ if: { a: 'equals Yes' } }, values, 'set.target')).toBe(true);
		expect(show({ if: { a: 'equals No' } }, values, 'set.target')).toBe(false);
	});

	it('reads an absolute handle through `$root.`', () => {
		const values = { top: 'Yes', set: { target: '' } };

		expect(show({ if: { '$root.top': 'equals Yes' } }, values, 'set.target')).toBe(true);
	});

	it('reads one level up through `$parent.`', () => {
		const values = { set: { a: 'Yes', inner: { target: '' } } };

		expect(show({ if: { '$parent.a': 'equals Yes' } }, values, 'set.inner.target')).toBe(true);
		expect(show({ if: { '$parent.a': 'equals No' } }, values, 'set.inner.target')).toBe(false);
	});

	it('requires a field path, because a nested handle cannot resolve without one', () => {
		expect(() => showField({ if: { a: 'equals Yes' } }, { a: 'Yes' }, null)).toThrow(
			/currentFieldPath/,
		);
	});
});

describe('custom conditions', () => {
	it('dispatches to a registered function and passes the target', () => {
		const spy = vi.fn(() => true);
		window.StatamicCustomConditions = { myCheck: spy };

		expect(show({ if: { a: 'custom myCheck' } }, { a: 'Yes' })).toBe(true);
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0][0]).toMatchObject({ target: 'Yes', targetHandle: 'a', params: [] });
	});

	it('parses colon-delimited params, trimming each', () => {
		const spy = vi.fn(() => true);
		window.StatamicCustomConditions = { myCheck: spy };

		show({ if: { a: 'custom myCheck:one, two' } }, { a: 'Yes' });

		expect(spy.mock.calls[0][0].params).toEqual(['one', 'two']);
	});

	it('supports a bare string condition with no target field', () => {
		const spy = vi.fn(() => true);
		window.StatamicCustomConditions = { myCheck: spy };

		expect(show({ if: 'custom myCheck' }, { a: 'Yes' })).toBe(true);
		expect(spy.mock.calls[0][0]).toMatchObject({ target: null });
	});

	it('hides the field and logs when the function was never registered', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(show({ if: { a: 'custom missingFn' } }, { a: 'Yes' })).toBe(false);
		expect(error).toHaveBeenCalledTimes(1);
	});

	it('inverts a custom condition under `unless` exactly once', () => {
		// Formerly a deliberate divergence: the vendor inverted inside
		// `passesCustomCondition` AND again in `passesConditions`, so this
		// double-negated back to "show". statamic/cms#15533 fixed it in
		// 6.35.0.
		window.StatamicCustomConditions = { myCheck: () => true };

		expect(show({ unless: { a: 'custom myCheck' } }, { a: 'Yes' })).toBe(false);
	});

	it('inverts a bare-string custom condition under `unless` exactly once', () => {
		// The other arm of the same fix: this path must still invert, since it
		// skips the all/any machinery the per-condition path returns through.
		window.StatamicCustomConditions = { myCheck: () => true };

		expect(show({ unless: 'custom myCheck' }, { a: 'Yes' })).toBe(false);
		expect(show({ if: 'custom myCheck' }, { a: 'Yes' })).toBe(true);
	});

	it('coerces a truthy non-boolean return to a boolean', () => {
		window.StatamicCustomConditions = { myCheck: () => 'truthy' };

		expect(show({ if: { a: 'custom myCheck' } }, { a: 'Yes' })).toBe(true);
	});

	it('resolves without any Statamic global present', () => {
		// The point of the whole ticket: the public path no longer depends on
		// the vendor bundle having defined `window.Statamic`.
		expect(window.Statamic).toBeUndefined();

		window.StatamicCustomConditions = { myCheck: () => true };

		expect(show({ if: { a: 'custom myCheck' } }, { a: 'Yes' })).toBe(true);
	});
});
