<?php

declare(strict_types=1);

namespace UAMSWeb\AlpineCspForms\JsDrivers;

use Illuminate\Support\Carbon;
use Statamic\Contracts\Forms\Form;
use Statamic\Fields\Blueprint;
use Statamic\Fields\Field;
use Statamic\Forms\JsDrivers\Alpine;

/**
 * CSP-safe public-form JS driver.
 *
 * Statamic's stock `alpine` driver emits attribute expressions the
 * `@alpinejs/csp` build refuses to evaluate, so this subclass re-renders the
 * two that matter. It is selected with `js="alpine_csp"` on `{{ form:create }}`
 * — the handle `AbstractJsDriver::handle()` derives from this class name — and
 * is registered by `UAMSWeb\AlpineCspForms\ServiceProvider`.
 *
 * ## Why the `show_field` expression is re-rendered
 *
 * The parent emits, for every field of every public form:
 *
 *     Statamic.$conditions.showField({…}, $data, '<handle>')
 *
 * `@alpinejs/csp` resolves identifiers only from the Alpine scope stack and
 * throws `Undefined variable: Statamic` — and would throw
 * `Accessing global variables is prohibited in the CSP build` even if the
 * global were injected. The observable failure is a form that renders its
 * heading and Submit button with no input fields, because every
 * `<template x-if="…">` wrapper in `fields.antlers.html` throws.
 *
 * The CSP restriction is on *attribute expressions*, not on JS modules, so the
 * global is reached from module scope instead: this driver emits a call to the
 * `$showField` Alpine magic registered in
 * `resources/js/conditions/showFieldMagic.js`, which forwards to
 * `window.Statamic.$conditions.showField` from Statamic's `helpers.js`. The
 * signature and argument order are unchanged, so scoped forms
 * (`js="alpine_csp:intake"`) keep working: only the callee moves.
 *
 * ## Why the JSON encoding is re-rendered
 *
 * The parent encodes both the `x-data` payload and the conditions object with
 * `Statamic::modify(…)->toJson()`, i.e. `json_encode($value, 0)`, which escapes
 * every non-ASCII character as `\uXXXX`. The CSP build's tokenizer implements
 * only `\n`, `\t`, `\r`, `\\` and the quote escape, and falls through to
 * `value += char` for everything else — so `"René"` is read as the string
 * `Renu00e9`. Under the standard build `new Function()` handled the escape, so
 * this only breaks once the CSP build is in play.
 *
 * That is a silent data-corruption path rather than a cosmetic one: a failed
 * validation round-trip re-populates `x-data` from `old()`, the mangled value
 * is bound back through `x-model`, and the user re-submits it. Encoding with
 * `JSON_UNESCAPED_UNICODE` keeps literal UTF-8 in the attribute, which
 * `htmlentities()` then encodes as named entities and the browser decodes back
 * before Alpine ever tokenizes it.
 *
 * @see Alpine  the parent whose two render methods this narrows
 * @see https://github.com/alpinejs/alpine/tree/main/packages/csp
 */
final class AlpineCsp extends Alpine
{
    /**
     * `json_encode()` flags for a value embedded in a CSP-build Alpine expression.
     *
     * Chosen against the tokenizer's escape table, which handles only `\n`, `\t`,
     * `\r`, `\\` and the active quote:
     *
     *   - `JSON_UNESCAPED_UNICODE` is the load-bearing one — see the class
     *     docblock. It keeps every non-ASCII character literal.
     *   - `JSON_UNESCAPED_LINE_TERMINATORS` finishes that job. PHP escapes
     *     U+2028 / U+2029 as `\u2028` / `\u2029` even under
     *     `JSON_UNESCAPED_UNICODE`, and those two are reachable from any
     *     textarea paste.
     *   - `JSON_UNESCAPED_SLASHES` keeps `/` literal rather than relying on the
     *     tokenizer's permissive fall-through to un-escape `\/`.
     *   - `JSON_INVALID_UTF8_SUBSTITUTE` keeps malformed submitted bytes from
     *     collapsing the whole payload to `false`.
     *
     * **Known residue.** No flag combination reaches the C0 controls: PHP emits
     * `\b` and `\f` for U+0008 / U+000C and `\u00XX` for the rest, and the
     * tokenizer's `default: value += char` turns those into the literals `b`,
     * `f` and `u00XX`. `\n`, `\t` and `\r` — the only C0 characters a form
     * field realistically carries — are handled correctly, so this is a narrow
     * gap: a value would need an embedded vertical tab, form feed or backspace
     * to hit it. Closing it needs an upstream tokenizer fix, not an encoder one.
     */
    // PCOV never reports a constant initializer as executed, so Pest classes every mutant of this
    // line as uncovered although the encoding tests run it. Each `|` to `&` mutant was applied by
    // hand and killed by `AlpineCspJsDriverTest` and `AlpineCspDriverBehaviorTest`.
    // @pest-mutate-ignore: BitwiseOrToBitwiseAnd
    private const int JSON_FLAGS = JSON_UNESCAPED_UNICODE
        | JSON_UNESCAPED_LINE_TERMINATORS
        | JSON_UNESCAPED_SLASHES
        | JSON_INVALID_UTF8_SUBSTITUTE;

    /**
     * Matches a replicator subfield handle at any depth: a base name followed by one or more
     * `[index][child]` pairs, so `participants[0][is_minor]` and `outer[0][inner][1][deep]` both
     * match while `participants[0]` and `plain_field` do not.
     */
    private const string REPLICATOR_SUBFIELD_PATTERN = '/^[^\[\]]+(?:\[[^\[\]]*\]\[[^\[\]]+\])+$/';

    /**
     * Captures the innermost bracket group of a handle, the subfield's own bare handle.
     */
    private const string INNERMOST_GROUP_PATTERN = '/\[([^\[\]]+)\]$/';

    /**
     * The binding Statamic's driver emits in place of a plain `x-model` since statamic/cms 6.31.0.
     */
    private const string FILL_MODEL_ATTRIBUTE = 'x-model.fill';

    /**
     * The value `App\Fieldtypes\Date::preProcess()` passes through for a `default: now` field.
     */
    private const string DATE_NOW_SENTINEL = 'now';

    /**
     * The format a native `<input type="date">` reads its value in.
     */
    private const string DATE_INPUT_FORMAT = 'Y-m-d';

    /**
     * Start a date field whose default is `now` at today's date (#2885).
     *
     * `App\Fieldtypes\Date::preProcess()` passes the `now` sentinel through unchanged, which the
     * Control Panel's date picker resolves itself. A public form binds the field's `<input
     * type="date">` to `x-data` with a plain `x-model` (#2800), so the sentinel would reach the
     * input as the string "now", which it cannot display. This is the public-form counterpart of
     * the Gravity Forms `{date_mdy}` default.
     *
     * Only this public driver substitutes the date, so the Control Panel keeps its handling of
     * `now`. A field present in `old()` after a failed validation is left as the parent rendered
     * it, even when the visitor left it empty: Statamic fills an empty value with the default,
     * and refilling today would undo the visitor's choice. A range-mode field preprocesses to a
     * start/end array, never the bare sentinel, so it is untouched. Today is read in Statamic's
     * display timezone, the calendar the site's visitors use, rather than the application's UTC.
     *
     * @return array<array-key, mixed> The form's initial `x-data` values, keyed by field handle.
     */
    #[\Override]
    protected function getInitialFormData(): array
    {
        $data = parent::getInitialFormData();

        // `old()` is null without a failed submission, which the cast turns into no fields
        /** @var array<array-key, mixed> $old */
        $old = (array) old();

        // The parent declares both untyped; a driver is always built with a form, and a form
        // always resolves a blueprint (an empty one when none is stored)
        /** @var Form $form */
        $form = $this->form;
        /** @var Blueprint $blueprint */
        $blueprint = $form->blueprint();

        /** @var Field $field */
        foreach ($blueprint->fields()->all() as $handle => $field) {
            // Only a date field
            if ($field->type() !== 'date') {
                continue;
            }

            // Only one still holding the sentinel
            if (($data[$handle] ?? null) !== self::DATE_NOW_SENTINEL) {
                continue;
            }

            // Never one the visitor submitted, even empty
            if (array_key_exists($handle, $old)) {
                continue;
            }

            $data[$handle] = self::todayForDateInput();
        }

        return $data;
    }

    /**
     * Bind a replicator subfield's `x-model` to its bare handle rather than its bracketed one (#2056).
     *
     * `App\Fieldtypes\Replicator::preProcessTagRenderable()` rewrites each subfield's handle to
     * `parent[index][child]` so the input's `name` posts the shape `process()` consumes. The parent
     * driver reuses that same handle for `x-model`, which Alpine reads as an **expression**: the
     * index and the child handle become identifier lookups, not string keys, so the binding
     * resolves nothing and the CSP interpreter throws on it.
     *
     * Each set renders inside its own `x-data` scope (see the `replicatorSet` component), where the
     * row's values are keyed by bare handle — so binding to `child` is both valid and correct, and
     * it is what gives `$showField` a reactive source for a condition whose `if:` names a sibling
     * subfield. The `name` attribute is untouched: the partials render it from `{{ handle }}`
     * directly, so submission still posts the bracketed shape.
     *
     * A subfield inside a nested replicator (#2133) carries one `[index][child]` pair per level,
     * `outer[0][inner][1][deep]`, and renders inside the innermost set's own scope, so it binds
     * the innermost group, `deep`, by the same reasoning.
     *
     * @param  Field  $field  The field being rendered.
     * @return array<array-key, mixed> The Alpine attributes for this field.
     */
    #[\Override]
    public function addToRenderableFieldAttributes($field)
    {
        $attributes = parent::addToRenderableFieldAttributes($field);

        // Keep a plain binding, as before statamic/cms 6.31.0 (statamic/cms#14706). Each time Alpine
        // creates the binding, `.fill` seeds an empty model from the input's markup, and always seeds
        // a checkbox group or a multi-select. So a checkbox group or multi-select that a condition
        // hides and shows again would take the server render's value and drop the user's choice.
        if (array_key_exists(self::FILL_MODEL_ATTRIBUTE, $attributes)) {
            $attributes['x-model'] = $attributes[self::FILL_MODEL_ATTRIBUTE];
            unset($attributes[self::FILL_MODEL_ATTRIBUTE]);
        }

        if (! isset($attributes['x-model'])) {
            return $attributes;
        }

        $handle = $field->handle();

        // Only a replicator subfield carries the bracketed shape; anything else keeps the parent's
        if (! is_string($handle) || preg_match(self::REPLICATOR_SUBFIELD_PATTERN, $handle) !== 1) {
            // Keep the parent's binding
            return $attributes;
        }

        // Bind the innermost group, the subfield's bare handle within its own set's scope
        if (preg_match(self::INNERMOST_GROUP_PATTERN, $handle, $matches) === 1) {
            $attributes['x-model'] = $matches[1];
        }

        return $attributes;
    }

    /**
     * Render the `x-if` show-field expression for one field.
     *
     * Identical to the parent except that the callee is the `$showField` magic
     * rather than the `Statamic` window global.
     */
    #[\Override]
    protected function renderAlpineShowFieldJs(Field $field, ?string $alpineScope): string
    {
        // Encode the field's conditions as an object literal the CSP tokenizer can read
        $conditionsObject = $this->encodeExpressionLiteral($field->conditions());

        // Descend into the form's scope key when the driver was given one
        $dataObject = is_string($alpineScope)
            ? '$data.'.$alpineScope
            : '$data';

        // Statamic\Fields\Field::handle() is untyped; a field always carries a
        // string handle, but narrow it rather than interpolate an unknown.
        $handle = $field->handle();

        return sprintf(
            "\$showField(%s, %s, '%s')",
            $conditionsObject,
            $dataObject,
            is_string($handle) ? $handle : '',
        );
    }

    /**
     * Render the form's `x-data` object literal.
     *
     * Identical to the parent except for the JSON flags — see the class docblock.
     *
     * @param  array<string, mixed>  $xData
     * @param  bool|string|null  $alpineScope
     */
    #[\Override]
    protected function renderAlpineXData($xData, $alpineScope): string
    {
        // Nest the form data under the scope key when the driver was given one
        if (is_string($alpineScope)) {
            $xData = [$alpineScope => $xData];
        }

        $encoded = $this->encodeExpressionLiteral($xData);

        // Hand the data to a registered Alpine.data() component when one was
        // named. The parent's `$component` is untyped and sourced from the tag's
        // `js="alpine_csp:<scope>:<component>"` options, so narrow to the string
        // case — a non-string could only come from a malformed option list, and
        // interpolating it would emit an unparsable expression.
        $component = $this->component;

        return is_string($component) && $component !== ''
            ? sprintf('%s(%s)', $component, $encoded)
            : $encoded;
    }

    /**
     * Today's date in Statamic's display timezone, as a native date input reads it.
     */
    private static function todayForDateInput(): string
    {
        // Fall back to the application timezone when no display timezone is set
        $timezone = config('statamic.system.display_timezone') ?: config('app.timezone');

        return Carbon::now(is_string($timezone) ? $timezone : null)
            ->format(self::DATE_INPUT_FORMAT);
    }

    /**
     * Encode a value as an HTML-attribute-safe literal for a CSP-build expression.
     *
     * Escapes with `double_encode` ON, which is where this diverges from
     * `Html::entities()` (`htmlentities($value, ENT_QUOTES, 'UTF-8', false)`).
     * With double-encoding off, a field value containing the literal text
     * `&quot;` is passed through untouched, the browser decodes it to `"` while
     * parsing the attribute, and that quote closes the JSON string early —
     * turning the remainder of the value into Alpine expression AST. Under the
     * CSP build that AST cannot reach a global or `eval`, so the practical
     * damage is a corrupted `x-data` or a form whose fields all fail to render,
     * but neither is acceptable from ordinary submitted text.
     *
     * Double-encoding is unambiguously correct here because the input is always
     * freshly-encoded JSON, never pre-encoded HTML: a literal `&` in a value
     * becomes `&amp;` and the browser decodes it back to `&`. The charset is
     * pinned rather than read from `statamic.system.charset` for the same
     * reason — `json_encode()` always emits UTF-8.
     */
    private function encodeExpressionLiteral(mixed $value): string
    {
        $json = json_encode($value, self::JSON_FLAGS);

        // Degrade to an empty object rather than an empty attribute, matching
        // how the `x-data` directive itself treats an empty expression.
        return htmlentities($json === false ? '{}' : $json, ENT_QUOTES, 'UTF-8');
    }
}
