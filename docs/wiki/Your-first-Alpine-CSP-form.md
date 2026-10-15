Written against v0.1.0.

By the end, a public form on your site shows a field only when another field has a given value, and it does so under a Content Security Policy that does not allow `'unsafe-eval'`.

Before you start, finish [Installation](Installation.md): the package is required and the script is loaded before Alpine.

1. **Add a conditional field to a form.** In the Control Panel, open a form's blueprint and give one field a condition, for example show `referrer_note` only when `referrer` equals `Other`. The condition is stored in the blueprint as an `if` rule on the field.
2. **Select the driver on the form tag.** In the template that renders the form, write:

   ```antlers
   {{ form:create js="alpine_csp" }}
   ```

   Render the form's fields as the host's fields partial already does; nothing else in the template changes.
3. **Open the page.** The `referrer_note` field is hidden. Choose `Other` in `referrer` and the field appears; choose another value and it hides again.
4. **Check the markup.** View the page source. The field's wrapper is a `<template x-if>` whose expression starts with `$showField(`, and no `x-*` attribute mentions `Statamic.` or `window.`.

**Note:** with Statamic's stock `alpine` driver the same form renders its heading and Submit button and no inputs, because the stock expression reads the `Statamic` window global, which the CSP build refuses to read.

## Where to go next

- [Selecting the driver on a form](Selecting-the-driver-on-a-form.md) for a scope or a named component.
- [Driver reference](Driver-reference.md) for what else the driver changes.
- [Troubleshooting](Troubleshooting.md) if a field does not show.
