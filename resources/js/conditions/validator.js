/**
 * Evaluate a field's conditions against a set of form values — without `eval`.
 *
 * WHY THIS EXISTS
 *
 * Statamic's shipped evaluator decides every comparison by building a source
 * string and handing it to `eval()`, which is the last `'unsafe-eval'`
 * consumer on a public page and so the blocker on #667's flip of CSP out of
 * Report-Only. This is our own implementation of the same vocabulary, so the
 * `<script src="/vendor/statamic/frontend/js/helpers.js">` tag can be dropped
 * from `layout.antlers.html` entirely.
 *
 * THE COERCION TRAP THIS DELIBERATELY DOES NOT REPRODUCE
 *
 * The vendor's `prepareLhs`/`prepareRhs` hand `eval` **JSON-stringified**
 * operands — the string `Yes` is passed as the four characters `"Yes"` — and
 * `eval` then re-parses them as source literals. Swapping `eval` for a plain
 * comparator while keeping that stringification would compare `5` against the
 * literal `"5"` *including its quote characters*, flipping a number-LHS /
 * string-RHS comparison from true to false. Routing both operands back through
 * `JSON.parse` instead throws on an `undefined` left-hand side, where `eval`
 * merely returned false.
 *
 * So this evaluator never takes the round-trip: operands stay native and are
 * compared directly, which is what `eval` effectively did *after* parsing.
 *
 * STAYING IN SYNC WITH UPSTREAM — A STANDING OBLIGATION
 *
 * This is a **hand port of behavior**, and nothing detects it drifting. Be
 * precise about what the automated guard does and does not cover:
 *
 *   - `FieldConditionsConstantsParityTest` compares our **vocabulary** against
 *     the shipped bundle, so a new operator or a renamed key reds a test.
 *   - **Nothing checks the semantics.** If upstream fixes a comparison, changes
 *     how a nested handle resolves, or alters what `empty` means, our port
 *     keeps the old behavior and every test here keeps passing — the CP and
 *     the public page would then disagree, silently.
 *
 * So on any `statamic/cms` bump, diff these four upstream files and fold in
 * what changed (they live in the GitHub repository, not in the vendored
 * package, which ships only built bundles):
 *
 *     resources/js/components/field-conditions/Validator.js        -> validator.js
 *     resources/js/components/field-conditions/Converter.js        -> converter.js
 *     resources/js/components/field-conditions/ParentResolver.js   -> parentResolver.js
 *     resources/js/components/field-conditions/Constants.js        -> constants.js
 *
 * Note the deliberate divergences before assuming a difference is drift: a
 * vendor defect fixed here rather than reproduced is marked
 * `DELIBERATE DIVERGENCE` in `validator.test.js`. A diff will show those every
 * time; they are not regressions to re-sync away. Last re-synced against
 * `statamic/cms` 6.35.0, which adopted most of the earlier ones.
 *
 * The end state is deletion, not maintenance. #1929 reports the defect
 * upstream, #1930 offers the fix as a pull request, and #1931 retires this
 * directory once Statamic ships it — at which point a row in
 * `.github/workflows/watch-upstream.yml` should watch that upstream issue/PR.
 * No row exists yet because there is no upstream issue to point at until #1929
 * files one.
 *
 * @see resources/js/conditions/showField.js       the public entry point
 * @see tests/Unit/FieldConditionsConstantsParityTest.php  guards the vocabulary against upstream drift
 * @see UAMS-Web/uams-statamic#1902  the decision to own the public field-conditions evaluator
 */

import { KEYS, NUMBER_SPECIFIC_COMPARISONS } from './constants.js';
import { Converter } from './converter.js';
import { ParentResolver } from './parentResolver.js';
import { dataGet, intersectionCount, isEmpty, isObject, isString } from './support.js';

/**
 * The comparison this replaces `eval` with. Keys are post-normalization
 * operators, so `equals`/`is`/`==` have all collapsed to `==` by now.
 *
 * @type {Readonly<Record<string, (lhs: unknown, rhs: unknown) => boolean>>}
 */
const COMPARATORS = Object.freeze({
	/* eslint-disable eqeqeq */
	'==': (lhs, rhs) => lhs == rhs,
	'!=': (lhs, rhs) => lhs != rhs,
	/* eslint-enable eqeqeq */
	'===': (lhs, rhs) => lhs === rhs,
	'!==': (lhs, rhs) => lhs !== rhs,
	'>': (lhs, rhs) => lhs > rhs,
	'>=': (lhs, rhs) => lhs >= rhs,
	'<': (lhs, rhs) => lhs < rhs,
	'<=': (lhs, rhs) => lhs <= rhs,
});

/** Right-hand side that asks "is the left-hand side empty?" rather than comparing. */
const EMPTY_RHS = 'empty';

export class Validator {
	/**
	 * @param {Record<string, unknown>} field the field config carrying the condition keys
	 * @param {Record<string, unknown>} values the form's current values
	 * @param {Record<string, unknown>|false} [rootValues=false] values at the root of the form
	 * @param {string|null} [currentFieldPath=null] dotted path of the field being evaluated
	 * @param {Record<string, unknown>} [extraPayload={}] merged into a custom condition's argument
	 */
	constructor(field, values, rootValues = false, currentFieldPath = null, extraPayload = {}) {
		this.field = field;
		this.values = values;
		this.rootValues = rootValues || false;
		this.currentFieldPath = currentFieldPath;
		this.extraPayload = extraPayload;
		this.passOnAny = false;
		this.showOnPass = true;
		this.converter = new Converter();
	}

	/**
	 * Treat the values handed in as the form root, scoping to the field's
	 * parent when the field is nested.
	 *
	 * @returns {this}
	 */
	usingRootValues() {
		if (!this.currentFieldPath) {
			throw new Error('[currentFieldPath] constructor param required for `usingRootValues()`');
		}

		this.rootValues = this.values;

		return this.currentFieldPath.includes('.') ? this.scopeValuesToParent() : this;
	}

	/**
	 * @param {unknown} [conditions] overrides the field's own conditions
	 * @returns {boolean} should the field be shown?
	 */
	passesConditions(conditions) {
		const resolved = conditions || this.getConditions();

		// A field with no conditions is always shown.
		if (resolved === undefined) {
			return true;
		}

		// A bare-string condition skips the all/any machinery, so it applies the
		// invert here — the one place the per-condition path gets it from the
		// shared return below.
		if (this.isCustomConditionWithoutTarget(resolved)) {
			const passes = this.passesCustomCondition(this.prepareCondition(resolved));

			return this.showOnPass ? passes : !passes;
		}

		const passes = this.passOnAny
			? this.passesAnyConditions(resolved)
			: this.passesAllConditions(resolved);

		return this.showOnPass ? passes : !passes;
	}

	/**
	 * Read the first condition key present on the field, setting the any/invert
	 * modes it implies. Later keys are ignored, matching the vendor.
	 *
	 * @returns {{field: string, operator: string, value: string}[]|string|undefined}
	 */
	getConditions() {
		const key = KEYS.filter((candidate) => this.field[candidate])[0];

		if (!key) {
			return undefined;
		}

		if (key.includes('any')) {
			this.passOnAny = true;
		}

		if (key.includes('unless') || key.includes('hide_when')) {
			this.showOnPass = false;
		}

		const conditions = this.field[key];

		return this.isCustomConditionWithoutTarget(conditions)
			? conditions
			: this.converter.fromBlueprint(conditions, this.field.prefix);
	}

	/**
	 * A bare string condition (`if: 'custom myFunction'`) names a function with
	 * no field to compare against.
	 *
	 * @param {unknown} conditions
	 * @returns {boolean}
	 */
	isCustomConditionWithoutTarget(conditions) {
		return isString(conditions);
	}

	/**
	 * @param {{field: string, operator: string, value: string}[]} conditions
	 * @returns {boolean}
	 */
	passesAllConditions(conditions) {
		return conditions
			.map((condition) => this.prepareCondition(condition))
			.every((condition) => this.passesCondition(condition));
	}

	/**
	 * @param {{field: string, operator: string, value: string}[]} conditions
	 * @returns {boolean}
	 */
	passesAnyConditions(conditions) {
		return conditions
			.map((condition) => this.prepareCondition(condition))
			.some((condition) => this.passesCondition(condition));
	}

	/**
	 * Resolve a structured condition into the operands to compare.
	 *
	 * @param {{field: string, operator: string, value: string}|string} condition
	 * @returns {object}
	 */
	prepareCondition(condition) {
		if (isString(condition) || condition.operator === 'custom') {
			return this.prepareCustomCondition(condition);
		}

		const operator = this.prepareOperator(condition.operator);

		return {
			lhs: this.prepareLhs(condition.field, operator),
			operator,
			rhs: this.prepareRhs(condition.value, operator),
		};
	}

	/**
	 * Collapse every spelling of an operator onto one canonical form.
	 *
	 * @param {string|null} operator
	 * @returns {string}
	 */
	prepareOperator(operator) {
		switch (operator) {
			case null:
			case '':
			case 'is':
			case 'equals':
				return '==';
			case 'isnt':
			case 'not':
			case '¯\\_(ツ)_/¯':
				return '!=';
			case 'includes':
			case 'contains':
				return 'includes';
			// Distinct since statamic/cms 6.35.0 (#13135): `includes_any` asks
			// whether the value is one of a list, `contains_any` whether it
			// contains any of one.
			case 'includes_any':
			case 'contains_any':
			default:
				return operator;
		}
	}

	/**
	 * The field's current value, coerced for the operator about to be applied.
	 *
	 * Unlike the vendor this returns native values — see the coercion note in
	 * this file's header.
	 *
	 * @param {string} handle
	 * @param {string} operator
	 * @returns {unknown}
	 */
	prepareLhs(handle, operator) {
		let value = this.getFieldValue(handle);

		if (NUMBER_SPECIFIC_COMPARISONS.includes(operator)) {
			return Number(value);
		}

		// `includes` needs something with an `includes` method: arrays and
		// objects pass through, everything else becomes a string.
		if ((operator === 'includes' || operator === 'includes_any') && !isObject(value)) {
			return value ? String(value) : '';
		}

		// An empty string is treated as no value at all, so `not` and `!=`
		// against it behave the way an author expects.
		if (isString(value) && isEmpty(value)) {
			value = null;
		}

		return isString(value) ? value.trim() : value;
	}

	/**
	 * @param {string} value the authored comparison value
	 * @param {string} operator
	 * @returns {unknown}
	 */
	prepareRhs(value, operator) {
		switch (value) {
			case 'null':
				return null;
			case 'true':
				return true;
			case 'false':
				return false;
			default:
				break;
		}

		if (NUMBER_SPECIFIC_COMPARISONS.includes(operator)) {
			return Number(value);
		}

		// `empty` is a sentinel, and the two membership operators do their own
		// parsing — all three want the authored string untouched.
		if (
			value === EMPTY_RHS ||
			operator === 'includes' ||
			operator === 'includes_any' ||
			operator === 'contains_any'
		) {
			return value;
		}

		return isString(value) ? value.trim() : value;
	}

	/**
	 * @param {{field?: string, value?: string}|string} condition
	 * @returns {{functionName: string, params: string[], target: unknown, targetHandle: string|undefined}}
	 */
	prepareCustomCondition(condition) {
		const definition = condition.value || condition;

		return {
			functionName: this.prepareFunctionName(definition),
			params: this.prepareParams(definition),
			target: condition.field ? this.getFieldValue(condition.field) : null,
			targetHandle: condition.field,
		};
	}

	/**
	 * @param {string} definition
	 * @returns {string}
	 */
	prepareFunctionName(definition) {
		return definition.replace(/^custom /, '').split(':')[0];
	}

	/**
	 * @param {string} definition
	 * @returns {string[]}
	 */
	prepareParams(definition) {
		const params = definition.split(':')[1];

		return params ? params.split(',').map((param) => param.trim()) : [];
	}

	/**
	 * Read a handle out of the values, honoring `$parent.` and `$root.`.
	 *
	 * @param {string} handle
	 * @returns {unknown}
	 */
	getFieldValue(handle) {
		if (handle.startsWith('$parent.')) {
			handle = new ParentResolver(this.currentFieldPath).resolve(handle);
		}

		if (handle.startsWith('$root.') || handle.startsWith('root.')) {
			return dataGet(this.rootValues, handle.replace(/^\$?root\./, ''));
		}

		return dataGet(this.values, handle);
	}

	/**
	 * @param {object} condition a prepared condition
	 * @returns {boolean}
	 */
	passesCondition(condition) {
		if (condition.functionName) {
			return this.passesCustomCondition(condition);
		}

		if (condition.operator === 'includes') {
			return this.passesIncludesCondition(condition);
		}

		if (condition.operator === 'includes_any') {
			return this.passesIncludesAnyCondition(condition);
		}

		if (condition.operator === 'contains_any') {
			return this.passesContainsAnyCondition(condition);
		}

		let { lhs, rhs } = condition;

		if (rhs === EMPTY_RHS) {
			lhs = isEmpty(lhs);
			rhs = true;
		}

		// Nothing sensible comes of comparing a structure with a scalar
		// operator, and the vendor short-circuits here too.
		if (isObject(lhs)) {
			return false;
		}

		const comparator = COMPARATORS[condition.operator];

		// Unreachable from a well-formed blueprint: every operator the
		// Converter emits normalizes into the table above. The vendor threw a
		// SyntaxError out of `eval` here; refusing the field is the safer
		// answer, and it is loud in the console either way.
		if (!comparator) {
			console.error(`Statamic field condition operator [${condition.operator}] is not supported.`);

			return false;
		}

		return comparator(lhs, rhs);
	}

	/**
	 * @param {{lhs: unknown, rhs: unknown}} condition
	 * @returns {boolean}
	 */
	passesIncludesCondition(condition) {
		const { lhs, rhs } = condition;

		// An object left-hand side reaches here with no `includes` method, so
		// the condition is declined, as the vendor does since statamic/cms#15535.
		if (typeof lhs?.includes !== 'function') {
			return false;
		}

		return lhs.includes(rhs);
	}

	/**
	 * @param {{lhs: unknown, rhs: unknown}} condition
	 * @returns {boolean}
	 */
	passesIncludesAnyCondition(condition) {
		const { lhs, rhs } = condition;
		const options = this.splitList(rhs);

		if (Array.isArray(lhs)) {
			return intersectionCount(lhs, options) > 0;
		}

		// Membership, not a substring: the value must be one of the options.
		// `prepareLhs` has already made anything but an object a string.
		return options.includes(lhs);
	}

	/**
	 * @param {{lhs: unknown, rhs: unknown}} condition
	 * @returns {boolean}
	 */
	passesContainsAnyCondition(condition) {
		const { lhs, rhs } = condition;
		const needles = this.splitList(rhs);

		if (Array.isArray(lhs)) {
			return intersectionCount(lhs, needles) > 0;
		}

		// A structure has nothing to search. The vendor stringifies it to
		// `[object Object]` and searches that; declining is the safer answer.
		if (isObject(lhs)) {
			return false;
		}

		// Literal substring tests, as statamic/cms#15531 made the vendor's in
		// 6.35.0. A number or boolean is searched as its string, and a missing
		// value as the empty string, which no needle matches.
		const haystack = lhs === null || lhs === undefined ? '' : String(lhs);

		return needles.some((needle) => haystack.includes(needle));
	}

	/**
	 * @param {unknown} rhs the authored comma-separated list
	 * @returns {string[]} its trimmed items
	 */
	splitList(rhs) {
		return String(rhs)
			.split(',')
			.map((item) => item.trim());
	}

	/**
	 * @param {{functionName: string, params: string[], target: unknown, targetHandle: string|undefined}} condition
	 * @returns {boolean}
	 */
	passesCustomCondition(condition) {
		const conditionFunction = this.getCustomCondition(condition.functionName);

		if (typeof conditionFunction !== 'function') {
			console.error(`Statamic field condition [${condition.functionName}] was not properly defined.`);

			return false;
		}

		const passes = conditionFunction({
			params: condition.params,
			target: condition.target,
			targetHandle: condition.targetHandle,
			values: this.values,
			root: this.rootValues,
			fieldPath: this.currentFieldPath,
			prefix: this.field.prefix,
			...this.extraPayload,
		});

		// Deliberately does NOT apply `showOnPass` — `passesConditions` owns the
		// invert for every path. The vendor inverted here as well until
		// statamic/cms#15533 (6.35.0), which double-negated an `unless`.
		return Boolean(passes);
	}

	/**
	 * Resolve a registered custom condition.
	 *
	 * `registerCustomCondition` writes into `window.StatamicCustomConditions`
	 * on every page and additionally into `Statamic.$conditions` when the CP
	 * has bootstrapped one. The plain registry is checked first so the public
	 * path no longer depends on a `Statamic` global existing at all.
	 *
	 * @param {string} name
	 * @returns {Function|undefined}
	 */
	getCustomCondition(name) {
		if (typeof window === 'undefined') {
			return undefined;
		}

		return window.StatamicCustomConditions?.[name] ?? window.Statamic?.$conditions?.get?.(name);
	}

	/**
	 * Narrow `values` to the field's parent, so a sibling handle resolves
	 * relative to the set the field lives in.
	 *
	 * @returns {this}
	 */
	scopeValuesToParent() {
		const parentPath = this.currentFieldPath.replace(/\.[^.]+$/, '');

		this.values = dataGet(this.rootValues, parentPath);

		return this;
	}
}
