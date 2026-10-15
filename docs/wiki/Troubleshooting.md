Written against v0.1.0.

- [A form renders with no inputs](#a-form-renders-with-no-inputs)
- [Conditional fields never appear](#conditional-fields-never-appear)
- [The script answers 404](#the-script-answers-404)
- [A non-ASCII value changes after a failed submit](#a-non-ascii-value-changes-after-a-failed-submit)

## A form renders with no inputs

The page shows the form's heading and Submit button and no inputs, and the browser console reports `Accessing global variables is prohibited in the CSP build`.

**Cause:** the form is still using Statamic's stock `alpine` driver, whose conditions read the `Statamic` window global.

**Fix:** set `js="alpine_csp"` on the `form:create` tag. See [Selecting the driver on a form](Selecting-the-driver-on-a-form.md).

## Conditional fields never appear

The form renders, but a field with a condition stays hidden whatever the visitor chooses.

**Cause:** the front-end script is not loaded, or it loads after Alpine has started, so `$showField` is not registered when the page's expressions are evaluated.

**Fix:** load `alpine-csp.js` as a deferred script before the host's own Alpine bundle, and set `window.Alpine` before `Alpine.start()`. See [Installation](Installation.md#load-the-script).

## The script answers 404

The page requests `/vendor/statamic-alpine-csp-forms/frontend/alpine-csp.js` and receives a 404.

**Cause:** the script was never published to the host's `public/` directory, or the directory was cleaned.

**Fix:** run `php artisan vendor:publish --tag=statamic-alpine-csp-forms --force`.

## A non-ASCII value changes after a failed submit

After validation fails, a name such as `René` comes back as `Renu00e9`.

**Cause:** an `x-data` attribute carrying a `\uXXXX` escape, which some `@alpinejs/csp` versions do not decode. The `alpine_csp` driver leaves non-ASCII text literal for this reason, so the symptom points at a form still on the stock driver.

**Fix:** select `alpine_csp` on the form tag.
