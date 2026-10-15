/**
 * Split a blueprint's condition map into structured conditions.
 *
 * A blueprint writes conditions as `{ handle: 'operator value' }`, with the
 * operator optional and defaulting to equality:
 *
 *     if:
 *       has_referrer: 'equals Yes'      -> { field: 'has_referrer', operator: 'equals', value: 'Yes' }
 *       age:          '>= 18'           -> { field: 'age',          operator: '>=',     value: '18'  }
 *       nickname:     'Rene'            -> { field: 'nickname',     operator: 'equals', value: 'Rene' }
 *
 * Mirrors Statamic's `Converter`, minus the CP-only `toBlueprint` direction —
 * public forms only ever read conditions, never author them.
 *
 * @see resources/js/conditions/validator.js
 */

import { ALIASES, OPERATORS } from './constants.js';

export class Converter {
	/**
	 * A handle may carry a list of conditions, each its own entry, as Statamic
	 * reads them since 6.31.0 (statamic/cms#14593):
	 *
	 *     if:
	 *       age: ['> 18', '< 65']   -> two conditions on `age`
	 *
	 * @param {Record<string, unknown>} conditions the raw `if:` / `unless:` map
	 * @param {string|null} [prefix=null] handle prefix for nested fields
	 * @returns {{field: string, operator: string, value: string}[]}
	 */
	fromBlueprint(conditions, prefix = null) {
		return Object.entries(conditions).flatMap(([handle, rhs]) =>
			this.wrap(rhs).map((condition) => this.splitRhs(handle, condition, prefix)),
		);
	}

	/**
	 * @param {unknown} value
	 * @returns {unknown[]} the value itself when it is a list, otherwise a one-item list
	 */
	wrap(value) {
		return Array.isArray(value) ? value : [value];
	}

	/**
	 * @param {string} handle
	 * @param {unknown} rhs
	 * @param {string|null} [prefix=null]
	 * @returns {{field: string, operator: string, value: string}}
	 */
	splitRhs(handle, rhs, prefix = null) {
		return {
			field: this.getScopedFieldHandle(handle, prefix),
			operator: this.getOperatorFromRhs(rhs),
			value: this.getValueFromRhs(rhs),
		};
	}

	/**
	 * Apply the nested-field prefix, unless the handle is already absolute.
	 *
	 * @param {string} handle
	 * @param {string|null} prefix
	 * @returns {string}
	 */
	getScopedFieldHandle(handle, prefix) {
		if (handle.startsWith('$root.') || handle.startsWith('root.') || handle.startsWith('$parent.')) {
			return handle;
		}

		return prefix ? prefix + handle : handle;
	}

	/**
	 * @param {unknown} rhs
	 * @returns {string} a normalized operator, defaulting to `equals`
	 */
	getOperatorFromRhs(rhs) {
		const condition = this.normalizeConditionString(rhs);
		let operator = '==';

		// Last match wins, so a longer operator beats the shorter one it
		// starts with (`contains_any` over `contains`).
		this.getOperatorsAndAliases()
			.filter((candidate) => this.leadingOperatorPattern(candidate).test(condition))
			.forEach((candidate) => {
				operator = candidate;
			});

		return this.normalizeOperator(operator);
	}

	/**
	 * @param {string} operator
	 * @returns {string}
	 */
	normalizeOperator(operator) {
		return ALIASES[operator] ? ALIASES[operator] : operator;
	}

	/**
	 * Strip the leading operator, leaving the comparison value.
	 *
	 * @param {unknown} rhs
	 * @returns {string}
	 */
	getValueFromRhs(rhs) {
		let value = this.normalizeConditionString(rhs);

		this.getOperatorsAndAliases()
			.filter((candidate) => this.leadingOperatorPattern(candidate).test(value))
			.forEach((candidate) => {
				value = value.replace(new RegExp(`^${candidate}[ ]*`), '');
			});

		return value;
	}

	/**
	 * Matches an operator at the start of a condition, followed by a space.
	 *
	 * The trailing `[^=]` keeps `==` from claiming `=== foo`. No escaping is
	 * needed because every operator and alias is made of `<>=!_` and word
	 * characters, none of which are regex metacharacters.
	 *
	 * @param {string} operator
	 * @returns {RegExp}
	 */
	leadingOperatorPattern(operator) {
		return new RegExp(`^${operator} [^=]`);
	}

	/**
	 * @returns {string[]}
	 */
	getOperatorsAndAliases() {
		return OPERATORS.concat(Object.keys(ALIASES));
	}

	/**
	 * Render a right-hand side as the string the operator scan reads.
	 *
	 * `null` and the empty string get the spellings an author would otherwise
	 * have to write by hand.
	 *
	 * @param {unknown} rhs
	 * @returns {string}
	 */
	normalizeConditionString(rhs) {
		if (rhs === null) {
			return 'null';
		}

		if (rhs === '') {
			return 'empty';
		}

		return String(rhs);
	}
}
