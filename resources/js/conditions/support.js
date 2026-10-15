/**
 * Small value predicates the field-conditions evaluator needs.
 *
 * Each mirrors the helper Statamic's bundle uses, so the evaluator's behavior
 * matches the vendor's for every shape a blueprint can produce. Where a
 * mirrored helper carries a defect, the deviation is named on that helper
 * rather than reproduced silently — see {@link isEmpty}.
 *
 * @see UAMS-Web/uams-statamic#1902  the decision to own the public field-conditions evaluator
 */

/**
 * Is this value "empty" for the purposes of an `'empty'` right-hand side?
 *
 * Null and undefined are empty; arrays and strings are empty when they have no
 * length; plain objects are empty when they have no own keys.
 *
 * **Deliberate deviation from the vendor.** Statamic implements this as
 * `Object.keys(value).length === 0` for everything that is not null or an
 * array, and `Object.keys()` returns `[]` for a number or a boolean — so the
 * vendor reports `0`, `5`, `true` and `false` as *empty*. A numeric field
 * holding `5` would satisfy `'empty'`, which is not what an author writing
 * that condition means. Numbers and booleans are therefore never empty here.
 * Strings reach the same answer by a clearer route: the vendor gets `''`
 * right only because `Object.keys('')` happens to be `[]`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isEmpty(value) {
	if (value === null || value === undefined) {
		return true;
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return false;
	}

	if (Array.isArray(value) || isString(value)) {
		return value.length === 0;
	}

	if (typeof value === 'object') {
		return Object.keys(value).length === 0;
	}

	return false;
}

/**
 * Is this value a string, including a boxed `String` object?
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isString(value) {
	return value !== null && value !== undefined && typeof value.valueOf() === 'string';
}

/**
 * Is this value an object or a function? Arrays count, matching lodash.
 *
 * The evaluator uses this in two places where arrays must take the object
 * branch: `contains` keeps an array intact instead of converting it to a
 * string, and a scalar comparison against an object operand returns `false`.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isObject(value) {
	const type = typeof value;

	return value !== null && (type === 'object' || type === 'function');
}

/**
 * Read a dot-delimited path out of a nested structure.
 *
 * @param {unknown} target
 * @param {string|string[]} path
 * @param {unknown} [fallback=null] returned when the path resolves to undefined
 * @returns {unknown}
 */
export function dataGet(target, path, fallback = null) {
	const segments = Array.isArray(path) ? path : String(path).split('.');
	const found = segments.reduce((carry, segment) => carry && carry[segment], target);

	return found === undefined ? fallback : found;
}

/**
 * How many of `values` also appear in `others`?
 *
 * Stands in for lodash's `intersection` at the one call site that needs it —
 * `contains_any` against an array left-hand side — where only the count is
 * read. Comparison is `includes`, so it matches on SameValueZero exactly as
 * lodash does.
 *
 * @param {unknown[]} values
 * @param {unknown[]} others
 * @returns {number}
 */
export function intersectionCount(values, others) {
	return values.filter((value) => others.includes(value)).length;
}
