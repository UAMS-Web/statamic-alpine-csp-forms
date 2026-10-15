/**
 * Coverage for the converter that splits a blueprint's condition map into
 * structured conditions (UAMS-Web/uams-statamic#3090). The evaluator's own tests reach it only
 * through `showField`; these pin its output shape directly.
 *
 * @see resources/js/conditions/converter.js
 */

import { describe, expect, it } from 'vitest';

import { Converter } from './converter.js';

describe('fromBlueprint', () => {
	it('splits each handle into field, operator and value, applying the prefix', () => {
		expect(new Converter().fromBlueprint({ referral: 'contains_any self,physician', age: '>= 18', nickname: 'Rene' }, 'pre.')).toEqual([
			{ field: 'pre.referral', operator: 'contains_any', value: 'self,physician' },
			{ field: 'pre.age', operator: '>=', value: '18' },
			{ field: 'pre.nickname', operator: 'equals', value: 'Rene' },
		]);
	});

	it('reads a list of conditions on one handle as one condition each', () => {
		expect(new Converter().fromBlueprint({ age: ['> 18', '< 65'] })).toEqual([
			{ field: 'age', operator: '>', value: '18' },
			{ field: 'age', operator: '<', value: '65' },
		]);
	});

	it('spells null and the empty string the way an author would', () => {
		expect(new Converter().fromBlueprint({ a: null, b: '' })).toEqual([
			{ field: 'a', operator: 'equals', value: 'null' },
			{ field: 'b', operator: 'equals', value: 'empty' },
		]);
	});
});

describe('getScopedFieldHandle', () => {
	it('leaves an absolute handle unprefixed', () => {
		const converter = new Converter();

		expect(converter.getScopedFieldHandle('$root.a', 'pre.')).toBe('$root.a');
		expect(converter.getScopedFieldHandle('root.a', 'pre.')).toBe('root.a');
		expect(converter.getScopedFieldHandle('$parent.a', 'pre.')).toBe('$parent.a');
	});

	it('prefixes a relative handle, and leaves it alone without a prefix', () => {
		expect(new Converter().getScopedFieldHandle('a', 'pre.')).toBe('pre.a');
		expect(new Converter().getScopedFieldHandle('a', null)).toBe('a');
	});
});

describe('operators', () => {
	it('normalizes an alias onto its operator', () => {
		expect(new Converter().getOperatorFromRhs('is yes')).toBe('equals');
		expect(new Converter().getOperatorFromRhs('isnt yes')).toBe('not');
		expect(new Converter().getOperatorFromRhs('includes yes')).toBe('contains');
	});

	it('prefers the longer operator over a shorter one it starts with', () => {
		expect(new Converter().getOperatorFromRhs('contains_any a,b')).toBe('contains_any');
	});

	it('does not let == claim a strict comparison', () => {
		expect(new Converter().getOperatorFromRhs('=== x')).toBe('===');
		expect(new Converter().getValueFromRhs('=== x')).toBe('x');
	});

	it('defaults to equals when no operator leads the value', () => {
		expect(new Converter().getOperatorFromRhs('Rene')).toBe('equals');
		expect(new Converter().getValueFromRhs('Rene')).toBe('Rene');
	});

	it('lists every operator and every alias', () => {
		expect(new Converter().getOperatorsAndAliases()).toEqual([
			'equals', 'not', 'contains', 'contains_any', 'includes_any', '===', '!==', '>', '>=', '<', '<=', 'custom',
			'is', '==', 'isnt', '!=', 'includes',
		]);
	});

	it('matches an operator only when a space and a non-= character follow it', () => {
		const pattern = new Converter().leadingOperatorPattern('==');

		expect(pattern.test('== x')).toBe(true);
		expect(pattern.test('=== x')).toBe(false);
		expect(pattern.test('==x')).toBe(false);
	});

	it('leaves an unknown operator as it is', () => {
		expect(new Converter().normalizeOperator('>=')).toBe('>=');
	});
});

describe('wrap and normalizeConditionString', () => {
	it('wraps a single value in a list and leaves a list alone', () => {
		expect(new Converter().wrap('a')).toEqual(['a']);
		expect(new Converter().wrap(['a', 'b'])).toEqual(['a', 'b']);
	});

	it('renders a non-string right-hand side as a string', () => {
		expect(new Converter().normalizeConditionString(5)).toBe('5');
		expect(new Converter().normalizeConditionString(true)).toBe('true');
	});

	it('splits one right-hand side into a condition', () => {
		expect(new Converter().splitRhs('age', '< 65', 'pre.')).toEqual({ field: 'pre.age', operator: '<', value: '65' });
	});
});
