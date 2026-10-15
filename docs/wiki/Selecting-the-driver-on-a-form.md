Written against v0.1.0.

You have a form that already uses a JavaScript driver, or one you are about to render, and you want it to use `alpine_csp`. The driver keeps the stock driver's options, so the tag changes and the rest of the template stays.

## Steps

1. Change the `js` parameter of `form:create` to `alpine_csp`:

   ```antlers
   {{ form:create js="alpine_csp" }}
   ```

2. To keep the form's data under one key, add a scope after the handle:

   ```antlers
   {{ form:create js="alpine_csp:intake" }}
   ```

   The form's data is nested under `intake`, and each field's `$showField` call reads from `$data.intake`.
3. To hand the data to an Alpine component registered with `Alpine.data()`, add its name after the scope:

   ```antlers
   {{ form:create js="alpine_csp:intake:intakeForm" }}
   ```

   The form's `x-data` becomes `intakeForm({...})`. An empty component name is ignored.
4. Make sure [the script is loaded](Installation.md#load-the-script) on any page that renders the form.

## Reference

- [Driver reference](Driver-reference.md) for what the driver changes in each field's markup.
- [Installation](Installation.md) for loading the script.
