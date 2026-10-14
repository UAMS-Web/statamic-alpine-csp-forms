<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Add-on configuration
|--------------------------------------------------------------------------
|
| Statamic merges this file into the application's config under the add-on's
| handle (the package name without its vendor: `statamic-alpine-csp-forms`), so
| `config('statamic-alpine-csp-forms.some_key')` reads it. The host publishes it
| to its own `config/` directory with:
|
|     php artisan vendor:publish --tag=statamic-alpine-csp-forms-config
|
| Rename this file to `config/<handle>.php` when the package is renamed. Delete
| it, and the config test in `tests/Integration/ServiceProviderTest.php`, if the
| add-on has no settings.
|
| Give every setting a comment saying what it does and which values it takes,
| and a default that is safe to leave unset.
|
*/

return [

    // 'some_key' => 'default',

];
