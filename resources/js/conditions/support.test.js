/**
 * Coverage for the value predicates the public field-conditions evaluator
 * uses (UAMS-Web/uams-statamic#3090), including the deliberate deviation from the vendor's
 * `isEmpty` for numbers and booleans.
 *
 * @see resources/js/conditions/support.js
 */

import { describe, expect, it } from 'vitest';

import { dataGet, intersectionCount, isEmpty, isObject, isString } from './support.js';

describe('isEmpty', () => {
	it('treats null, undefined and zero-length values as empty', () => {
		for (const value of [null, undefined, '', [], {}]) {
			expect(isEmpty(value)).toBe(true);
		}
	});

	it('treats non-empty strings, arrays and objects as not empty', () => {
		for (const value of ['a', [0], { a: 1 }]) {
			expect(isEmpty(value)).toBe(false);
		}
	});

	it('never treats a number or a boolean as empty', () => {
		for (const value of [0, 5, true, false]) {
			expect(isEmpty(value)).toBe(false);
		}
	});

	it('treats a boxed empty string as empty and a function as not empty', () => {
		expect(isEmpty(new String(''))).toBe(true);
		expect(isEmpty(() => {})).toBe(false);
	});
});

describe('isString', () => {
	it('accepts primitive and boxed strings', () => {
		expect(isString('a')).toBe(true);
		expect(isString(new String('a'))).toBe(true);
	});

	it('rejects everything else', () => {
		for (const value of [null, undefined, 1, [], {}]) {
			expect(isString(value)).toBe(false);
		}
	});
});

describe('isObject', () => {
	it('accepts objects, arrays and functions', () => {
		for (const value of [{}, [], () => {}]) {
			expect(isObject(value)).toBe(true);
		}
	});

	it('rejects null and primitives', () => {
		for (const value of [null, undefined, 'a', 1, true]) {
			expect(isObject(value)).toBe(false);
		}
	});
});

describe('dataGet', () => {
	const target = { a: { b: { c: 3 } }, list: ['x', 'y'] };

	it('reads a dotted path and an array path', () => {
		expect(dataGet(target, 'a.b.c')).toBe(3);
		expect(dataGet(target, ['a', 'b', 'c'])).toBe(3);
		expect(dataGet(target, 'list.1')).toBe('y');
	});

	it('returns the fallback when the path is missing', () => {
		expect(dataGet(target, 'a.missing')).toBeNull();
		expect(dataGet(target, 'a.missing', 'fallback')).toBe('fallback');
	});
});

describe('intersectionCount', () => {
	it('counts the values that also appear in the other list', () => {
		expect(intersectionCount(['a', 'b', 'c'], ['b', 'c', 'd'])).toBe(2);
		expect(intersectionCount(['a'], ['b'])).toBe(0);
	});
});
