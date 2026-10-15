/**
 * The field-conditions vocabulary — a contract with Statamic, not our design.
 *
 * WHY THE EVALUATOR NEEDS THESE LISTS AT ALL
 *
 * A blueprint does not store a condition as structured data. It stores a
 * string with **no delimiter** between the operator and the value:
 *
 *     if:
 *       referral:  'contains_any self,physician'
 *       age:       '>= 18'
 *       nickname:  'Rene'
 *
 * Nothing in `'contains_any self,physician'` marks where the operator ends —
 * it is only an operator because `contains_any` appears in {@link OPERATORS},
 * and `'Rene'` is a bare value only because no known token leads it. The same
 * holds one level up: `if`, `unless` and `hide_when` are indistinguishable
 * from any other key on the field config until you have {@link KEYS} to
 * recognize them, and to know which of them invert the result.
 *
 * So these lists are the **grammar of that mini-language**, not a lookup
 * table we keep for convenience. Taking evaluation off the vendor meant taking
 * over parsing too, and a parser cannot exist without its terminal symbols.
 * That is why the constants have to live somewhere in this repo at all.
 *
 * WHY THEY ARE MIRRORED RATHER THAN INVENTED
 *
 * We own the *evaluator* now, but we do not own the surface that **authors**
 * the conditions it reads. Forms are built in Statamic's Control Panel, which
 * writes conditions into the blueprint in its own vocabulary and evaluates
 * them in its own field preview against its own copy of these constants. Our
 * evaluator is a second reader of that same authored data, so the vocabulary
 * is fixed by whatever the CP will let an editor write. Invent our own and an
 * author would get one behavior in the CP and a different one on the public
 * page, with nothing anywhere to say the two disagree.
 *
 * WHY DUPLICATED RATHER THAN IMPORTED
 *
 * Nothing in the vendor tree exports them. `statamic/cms` ships only
 * `dist-frontend/js/` bundles plus `.d.ts` types, and the `@statamic/cms`
 * package's `src/*.js` are re-export shims over `__STATAMIC__.core` — a global
 * only the CP bundle defines. There is no module to import from.
 *
 * WHAT KEEPS THE COPY HONEST
 *
 * `tests/Unit/FieldConditionsConstantsParityTest.php` extracts these same four lists out of the shipped
 * vendor bundle and asserts they match. That matters because the drift is
 * otherwise **invisible**: an upstream release that adds an operator or renames
 * a key immediately lets an editor author a condition our evaluator has never
 * heard of, and the field would just quietly resolve the wrong way. The test
 * turns that into a red build. Keep this module declarative — logic here could
 * diverge independently of the values the guard checks.
 *
 * WHAT THE GUARD DOES NOT COVER
 *
 * Only these lists. The **evaluation semantics** in `validator.js` are a hand
 * port with no automated drift detection at all, so an upstream change to how
 * a comparison behaves passes every test here. Re-syncing those on a
 * `statamic/cms` bump is a standing manual obligation — see the "STAYING IN
 * SYNC WITH UPSTREAM" section of `validator.js` for the files to diff.
 *
 * @see tests/Unit/FieldConditionsConstantsParityTest.php
 * @see UAMS-Web/uams-statamic#1902  the decision to own the public field-conditions evaluator
 */

/**
 * Condition keys, in the precedence order the evaluator reads them: the first
 * key present on a field wins, and the rest are ignored.
 *
 * A key containing `any` switches the field to pass-on-any; a key containing
 * `unless` or `hide_when` inverts the result.
 *
 * @type {readonly string[]}
 */
export const KEYS = Object.freeze([
	'if',
	'if_any',
	'show_when',
	'show_when_any',
	'unless',
	'unless_any',
	'hide_when',
	'hide_when_any',
]);

/**
 * Operators an author may write on the right-hand side of a condition.
 *
 * @type {readonly string[]}
 */
export const OPERATORS = Object.freeze([
	'equals',
	'not',
	'contains',
	'contains_any',
	'includes_any',
	'===',
	'!==',
	'>',
	'>=',
	'<',
	'<=',
	'custom',
]);

/**
 * Author-facing spellings that normalize onto an entry in {@link OPERATORS}.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ALIASES = Object.freeze({
	is: 'equals',
	'==': 'equals',
	isnt: 'not',
	'!=': 'not',
	includes: 'contains',
});

/**
 * Operators that coerce both operands to numbers before comparing.
 *
 * @type {readonly string[]}
 */
export const NUMBER_SPECIFIC_COMPARISONS = Object.freeze(['>', '>=', '<', '<=']);
