<?php

declare(strict_types=1);

/**
 * Guard: our field-conditions vocabulary still matches the shipped Statamic
 * bundle's (#1956).
 *
 * #1902 replaced the vendor's `eval()`-based evaluator with our own under
 * `resources/js/conditions/`, which means we now parse the condition mini-
 * language ourselves — and a parser is only correct while its terminal symbols
 * match the ones the authoring surface emits. Forms are authored in Statamic's
 * Control Panel, so the moment an upstream release adds an operator or renames
 * a condition key, an editor can author a condition our evaluator has never
 * heard of, and the field silently resolves the wrong way.
 *
 * WHY THIS IS A PEST TEST RATHER THAN A VITEST ONE
 *
 * It has to read the bundle Statamic actually ships, and that bundle exists
 * only inside a Composer tree: `vendor/` is untracked, and the published copy
 * at `public/vendor/statamic` is git-ignored. The CI `js` job runs
 * `checkout` + `npm ci` with no Composer step, so a Vitest version of this
 * guard could not find the file — and skipping when it is absent would make
 * the guard a permanent false green, never running in the one place it
 * matters. The behavioral tests stay in Vitest, which needs no vendor tree.
 *
 * @command vendor/bin/pest tests/Unit/FieldConditionsConstantsParityTest.php
 */
const FIELD_CONDITIONS_VENDOR_BUNDLE = 'vendor/statamic/cms/resources/dist-frontend/js/helpers.js';

const FIELD_CONDITIONS_OURS = 'resources/js/conditions/constants.js';

/**
 * Read a file from the project root, failing with the path when it is absent.
 */
function fieldConditionsSource(string $relativePath): string
{
    $absolute = dirname(__DIR__, 2).'/'.$relativePath;

    expect(file_exists($absolute))->toBeTrue("expected {$relativePath} to exist");

    $contents = file_get_contents($absolute);

    expect($contents)->not->toBeFalse("expected to read {$relativePath}");

    return (string) $contents;
}

/**
 * Return the one captured group of a pattern that must match, throwing with a
 * useful subject when it does not.
 *
 * A throw rather than an `expect()` because the caller indexes the capture
 * immediately: Pest's expectation cannot narrow the match array for static
 * analysis, and a failed extraction has to stop rather than read offset 1 of
 * an empty array.
 */
function fieldConditionsCapture(string $pattern, string $source, string $subject): string
{
    if (preg_match($pattern, $source, $match) !== 1 || ! isset($match[1])) {
        throw new RuntimeException("expected to find {$subject}");
    }

    return $match[1];
}

/**
 * First entry (or, for `ALIASES`, first key) of each vendor literal.
 *
 * The vendor bundle is minified, and from `statamic/cms` 6.35.1 its
 * module-level `var`s are renamed (`KEYS` became `e`), so a literal is found by
 * its content rather than its name: the one backtick-string literal whose first
 * entry is the anchor. A reorder upstream that moves the anchor fails loudly,
 * which is right for a guard whose order is load-bearing.
 *
 * @var array<string, string>
 */
const FIELD_CONDITIONS_VENDOR_ANCHORS = [
    'KEYS' => 'if',
    'OPERATORS' => 'equals',
    'NUMBER_SPECIFIC_COMPARISONS' => '>',
    'ALIASES' => 'is',
];

/**
 * Return the one literal whose first entry is the named constant's anchor.
 *
 * Throws when no literal starts with the anchor, or when more than one does,
 * so an ambiguous bundle cannot pick a literal silently.
 *
 * @param  array<int, array<int|string, string>>  $literals  Literals in bundle order.
 * @param  string  $name  Constant name keyed in `FIELD_CONDITIONS_VENDOR_ANCHORS`.
 * @param  bool  $byKey  Whether to match the anchor against the first key.
 * @return array<int|string, string> The matching literal.
 */
function vendorLiteralByAnchor(array $literals, string $name, bool $byKey): array
{
    $anchor = FIELD_CONDITIONS_VENDOR_ANCHORS[$name];

    // Keep the literals whose first entry (or first key) is the anchor
    $matches = array_values(array_filter(
        $literals,
        static fn (array $literal): bool => $literal !== []
            && ($byKey ? (string) array_key_first($literal) : $literal[array_key_first($literal)]) === $anchor,
    ));

    if (count($matches) !== 1) {
        throw new RuntimeException(sprintf(
            'expected exactly one `%s` literal starting with `%s` in %s, found %d',
            $name,
            $anchor,
            FIELD_CONDITIONS_VENDOR_BUNDLE,
            count($matches),
        ));
    }

    return $matches[0];
}

/**
 * Pull the vendor array literal for `$name` out of the minified bundle.
 *
 * Reads every array of backtick strings, `[`a`,`b`]`, whatever variable it
 * is assigned to, and returns the one whose first entry is the anchor.
 *
 * @return string[]
 */
function vendorConstantList(string $source, string $name): array
{
    // Collect every array literal made only of backtick strings
    preg_match_all('/\[((?:`[^`]*`,)*`[^`]*`)\]/', $source, $arrays);

    $literals = array_map(static function (string $body): array {
        preg_match_all('/`([^`]*)`/', $body, $entries);

        return $entries[1];
    }, $arrays[1]);

    return array_values(vendorLiteralByAnchor($literals, $name, false));
}

/**
 * Pull the vendor object literal for `$name` out of the minified bundle.
 *
 * Reads every object whose values are all backtick strings, `{a:`b`}`, and
 * returns the one whose first key is the anchor. Keys are bare identifiers
 * where they are valid ones and quoted otherwise.
 *
 * @return array<string, string>
 */
function vendorConstantMap(string $source, string $name): array
{
    // Collect every object literal whose values are all backtick strings
    $pair = '(?:"[^"]+"|[A-Za-z_$][\w$]*):`[^`]*`';
    preg_match_all('/\{((?:'.$pair.',)*'.$pair.')\}/', $source, $objects);

    $literals = array_map(static function (string $body): array {
        preg_match_all('/(?:"([^"]+)"|([A-Za-z_$][\w$]*)):`([^`]*)`/', $body, $entries, PREG_SET_ORDER);

        $map = [];

        foreach ($entries as $entry) {
            $map[$entry[1] !== '' ? $entry[1] : $entry[2]] = $entry[3];
        }

        return $map;
    }, $objects[1]);

    /** @var array<string, string> $map */
    $map = vendorLiteralByAnchor($literals, $name, true);

    return $map;
}

/**
 * Pull an exported `const NAME = Object.freeze([...])` list out of our module.
 *
 * @return string[]
 */
function ourConstantList(string $source, string $name): array
{
    $body = fieldConditionsCapture(
        '/export const '.preg_quote($name, '/').' = Object\.freeze\(\[(.*?)\]\)/s',
        $source,
        "an exported `{$name}` list in ".FIELD_CONDITIONS_OURS,
    );

    preg_match_all("/'((?:[^'\\\\]|\\\\.)*)'/", $body, $entries);

    return array_map(stripslashes(...), $entries[1]);
}

/**
 * Pull the exported `ALIASES` map out of our module.
 *
 * @return array<string, string>
 */
function ourConstantMap(string $source, string $name): array
{
    $body = fieldConditionsCapture(
        '/export const '.preg_quote($name, '/').' = Object\.freeze\(\{(.*?)\}\)/s',
        $source,
        "an exported `{$name}` map in ".FIELD_CONDITIONS_OURS,
    );

    preg_match_all("/(?:'([^']+)'|([A-Za-z_$][\w$]*)): '([^']*)'/", $body, $entries, PREG_SET_ORDER);

    $map = [];

    foreach ($entries as $entry) {
        $map[$entry[1] !== '' ? $entry[1] : $entry[2]] = $entry[3];
    }

    return $map;
}

it('matches the vendor KEYS, in the vendor order', function (): void {
    // Order is load-bearing: the first key present on a field wins, so a
    // reordering upstream changes which condition applies.
    expect(ourConstantList(fieldConditionsSource(FIELD_CONDITIONS_OURS), 'KEYS'))
        ->toBe(vendorConstantList(fieldConditionsSource(FIELD_CONDITIONS_VENDOR_BUNDLE), 'KEYS'));
});

it('matches the vendor OPERATORS, in the vendor order', function (): void {
    // Order matters here too — the Converter takes the last matching operator,
    // which is how `contains_any` beats the `contains` it starts with.
    expect(ourConstantList(fieldConditionsSource(FIELD_CONDITIONS_OURS), 'OPERATORS'))
        ->toBe(vendorConstantList(fieldConditionsSource(FIELD_CONDITIONS_VENDOR_BUNDLE), 'OPERATORS'));
});

it('matches the vendor NUMBER_SPECIFIC_COMPARISONS', function (): void {
    expect(ourConstantList(fieldConditionsSource(FIELD_CONDITIONS_OURS), 'NUMBER_SPECIFIC_COMPARISONS'))
        ->toBe(vendorConstantList(fieldConditionsSource(FIELD_CONDITIONS_VENDOR_BUNDLE), 'NUMBER_SPECIFIC_COMPARISONS'));
});

it('matches the vendor ALIASES', function (): void {
    expect(ourConstantMap(fieldConditionsSource(FIELD_CONDITIONS_OURS), 'ALIASES'))
        ->toBe(vendorConstantMap(fieldConditionsSource(FIELD_CONDITIONS_VENDOR_BUNDLE), 'ALIASES'));
});

it('finds the vendor literals by content, whatever they are named', function (string $bundle): void {
    // Named (`statamic/cms` 6.35.0) and renamed (6.35.1) bundles read the same
    expect(vendorConstantList($bundle, 'KEYS'))->toBe(['if', 'if_any']);
    expect(vendorConstantList($bundle, 'OPERATORS'))->toBe(['equals', '>=']);
    expect(vendorConstantList($bundle, 'NUMBER_SPECIFIC_COMPARISONS'))->toBe(['>', '>=']);
    expect(vendorConstantMap($bundle, 'ALIASES'))->toBe(['is' => 'equals', '!=' => 'not']);
})->with([
    'named' => ['var KEYS=[`if`,`if_any`],OPERATORS=[`equals`,`>=`],NUMBER_SPECIFIC_COMPARISONS=[`>`,`>=`],x=[`cross-platform`],ALIASES={is:`equals`,"!=":`not`}'],
    'renamed' => ['var e=[`if`,`if_any`],t=[`equals`,`>=`],z=[`>`,`>=`],vt=[`cross-platform`],n={is:`equals`,"!=":`not`}'],
]);

it('refuses a vendor anchor that is missing or ambiguous', function (string $bundle): void {
    // Neither no candidate nor two candidates may resolve to a literal
    expect(fn (): array => vendorConstantList($bundle, 'KEYS'))
        ->toThrow(RuntimeException::class, 'expected exactly one `KEYS` literal');
})->with([
    'missing' => ['var e=[`show_when`,`if`]'],
    'ambiguous' => ['var e=[`if`,`if_any`],f=[`if`,`unless`]'],
]);

it('extracts non-empty vocabularies from both sides', function (): void {
    // The negative control for the four assertions above. Without it, a
    // format change that made every extractor return [] would still pass,
    // because an empty-vs-empty comparison is a match — the guard would
    // silently stop guarding.
    $vendor = fieldConditionsSource(FIELD_CONDITIONS_VENDOR_BUNDLE);
    $ours = fieldConditionsSource(FIELD_CONDITIONS_OURS);

    foreach (['KEYS', 'OPERATORS', 'NUMBER_SPECIFIC_COMPARISONS'] as $name) {
        expect(vendorConstantList($vendor, $name))->not->toBeEmpty("vendor {$name}");
        expect(ourConstantList($ours, $name))->not->toBeEmpty("our {$name}");
    }

    expect(vendorConstantMap($vendor, 'ALIASES'))->not->toBeEmpty('vendor ALIASES');
    expect(ourConstantMap($ours, 'ALIASES'))->not->toBeEmpty('our ALIASES');
});
