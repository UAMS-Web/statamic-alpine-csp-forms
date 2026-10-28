<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\File;
use Statamic\Facades\Blueprint;
use Statamic\Facades\Form;
use Statamic\Fields\BlueprintRepository;
use Statamic\Fields\Field;
use Statamic\Forms\Form as FormModel;
use Statamic\Forms\Tags as FormTags;
use UAMSWeb\AlpineCspForms\JsDrivers\AlpineCsp;

/**
 * Coverage for the CSP-safe public-form JS driver, moved from the application
 * it was extracted from (UAMS-Web/uams-statamic-archive#1859, #3073).
 *
 * The front end runs `@alpinejs/csp`, which evaluates every `x-*` attribute with
 * an AST interpreter rather than `new Function()`. That interpreter resolves
 * identifiers only from the Alpine scope stack and refuses any value in its
 * `globalThis` snapshot, so Statamic's stock `alpine` driver, which emits
 * `Statamic.$conditions.showField(...)`, throws on every field and renders a
 * form with a heading, a Submit button, and no inputs.
 *
 * These render through the real `{{ form:create }}` tag rather than calling the
 * driver's protected methods, so a break in registration or handle derivation
 * fails here too. The host application's own templates are not part of the
 * add-on, so the test supplies a minimal fields template.
 *
 * @command  vendor/bin/pest tests/Integration/AlpineCspJsDriverTest.php
 */
const ALPINE_CSP_FORM_HANDLE = 'alpine_csp_conditions';

/**
 * Register a two-field form whose second field is conditional on the first.
 *
 * The default value carries a non-ASCII character on purpose — see the
 * `\uXXXX` regression test below.
 */
function makeAlpineCspForm(string $trigger = 'René'): void
{
    app(BlueprintRepository::class)->setFallback(
        'forms.'.ALPINE_CSP_FORM_HANDLE,
        fn () => Blueprint::makeFromFields([
            'referrer' => [
                'type' => 'text',
                'display' => 'Referrer',
                'default' => $trigger,
            ],
            'referrer_note' => [
                'type' => 'textarea',
                'display' => 'Referrer Note',
                'if' => ['referrer' => 'equals '.$trigger],
            ],
        ]),
    );

    $form = Form::make(ALPINE_CSP_FORM_HANDLE);
    $form->title('Alpine CSP Conditions');
    $form->save();
}

/**
 * Render the form's opening tag and one `<template x-if>` wrapper per field, with the
 * given js driver.
 *
 * This calls the `{{ form:create }}` tag's own `create()` and renders the data it
 * returns the way the host's fields partial does: the form's attributes on the opening
 * tag, then each field wrapped in the `<template x-if="{{ show_field }}">` the driver's
 * `show_field` variable feeds. That wrapper is the expression the CSP build evaluates.
 *
 * Statamic's tags do not resolve inside `Antlers::parse()` under Testbench, so the tag
 * is driven directly rather than through a template string.
 */
function renderAlpineCspForm(string $js = 'alpine_csp'): string
{
    // Drive the form:create tag with the js driver under test
    $tag = new FormTags;
    $tag->setProperties([
        'parser' => null,
        'content' => '',
        'context' => [],
        'params' => ['handle' => ALPINE_CSP_FORM_HANDLE, 'js' => $js],
        'tag' => 'form:create',
        'tag_method' => 'create',
    ]);

    /** @var array{attrs: array<string, string>, fields: list<array<string, mixed>>} $data */
    $data = $tag->create();

    // Open the form with the attributes the driver adds, as the tag's formOpen() does
    $html = '<form';
    foreach ($data['attrs'] as $name => $value) {
        $html .= ' '.$name.'="'.$value.'"';
    }

    $html .= '>';

    // Wrap each field in the conditional template the host's fields partial emits
    foreach ($data['fields'] as $field) {
        $expression = $field['show_field'];

        // Stop when the driver gave no renderable expression, rather than render a blank attribute
        if (! $expression instanceof Stringable) {
            throw new RuntimeException('expected a field to carry a show_field expression');
        }

        $html .= '<template x-if="'.$expression.'"></template>';
    }

    return $html.'</form>';
}

/**
 * Extract the value of the first attribute with the given name, optionally the
 * first one whose value contains `$needle`.
 *
 * Returns the raw attribute text, still HTML-encoded exactly as the browser
 * would receive it.
 */
function alpineCspAttribute(string $html, string $attribute, string $needle = ''): string
{
    preg_match_all('/\b'.preg_quote($attribute, '/').'="([^"]*)"/', $html, $matches);

    foreach ($matches[1] as $value) {
        if ($needle === '' || str_contains($value, $needle)) {
            return $value;
        }
    }

    return '';
}

$alpineCspFormsDir = '';

beforeEach(function () use (&$alpineCspFormsDir): void {
    // Give each test its own form storage directory, so parallel workers never share one
    $alpineCspFormsDir = storage_path('framework/testing/forms-'.uniqid('', true));
    File::ensureDirectoryExists($alpineCspFormsDir);
    Config::set('statamic.forms.forms', $alpineCspFormsDir);
});

afterEach(function () use (&$alpineCspFormsDir): void {
    if ($alpineCspFormsDir !== '' && File::isDirectory($alpineCspFormsDir)) {
        File::deleteDirectory($alpineCspFormsDir);
    }
});

it('registers the driver under the alpine_csp handle', function (): void {
    // Handle derivation is implicit (Str::snake of the class basename), and the
    // two form entry points hardcode the result — assert it rather than assume.
    expect(AlpineCsp::handle())->toBe('alpine_csp');

    expect(app('statamic.form-js-drivers')->get('alpine_csp'))->toBe(AlpineCsp::class);
});

it('emits a scope-local $showField call instead of the Statamic global', function (): void {
    makeAlpineCspForm();

    $html = renderAlpineCspForm();

    // The conditional field's wrapper calls the magic, not the window global.
    expect($html)->toContain('x-if="$showField(');

    // The third argument is still the field path the vendor Validator requires
    // for its usingRootValues() call. Only the conditions object passes through
    // Html::entities(), so the rest of the call is literal.
    expect($html)->toContain(", \$data, 'referrer_note')");
});

it('leaves no window global in any x-* attribute of a rendered form', function (): void {
    makeAlpineCspForm();

    $html = renderAlpineCspForm();

    // Collect every Alpine attribute value the CSP interpreter would evaluate,
    // including the `:` and `@` shorthands for x-bind and x-on.
    preg_match_all(
        '/\s(?:x-[a-z][a-z0-9:.-]*|@[a-z][a-zA-Z0-9.:-]*|:[a-zA-Z][a-zA-Z0-9.:-]*)="([^"]*)"/',
        $html,
        $matches,
    );

    $expressions = $matches[1];

    // ---
    // Guard the guard. A bare not->toBeEmpty() is satisfied by the form's own
    // `x-data` alone, so it would still pass with every `<template x-if>`
    // wrapper — the thing that actually regressed — missing from the render.
    // Require the conditional wrapper specifically.
    // ---
    expect(array_filter($expressions, fn (string $e): bool => str_contains($e, '$showField(')))
        ->not->toBeEmpty();

    // ---
    // Every identifier below is either a window global the CSP build refuses
    // outright ("Accessing global variables is prohibited in the CSP build") or
    // one it cannot resolve from the Alpine scope stack. `Statamic` is the one
    // that actually regressed; the rest are here so a future template cannot
    // reintroduce the same class of break somewhere else.
    // ---
    foreach ($expressions as $expression) {
        expect($expression)->not->toContain('Statamic.');
        expect($expression)->not->toContain('window.');
        expect($expression)->not->toContain('document.');
        expect($expression)->not->toContain('localStorage');
        expect($expression)->not->toContain('JSON.');
        expect($expression)->not->toContain('Math.');
    }
});

it('is what makes the difference — the stock alpine driver still emits the global', function (): void {
    // ---
    // A negative control. Without it, the assertions above would keep passing if
    // the driver silently stopped being used, and would give no signal if
    // Statamic ever fixed this upstream (at which point the subclass could go).
    // ---
    makeAlpineCspForm();

    $html = renderAlpineCspForm('alpine');

    expect($html)->toContain('Statamic.$conditions.showField(');
    expect($html)->not->toContain('$showField(');
});

it('keeps non-ascii literal so the csp tokenizer cannot mangle it', function (): void {
    makeAlpineCspForm();

    $html = renderAlpineCspForm();

    // The conditional field's wrapper — the unconditional one renders `[]`.
    $showFieldExpression = alpineCspAttribute($html, 'x-if', 'referrer_note');

    // Guard the guard: an empty match would pass every assertion below.
    expect($showFieldExpression)->not->toBe('');

    // ---
    // The parent encodes with json_encode($value, 0), which escapes non-ASCII as
    // `\uXXXX`. The CSP tokenizer implements only \n, \t, \r, \\ and the quote
    // escape and falls through to `value += char` for the rest, so "René" would
    // be read as the string "Renu00e9" — silently corrupting both the condition
    // comparison and, via x-data + x-model, the value the user re-submits after
    // a failed validation round-trip.
    // ---
    expect($showFieldExpression)->not->toContain('u00e9');
    expect($showFieldExpression)->not->toContain('\u');

    // htmlentities() renders the literal UTF-8 as a named entity, which the
    // browser decodes back to `é` before Alpine ever tokenizes the attribute.
    expect($showFieldExpression)->toContain('Ren&eacute;');

    // ---
    // The same encoder runs over the x-data payload, and that half is the one
    // that corrupts a re-submitted value: `old()` repopulates x-data after a
    // failed validation, x-model binds the mangled string back to the input,
    // and the user posts it again. Asserted separately because the conditions
    // object and the form data reach the attribute by different methods —
    // without this, deleting renderAlpineXData() entirely leaves the suite green.
    // ---
    $formData = alpineCspAttribute($html, 'x-data');

    expect($formData)->not->toBe('');
    expect($formData)->not->toContain('u00e9');
    expect($formData)->toContain('Ren&eacute;');
});

it('double-encodes so an entity in a field value cannot close the json string', function (): void {
    // ---
    // Statamic's Html::entities() passes `double_encode: false`, so the literal
    // text `&quot;` in a submitted value survives untouched, the browser decodes
    // it to `"` while parsing the attribute, and that quote terminates the JSON
    // string early — the rest of the value is then parsed as Alpine expression
    // AST. AlpineCsp escapes with double-encoding on instead.
    // ---
    makeAlpineCspForm('say &quot;hello&quot;');

    $html = renderAlpineCspForm();

    $formData = alpineCspAttribute($html, 'x-data');

    expect($formData)->not->toBe('');

    // The ampersand is itself escaped, so the browser decodes back to the
    // literal text rather than to a quote character.
    expect($formData)->toContain('&amp;quot;');
    expect($formData)->not->toContain('say &quot;hello');
});

it('scopes the data object when the driver is given a scope', function (): void {
    makeAlpineCspForm();

    $html = renderAlpineCspForm('alpine_csp:intake');

    // The show-field call descends into the scope key...
    expect($html)->toContain(", \$data.intake, 'referrer_note')");

    // ...and the form data is nested under it.
    expect(alpineCspAttribute($html, 'x-data'))->toStartWith('{&quot;intake&quot;:');
});

it('hands the data to an Alpine.data() component when one is named', function (): void {
    makeAlpineCspForm();

    // `js="<driver>:<scope>:<component>"` — Tags::parseJsParamDriverAndOptions
    // splits on ':' and the driver reads $options[0] and $options[1].
    $html = renderAlpineCspForm('alpine_csp:intake:intakeForm');

    expect(alpineCspAttribute($html, 'x-data'))->toStartWith('intakeForm({&quot;intake&quot;:');
});

/**
 * The saved test form, narrowed to the concrete class the driver's constructor takes.
 */
function alpineCspFormModel(): FormModel
{
    $form = Form::find(ALPINE_CSP_FORM_HANDLE);

    if (! $form instanceof FormModel) {
        throw new RuntimeException('expected the saved test form to be a '.FormModel::class);
    }

    return $form;
}

/**
 * Call one of the driver's protected render methods directly (UAMS-Web/uams-statamic-archive#3090).
 * The cases below reach inputs `{{ form:create }}` never produces, which is why they do not
 * render through it like the cases above.
 *
 * @param  list<string>  $options  The driver options, as `js="alpine_csp:<scope>:<component>"` splits them.
 * @param  list<mixed>  $arguments
 */
function callAlpineCspDriver(string $method, array $arguments, array $options = []): mixed
{
    makeAlpineCspForm();
    $driver = new AlpineCsp(alpineCspFormModel(), $options);

    return new ReflectionMethod($driver, $method)->invoke($driver, ...$arguments);
}

it('keeps the binding of a bracketed handle that is not a replicator subfield', function (): void {
    makeAlpineCspForm();
    $driver = new AlpineCsp(alpineCspFormModel());

    $attributes = $driver->addToRenderableFieldAttributes(new Field('notes[extra]', ['type' => 'text']));

    expect($attributes)->toBe(['x-model' => 'notes[extra]']);
});

it('adds no binding for a field whose fieldtype has none', function (): void {
    makeAlpineCspForm();
    $driver = new AlpineCsp(alpineCspFormModel());

    expect($driver->addToRenderableFieldAttributes(new Field('address', ['type' => 'group'])))->toBe([]);
});

it('renders an empty handle in the show-field call when the field has none', function (): void {
    expect(callAlpineCspDriver('renderAlpineShowFieldJs', [new Field(null, ['type' => 'text']), null]))
        ->toBe("\$showField([], \$data, '')");
});

it('renders bare x-data when the component option is empty', function (): void {
    expect(callAlpineCspDriver('renderAlpineXData', [['a' => 1], null], ['', '']))
        ->toBe('{&quot;a&quot;:1}');
});

it('renders an empty object when the x-data cannot be encoded as JSON', function (): void {
    expect(callAlpineCspDriver('renderAlpineXData', [['a' => INF], null]))->toBe('{}');
});
