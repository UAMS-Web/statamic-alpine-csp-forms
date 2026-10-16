/**
 * Coverage for the `$parent.` handle resolver the public field-conditions
 * evaluator uses (UAMS-Web/uams-statamic#3090). The evaluator's own tests reach it only through
 * `showField`; these pin each method directly.
 *
 * @see resources/js/conditions/parentResolver.js
 */

import { describe, expect, it } from 'vitest';

import { ParentResolver } from './parentResolver.js';

describe('resolve', () => {
	it('resolves one $parent. from a field inside a set to a root sibling of the set', () => {
		expect(new ParentResolver('items.0.title').resolve('$parent.name')).toBe('$root.name');
	});

	it('walks one level further up for each extra $parent.', () => {
		expect(new ParentResolver('group.items.0.inner.1.title').resolve('$parent.$parent.x')).toBe('$root.group.x');
	});

	it('resolves to a root handle when the field sits at the top level', () => {
		expect(new ParentResolver('title').resolve('$parent.name')).toBe('$root.name');
	});
});

describe('getParentFieldPath', () => {
	it('drops a trailing set index together with its handle when the path is at set level', () => {
		expect(new ParentResolver('x').getParentFieldPath('items.0')).toBe('');
	});

	it('drops only the last handle when the path is not at set level', () => {
		expect(new ParentResolver('x').getParentFieldPath('items.0.title')).toBe('items.0');
		expect(new ParentResolver('x').getParentFieldPath('a.b')).toBe('a');
	});

	it('drops the trailing handle and its set index when forced', () => {
		expect(new ParentResolver('x').getParentFieldPath('items.0.title', true)).toBe('');
	});

	it('returns an empty path for a top-level handle', () => {
		expect(new ParentResolver('x').getParentFieldPath('items')).toBe('');
	});
});

describe('isAtSetLevel', () => {
	it('is true for a path ending in a numeric set index', () => {
		expect(new ParentResolver('x').isAtSetLevel('items.0')).toBe(true);
	});

	it('is false for a path ending in a handle', () => {
		expect(new ParentResolver('x').isAtSetLevel('items.0.title')).toBe(false);
		expect(new ParentResolver('x').isAtSetLevel('items')).toBe(false);
	});
});

describe('removeOneParentKeyword', () => {
	it('removes exactly one leading $parent.', () => {
		expect(new ParentResolver('x').removeOneParentKeyword('$parent.$parent.name')).toBe('$parent.name');
	});

	it('leaves a handle without the prefix unchanged', () => {
		expect(new ParentResolver('x').removeOneParentKeyword('name')).toBe('name');
	});
});
