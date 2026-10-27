// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Alpine from '@alpinejs/csp';

// Statamic's front-end helpers bundle, as installed with `statamic/cms`, read as text.
import HELPERS_SOURCE from '../../../vendor/statamic/cms/resources/dist-frontend/js/helpers.js?raw';

import { HELPERS_SCRIPT, registerShowFieldMagic } from './showFieldMagic.js';

/**
 * Integration coverage for the `$showField` magic against the REAL
 * `@alpinejs/csp` runtime and Statamic's REAL front-end `helpers.js`.
 *
 * The magic exists because the CSP build's AST interpreter refuses the
 * expression Statamic's stock Alpine driver emits. Stubbing Alpine here would
 * assert nothing about that refusal, so these boot the actual interpreter and
 * evaluate the actual attribute strings `UAMSWeb\AlpineCspForms\JsDrivers\AlpineCsp` renders,
 * including a negative control proving the stock expression still fails. The
 * evaluator the magic forwards to is the installed `statamic/cms` copy of
 * `helpers.js`, so a semantic change upstream shows up here.
 */

/**
 * Define `window.Statamic` the way a page that loads `helpers.js` does.
 *
 * The bundle is a UMD wrapper that assigns `window.Statamic` when no AMD
 * loader is present, so running its source is all a page does with it.
 */
function loadStatamicHelpers() {
	// eslint-disable-next-line no-new-func
	new Function(HELPERS_SOURCE)();
}

/** The expression AlpineCsp emits for a conditional field. */
const EMITTED = `$showField({"if":{"referrer":"equals René"}}, $data, 'referrer_note')`;

/** The expression Statamic's stock `alpine` driver emits for the same field. */
const STOCK = `Statamic.$conditions.showField({"if":{"referrer":"equals René"}}, $data, 'referrer_note')`;

// Register the shared magic. Magics live on a module-level registry, so a test
// that needs a fresh once-only report re-registers and replaces it.
registerShowFieldMagic(Alpine);

/**
 * Mount an element carrying an Alpine data scope, ready for `Alpine.evaluate`.
 *
 * @param {Record<string, unknown>} data  The reactive scope the expression reads.
 * @returns {HTMLElement}
 */
function scopedElement(data = { referrer: 'René' }) {
	const el = document.createElement('div');
	document.body.appendChild(el);
	Alpine.addScopeToNode(el, Alpine.reactive(data));

	return el;
}

/**
 * Evaluate an expression through the CSP interpreter, capturing any Alpine
 * expression error rather than letting it escape on a deferred throw.
 *
 * @param {HTMLElement} el
 * @param {string} expression
 * @returns {{ value: unknown, error: Error | null }}
 */
/**
 * The handler every test runs under unless it is deliberately capturing.
 *
 * Alpine's default handler `console.warn`s and re-throws from a `setTimeout`,
 * which Vitest cannot attribute to the test that caused it — an expression
 * error would look like a passing test plus unexplained console noise. Throwing
 * synchronously instead makes any unexpected expression error red, and red in
 * the right test.
 */
function throwOnExpressionError(error) {
	throw error;
}

function evaluateCapturingError(el, expression) {
	let error = null;
	Alpine.setErrorHandler((e) => { error = e; });

	try {
		return { value: Alpine.evaluate(el, expression), error };
	} finally {
		// Alpine's handler is module-global and `setErrorHandler` returns
		// nothing, so restore the known default rather than leaving a swallowing
		// handler installed for whatever runs next. `beforeEach` sets the same
		// one, so no test can inherit another's capture.
		Alpine.setErrorHandler(throwOnExpressionError);
	}
}

beforeEach(() => {
	document.body.innerHTML = '';

	// The real global, so the evaluated path is Statamic's own evaluator and
	// the stock-expression negative control below fails on the CSP scope rule
	// rather than on a missing global.
	loadStatamicHelpers();

	Alpine.setErrorHandler(throwOnExpressionError);
});

afterEach(() => {
	delete window.Statamic;
	vi.restoreAllMocks();
});

describe('the CSP interpreter and the emitted expression', () => {
	it('evaluates the expression AlpineCsp emits', () => {
		const el = scopedElement();

		const { value, error } = evaluateCapturingError(el, EMITTED);

		expect(error).toBeNull();
		expect(value).toBe(true);
	});

	it('carries the non-ASCII condition value through the tokenizer intact', () => {
		// Asserted through the real evaluator rather than a spy's arguments: if
		// the `é` were mangled anywhere between the attribute and the
		// comparison, `equals René` would stop matching a scope value of
		// `René`. This is why AlpineCsp encodes with JSON_UNESCAPED_UNICODE.
		expect(evaluateCapturingError(scopedElement({ referrer: 'René' }), EMITTED).value).toBe(true);
		expect(evaluateCapturingError(scopedElement({ referrer: 'Rene' }), EMITTED).value).toBe(false);
	});

	it('reads `$data` as the live Alpine scope', () => {
		const data = Alpine.reactive({ referrer: 'someone else' });
		const el = document.createElement('div');
		document.body.appendChild(el);
		Alpine.addScopeToNode(el, data);

		expect(evaluateCapturingError(el, EMITTED).value).toBe(false);

		// Whatever the visitor has typed by now is what gets compared.
		data.referrer = 'René';

		expect(evaluateCapturingError(el, EMITTED).value).toBe(true);
	});

	it('honors the third argument, the field path', () => {
		// A dotted path scopes the lookup to the field's parent, so the same
		// conditions and the same data resolve differently depending on it.
		// Passing the path through unchanged is what makes that work.
		const nested = { set: { referrer: 'René' } };

		const scoped = `$showField({"if":{"referrer":"equals René"}}, $data, 'set.referrer_note')`;
		const unscoped = `$showField({"if":{"referrer":"equals René"}}, $data, 'referrer_note')`;

		expect(evaluateCapturingError(scopedElement(nested), scoped).value).toBe(true);
		expect(evaluateCapturingError(scopedElement(nested), unscoped).value).toBe(false);
	});

	it('rejects the expression the stock alpine driver emits', () => {
		// ---
		// The negative control. `window.Statamic` is set in beforeEach, so this
		// fails on the CSP scope rule rather than on a missing global — which is
		// exactly the blocker that deferred this ticket the first time. If this
		// ever goes green, Statamic fixed it upstream and AlpineCsp can retire.
		// ---
		const el = scopedElement();

		const { error } = evaluateCapturingError(el, STOCK);

		expect(error).not.toBeNull();
		expect(error.message).toContain('Undefined variable: Statamic');
	});

	it('decodes a Unicode escape in the updated CSP interpreter', () => {
		// The updated Alpine CSP tokenizer decodes Unicode escapes. Keep the
		// real interpreter covered alongside the unescaped driver output.
		const escaped = `$showField({"if":{"referrer":"equals Ren\\u00e9"}}, $data, 'referrer_note')`;

		expect(evaluateCapturingError(scopedElement({ referrer: 'René' }), escaped).value).toBe(true);
		expect(evaluateCapturingError(scopedElement({ referrer: 'Rene' }), escaped).value).toBe(false);
		expect(evaluateCapturingError(scopedElement({ referrer: 'René' }), EMITTED).value).toBe(true);
	});
});

describe('forwarding to Statamic', () => {
	it('returns what Statamic.$conditions.showField returns, for the same arguments', () => {
		// A stub that answers something the real evaluator never would, so a
		// magic that evaluated on its own could not produce it.
		const answer = { forwarded: true };
		const showField = vi.fn(() => answer);
		window.Statamic = { $conditions: { showField } };

		const data = { referrer: 'René' };
		const el = scopedElement(data);

		const { value, error } = evaluateCapturingError(el, EMITTED);

		expect(error).toBeNull();
		expect(value).toBe(answer);
		expect(showField).toHaveBeenCalledTimes(1);

		const [conditions, scope, path] = showField.mock.calls[0];
		expect(conditions).toEqual({ if: { referrer: 'equals René' } });
		expect(scope.referrer).toBe('René');
		expect(path).toBe('referrer_note');
	});

	it('reads the global at call time, so helpers.js may load after registration', () => {
		delete window.Statamic;
		vi.spyOn(console, 'error').mockImplementation(() => {});

		// Register on a fresh name-space by re-registering: the missing-global
		// report is per registration, and the shared one may have reported.
		registerShowFieldMagic(Alpine);
		expect(evaluateCapturingError(scopedElement({ referrer: 'Rene' }), EMITTED).value).toBe(true);

		loadStatamicHelpers();

		expect(evaluateCapturingError(scopedElement({ referrer: 'Rene' }), EMITTED).value).toBe(false);
	});
});

describe('custom conditions', () => {
	const CUSTOM = `$showField({"if":{"referrer":"custom isRene"}}, $data, 'referrer_note')`;

	afterEach(() => {
		delete window.StatamicCustomConditions;
	});

	it('looks a custom condition up in window.StatamicCustomConditions', () => {
		const isRene = vi.fn(({ target }) => target === 'René');
		window.StatamicCustomConditions = { isRene };

		expect(evaluateCapturingError(scopedElement({ referrer: 'René' }), CUSTOM).value).toBe(true);
		expect(evaluateCapturingError(scopedElement({ referrer: 'Rene' }), CUSTOM).value).toBe(false);
		expect(isRene).toHaveBeenCalled();
	});

	it('hides the field and names the condition when it is not registered', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const { value, error } = evaluateCapturingError(scopedElement(), CUSTOM);

		expect(error).toBeNull();
		expect(value).toBe(false);
		expect(console.error.mock.calls.flat().join(' ')).toContain('isRene');
	});

	it('keeps a get() the evaluator already has', () => {
		const own = vi.fn(() => () => false);
		window.Statamic.$conditions.get = own;
		window.StatamicCustomConditions = { isRene: () => true };

		expect(evaluateCapturingError(scopedElement({ referrer: 'René' }), CUSTOM).value).toBe(false);
		expect(own).toHaveBeenCalledWith('isRene');
	});
});

describe('the magic failure mode', () => {
	it('fails open when the evaluator throws', () => {
		// A form whose fields all evaluate false renders no inputs at all, the
		// worse outcome on a patient-facing site, so the magic shows the field.
		// A null field path makes Statamic's evaluator throw.
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const thrower = `$showField({"if":{"referrer":"equals René"}}, $data, null)`;

		const { value, error } = evaluateCapturingError(scopedElement(), thrower);

		expect(error).toBeNull();
		expect(value).toBe(true);
		expect(console.error).toHaveBeenCalledTimes(1);
	});

	it('shows every field and logs one error naming helpers.js when window.Statamic is absent', () => {
		delete window.Statamic;
		vi.spyOn(console, 'error').mockImplementation(() => {});

		// A fresh registration, so the once-only report has not fired yet.
		registerShowFieldMagic(Alpine);

		const failing = `$showField({"if":{"referrer":"equals someone else"}}, $data, 'referrer_note')`;

		for (const expression of [EMITTED, failing, EMITTED]) {
			const { value, error } = evaluateCapturingError(scopedElement({ referrer: 'René' }), expression);

			expect(error).toBeNull();
			expect(value).toBe(true);
		}

		expect(console.error).toHaveBeenCalledTimes(1);
		expect(console.error.mock.calls[0][0]).toContain('helpers.js');
		expect(console.error.mock.calls[0][0]).toContain(HELPERS_SCRIPT);
	});
});

describe('the rendered form', () => {
	it('renders a conditional field whose condition passes', async () => {
		// The observable symptom the blocker produced was a form with a heading
		// and a Submit button and no inputs, so assert on the rendered DOM.
		document.body.innerHTML = `
			<form x-data='{"referrer":"René","referrer_note":null}'>
				<template x-if="${EMITTED.replace(/"/g, '&quot;')}">
					<input name="referrer_note">
				</template>
			</form>
		`;

		Alpine.initTree(document.querySelector('form'));
		await Alpine.nextTick();

		expect(document.querySelector('input[name="referrer_note"]')).not.toBeNull();
	});

	it('hides a conditional field whose condition fails', async () => {
		// ---
		// Anchor the negative on positive evidence. An absent input is equally
		// consistent with "Alpine never ran", "the magic was not registered"
		// and "the expression threw" — the exact failures this suite exists to
		// catch. So the same form carries a second field whose condition
		// PASSES: its presence proves the tree initialized and the magic
		// resolved, which makes the first field's absence attributable to the
		// condition evaluating false.
		// ---
		const always = `$showField({"if":{"referrer":"equals someone else"}}, $data, 'always_note')`;

		document.body.innerHTML = `
			<form x-data='{"referrer":"someone else","referrer_note":null,"always_note":null}'>
				<template x-if="${EMITTED.replace(/"/g, '&quot;')}">
					<input name="referrer_note">
				</template>
				<template x-if="${always.replace(/"/g, '&quot;')}">
					<input name="always_note">
				</template>
			</form>
		`;

		Alpine.initTree(document.querySelector('form'));
		await Alpine.nextTick();

		expect(document.querySelector('input[name="referrer_note"]')).toBeNull();
		expect(document.querySelector('input[name="always_note"]')).not.toBeNull();
	});
});
