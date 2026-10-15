<?php

declare(strict_types=1);

use Carbon\Carbon;
use Statamic\Facades\Blueprint;
use Statamic\Facades\Form;
use Statamic\Fields\BlueprintRepository;
use Statamic\Fields\Field;
use Statamic\Fieldtypes\Date;
use Statamic\Forms\Form as FormModel;
use Statamic\Tags\Parameters;
use UAMSWeb\AlpineCspForms\JsDrivers\AlpineCsp;

/**
 * Branch-level coverage for `AlpineCsp`, written against the driver's public methods.
 *
 * The moved tests (`AlpineCspJsDriverTest.php`) render a form through the tag and cover the
 * `$showField` call and the JSON encoding. Everything else the driver does (the date default,
 * the plain `x-model` binding, the replicator subfield rewrite, the handle and component
 * fallbacks) was exercised in the application the driver came from, by tests that need that
 * application. These run the same branches in the add-on's own suite, so a mutation run over
 * `src/` can score them.
 *
 * @command  vendor/bin/pest tests/Integration/AlpineCspDriverBehaviorTest.php
 */

/**
 * A date fieldtype that preprocesses a `now` default to the `now` sentinel.
 *
 * Statamic's own date field resolves a `now` default to a date before the driver sees it. The
 * application the driver came from overrides the field and passes the sentinel through, which
 * is the input the driver's date handling exists for, so the tests stand one in.
 */
final class SentinelDateFieldtype extends Date
{
    /**
     * @param  mixed  $data  The stored value.
     */
    #[Override]
    public function preProcess($data): mixed
    {
        return $this->config('default') === 'now' ? 'now' : parent::preProcess($data);
    }
}

/**
 * Replace the date fieldtype Statamic resolves with the sentinel stand-in.
 *
 * Statamic looks fieldtypes up by handle in the `statamic.fieldtypes` map, so the stand-in is
 * written over `date` before any field resolves its type. The application is rebuilt for each
 * test, so nothing leaks into the next.
 */
function useSentinelDateFieldtype(): void
{
    app('statamic.fieldtypes')->put('date', SentinelDateFieldtype::class);
}

/**
 * Build a driver over an unsaved form carrying the given fields.
 *
 * @param  array<string, array<string, mixed>>  $fields  Blueprint fields keyed by handle.
 * @param  list<string>  $options  The driver's scope and component options.
 * @param  array<string, mixed>  $params  The tag parameters the driver reads, such as `x-data`.
 */
function alpineCspDriver(array $fields, array $options = [], array $params = []): AlpineCsp
{
    $handle = 'behavior_'.uniqid();

    app(BlueprintRepository::class)->setFallback(
        'forms.'.$handle,
        fn () => Blueprint::makeFromFields($fields),
    );

    /** @var FormModel $form */
    $form = Form::make($handle);
    $form->title('Behavior');

    return new AlpineCsp($form, $options, new Parameters($params));
}

/**
 * Decode the `x-data` attribute a driver rendered, the way the browser reads it.
 *
 * @return array<string, mixed>
 */
function alpineCspDecodeAttribute(string $attribute): array
{
    $decoded = json_decode(html_entity_decode($attribute, ENT_QUOTES, 'UTF-8'), true);

    if (! is_array($decoded)) {
        throw new RuntimeException('expected x-data to decode to an object');
    }

    /** @var array<string, mixed> $decoded */
    return $decoded;
}

/**
 * Render the form's `x-data` attribute as the string a template would print.
 *
 * Reads the driver once: it consumes the `x-data` tag parameter as it renders.
 */
function alpineCspXDataAttribute(AlpineCsp $driver): string
{
    $attribute = $driver->addToFormAttributes()['x-data'] ?? null;

    if (! is_string($attribute)) {
        throw new RuntimeException('expected the driver to render an x-data attribute');
    }

    return $attribute;
}

/**
 * Decode the `x-data` object the driver renders for the form.
 *
 * Reads the driver once: it consumes the `x-data` tag parameter as it renders.
 *
 * @return array<string, mixed>
 */
function alpineCspFormData(AlpineCsp $driver): array
{
    return alpineCspDecodeAttribute(alpineCspXDataAttribute($driver));
}

it('starts a date field holding the now sentinel at today in the display timezone', function (): void {
    useSentinelDateFieldtype();
    Carbon::setTestNow(Carbon::parse('2026-03-05 23:30:00', 'UTC'));
    config([
        'statamic.system.display_timezone' => 'Pacific/Kiritimati',
        'app.timezone' => 'UTC',
    ]);

    $data = alpineCspFormData(alpineCspDriver(['when' => ['type' => 'date', 'default' => 'now']]));

    // UTC is still the 5th at this instant; Kiritimati (UTC+14) is already the 6th
    expect($data['when'])->toBe('2026-03-06');

    Carbon::setTestNow();
});

it('falls back to the application timezone when no display timezone is set', function (): void {
    useSentinelDateFieldtype();
    Carbon::setTestNow(Carbon::parse('2026-03-05 23:30:00', 'UTC'));
    config([
        'statamic.system.display_timezone' => null,
        'app.timezone' => 'Pacific/Kiritimati',
    ]);

    $data = alpineCspFormData(alpineCspDriver(['when' => ['type' => 'date', 'default' => 'now']]));

    expect($data['when'])->toBe('2026-03-06');

    Carbon::setTestNow();
});

it('leaves a field that is not a date alone even when it holds the sentinel text', function (): void {
    useSentinelDateFieldtype();
    Carbon::setTestNow(Carbon::parse('2026-03-05 12:00:00', 'UTC'));
    config(['statamic.system.display_timezone' => 'UTC']);

    // The text field comes first, so skipping it with `break` instead of `continue` would also
    // skip the date field after it
    $data = alpineCspFormData(alpineCspDriver([
        'note' => ['type' => 'text', 'default' => 'now'],
        'when' => ['type' => 'date', 'default' => 'now'],
    ]));

    expect($data['note'])->toBe('now')
        ->and($data['when'])->toBe('2026-03-05');

    Carbon::setTestNow();
});

it('leaves a date field alone when it does not hold the sentinel', function (): void {
    useSentinelDateFieldtype();
    Carbon::setTestNow(Carbon::parse('2026-03-05 12:00:00', 'UTC'));
    config(['statamic.system.display_timezone' => 'UTC']);

    // The dated field comes first, so skipping it with `break` would also skip the sentinel after it
    $data = alpineCspFormData(alpineCspDriver([
        'fixed' => ['type' => 'date', 'default' => '2020-01-02'],
        'when' => ['type' => 'date', 'default' => 'now'],
    ]));

    expect($data['fixed'])->toStartWith('2020-01-02')
        ->and($data['when'])->toBe('2026-03-05');

    Carbon::setTestNow();
});

it('does not refill a date the visitor submitted, even empty', function (): void {
    useSentinelDateFieldtype();
    Carbon::setTestNow(Carbon::parse('2026-03-05 12:00:00', 'UTC'));
    config(['statamic.system.display_timezone' => 'UTC']);

    // A failed validation flashes the submitted input, and the first date was left empty
    request()->setLaravelSession(app('session.store'));
    session()->flashInput(['submitted' => '']);

    // The submitted field comes first, so a `break` there would also skip the date after it
    $data = alpineCspFormData(alpineCspDriver([
        'submitted' => ['type' => 'date', 'default' => 'now'],
        'untouched' => ['type' => 'date', 'default' => 'now'],
    ]));

    expect($data['submitted'])->toBe('now')
        ->and($data['untouched'])->toBe('2026-03-05');

    Carbon::setTestNow();
});

it('renders a plain x-model in place of the fill binding', function (): void {
    $field = new Field('tags', ['type' => 'checkboxes', 'options' => ['a', 'b']]);

    $attributes = alpineCspDriver([])->addToRenderableFieldAttributes($field);

    expect($attributes)->toBe(['x-model' => 'tags']);
});

it('keeps the scope in the plain x-model binding', function (): void {
    $field = new Field('tags', ['type' => 'checkboxes', 'options' => ['a', 'b']]);

    $attributes = alpineCspDriver([], ['intake'])->addToRenderableFieldAttributes($field);

    expect($attributes)->toBe(['x-model' => 'intake.tags']);
});

it('adds no binding for a field that has no data binding', function (): void {
    // A replicator-shaped handle on a field without a binding, which the rewrite must not invent one for
    $field = new Field('participants[0][note]', ['type' => 'group']);

    $attributes = alpineCspDriver([])->addToRenderableFieldAttributes($field);

    expect($attributes)->toBe([]);
});

it('binds a replicator subfield to its bare handle', function (): void {
    $field = new Field('participants[0][is_minor]', ['type' => 'text']);

    $attributes = alpineCspDriver([])->addToRenderableFieldAttributes($field);

    expect($attributes)->toBe(['x-model' => 'is_minor']);
});

it('binds a nested replicator subfield to the innermost handle', function (): void {
    $field = new Field('outer[0][inner][1][deep]', ['type' => 'text']);

    $attributes = alpineCspDriver([])->addToRenderableFieldAttributes($field);

    expect($attributes)->toBe(['x-model' => 'deep']);
});

it('keeps the parent binding for a handle that only looks like part of a replicator', function (string $handle): void {
    $field = new Field($handle, ['type' => 'text']);

    $attributes = alpineCspDriver([])->addToRenderableFieldAttributes($field);

    expect($attributes)->toBe(['x-model' => $handle]);
})->with([
    'a bare handle' => ['plain_field'],
    'a replicator row without a child' => ['participants[0]'],
    'a row with an empty child' => ['participants[0][]'],
]);

it('falls back to an empty handle in the show-field call for a handle that is not a string', function (): void {
    $field = new Field(5, ['type' => 'text', 'if' => ['other' => 'equals x']]);

    $data = alpineCspDriver([])->addToRenderableFieldData($field, []);

    expect($data['show_field'])->toEndWith(", \$data, '')");
});

it('renders the plain object when the component option is empty', function (): void {
    $driver = alpineCspDriver(['name' => ['type' => 'text']], ['intake', '']);

    expect(alpineCspXDataAttribute($driver))->toStartWith('{&quot;intake&quot;:');
});

it('wraps the data in the named component', function (): void {
    $driver = alpineCspDriver(['name' => ['type' => 'text']], ['intake', 'intakeForm']);

    expect(alpineCspXDataAttribute($driver))->toStartWith('intakeForm({&quot;intake&quot;:');
});

it('degrades to an empty object when the data cannot be encoded as JSON', function (): void {
    $driver = alpineCspDriver([], [], ['x-data' => ['broken' => NAN]]);

    expect(alpineCspXDataAttribute($driver))->toBe('{}');
});

it('leaves a slash unescaped, which the CSP tokenizer would otherwise read back wrongly', function (): void {
    $driver = alpineCspDriver([], [], ['x-data' => ['path' => 'a/b']]);

    $attribute = alpineCspXDataAttribute($driver);

    expect($attribute)->toContain('a/b')
        ->and($attribute)->not->toContain('\\/');
});

it('leaves a line terminator unescaped', function (): void {
    $driver = alpineCspDriver([], [], ['x-data' => ['note' => "a\u{2028}b"]]);

    $attribute = alpineCspXDataAttribute($driver);

    expect($attribute)->not->toContain('u2028')
        ->and(alpineCspDecodeAttribute($attribute)['note'])->toBe("a\u{2028}b");
});

it('substitutes invalid UTF-8 rather than dropping the whole object', function (): void {
    $driver = alpineCspDriver([], [], ['x-data' => ['bad' => "caf\xC3("]]);

    $data = alpineCspFormData($driver);

    expect($data['bad'])->toBe("caf\u{FFFD}(");
});
