# Alpine CSP Forms

A Statamic add-on that gives public forms a JavaScript driver safe under a Content Security Policy without `'unsafe-eval'`. It registers the `alpine_csp` form JS driver, and ships the `$showField` Alpine magic the driver's output calls, which forwards to Statamic's own field-conditions evaluator.

Statamic's stock `alpine` driver emits attribute expressions that the `@alpinejs/csp` build refuses to evaluate, so every conditional field on a public form fails to render. `alpine_csp` re-renders the two expressions that matter, and the add-on's front-end script supplies the `$showField` Alpine magic they call. If Statamic ships a CSP-safe driver of its own, removing this add-on returns the site to the stock driver.

Releases are 0.x pre-releases until 1.0.0: a minor release can carry a breaking change, and its release notes call it out first with the action to take.

## Requirements

PHP 8.4 or later and Statamic 6.35.1 or later. The host loads Alpine itself, using the `@alpinejs/csp` build, and loads Statamic's front-end `helpers.js`, which defines the field-conditions evaluator the magic forwards to. Statamic 6.35.1 is the first release whose evaluator works without `'unsafe-eval'`.

## Installation

```bash
composer require uams-web/statamic-alpine-csp-forms
```

The add-on's service provider is discovered by Statamic and registers the driver under the handle `alpine_csp`. Statamic publishes the front-end script to `public/vendor/statamic-alpine-csp-forms/frontend/alpine-csp.js` after the install; `php artisan vendor:publish --tag=statamic-alpine-csp-forms --force` republishes it.

## Usage

Select the driver on the form tag. The scoped form is unchanged:

```antlers
{{ form:create js="alpine_csp" }}
{{ form:create js="alpine_csp:intake" }}
```

Load Statamic's `helpers.js`, then the front-end script, before the host's own Alpine bundle starts. As classic deferred scripts they run in document order:

```html
<script defer src="/vendor/statamic/frontend/js/helpers.js"></script>
<script defer src="/vendor/statamic-alpine-csp-forms/frontend/alpine-csp.js"></script>
<script defer src="/build/site.js"></script>
```

Statamic publishes `helpers.js` to `public/vendor/statamic/frontend/js/helpers.js`. Without it, `$showField` shows every conditional field and logs one console error naming the missing script.

The script registers the `$showField` magic when Alpine dispatches `alpine:init`, so the host has to set `window.Alpine` before it calls `Alpine.start()`. A host that bundles the script instead can import `registerShowFieldMagic` from `resources/js/alpine-csp.js` and call it with its Alpine instance.

## Development

Developing against a host application is covered in [the development guide](docs/DEVELOPMENT.md), and the Packagist and Marketplace steps in [the submission checklist](docs/SUBMISSION.md). `npm run build` writes both the Control Panel build and the front-end script to `resources/dist`, which is committed.

## License

MIT. See [`LICENSE`](LICENSE).
