<?php

declare(strict_types=1);

namespace UAMSWeb\AlpineCspForms;

use Statamic\Providers\AddonServiceProvider;
use UAMSWeb\AlpineCspForms\JsDrivers\AlpineCsp;

/**
 * Service provider for the add-on.
 *
 * The host application discovers it through `extra.laravel.providers` in
 * `composer.json`. It registers the CSP-safe Alpine form JS driver and publishes
 * the front-end asset the driver's output depends on.
 *
 * Statamic auto-discovers extensions from a fixed list of directories, and form JS
 * drivers are not in it: `ExtensionServiceProvider::registerFormJsDrivers()` seeds
 * the `statamic.form-js-drivers` collection from a hardcoded array of core drivers.
 * A driver outside core has to register itself.
 */
class ServiceProvider extends AddonServiceProvider
{
    /**
     * The Vite build of the Control Panel assets. `input` and `publicDirectory`
     * must match `vite.config.js`; the built files are committed under
     * `resources/dist`.
     *
     * @var array{input: list<string>, publicDirectory: string}
     */
    // PCOV never reports a property initializer as executed, so Pest classes every mutant of this
    // array as uncovered although `ViteBuildTest` asserts it. Each removal was applied by hand
    // and killed by that test.
    // @pest-mutate-ignore: RemoveArrayItem
    protected $vite = [
        'input' => [
            'resources/js/cp.js',
            'resources/css/cp.css',
        ],
        'publicDirectory' => 'resources/dist',
    ];

    /**
     * The built front-end script, published into the host's `public/vendor/statamic-alpine-csp-forms/`
     * directory as `alpine-csp.js` for the host's layout to load before Alpine starts.
     * It is built by `vite.frontend.config.js`.
     *
     * @var array<string, string>
     */
    // PCOV never reports a property initializer as executed, so Pest classes every mutant of this
    // array as uncovered although `ServiceProviderTest` asserts it. Each mutant was applied by
    // hand and killed by that test.
    // @pest-mutate-ignore: RemoveArrayItem, ConcatRemoveLeft, ConcatRemoveRight, ConcatSwitchSides
    protected $publishables = [
        __DIR__.'/../resources/dist/frontend' => 'frontend',
    ];

    /**
     * Boot the add-on once Statamic has booted.
     *
     * Registration happens here rather than in `register()` because
     * `AbstractJsDriver::register()` writes into the `statamic.form-js-drivers`
     * container instance and returns silently when it is absent. Statamic binds that
     * instance during its own `register()` phase, so this runs after it.
     */
    public function bootAddon(): void
    {
        // Register the CSP-safe Alpine driver as `alpine_csp`, leaving Statamic's stock
        // `alpine` driver in place for anything that still selects it
        AlpineCsp::register();
    }
}
