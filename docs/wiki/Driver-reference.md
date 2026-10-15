Written against v0.1.0.

The `alpine_csp` driver extends Statamic's stock Alpine driver and changes only what the `@alpinejs/csp` build cannot evaluate. It is registered under the handle `alpine_csp`, selected with the `js` parameter of `form:create`.

## What it changes

| Area | Stock `alpine` driver | `alpine_csp` driver |
| --- | --- | --- |
| Conditional field | `Statamic.$conditions.showField(...)`, which reads a window global | `$showField(conditions, $data, 'handle')`, a magic the front-end script registers |
| Non-ASCII text, slashes and line terminators in `x-data` and conditions | `\uXXXX` and `\/` escapes | Left literal, so the CSP tokenizer reads them as written |
| Invalid UTF-8 in a value | The whole object fails to encode | The bad bytes are substituted and the rest of the object survives |
| An entity such as `&quot;` in a submitted value | Passed through, and the browser decodes it to a quote that can end the JSON string | Double-encoded, so it stays text |
| Field binding on Statamic 6.31 and later | `x-model.fill` | A plain `x-model`, so a checkbox group or multi-select that a condition hides and shows again keeps the visitor's choice |
| Replicator subfield | `x-model` on the bracketed handle `parent[0][child]`, which the CSP interpreter cannot resolve | `x-model` on the bare handle `child`, inside the set's own scope; the `name` attribute keeps the bracketed shape |
| Date field holding the `now` sentinel | Not handled | Today's date in Statamic's display timezone, unless the field was submitted |
| Data that cannot be JSON encoded | Not handled | An empty object, `{}` |

## The `$showField` magic

The front-end script, `alpine-csp.js`, registers `$showField` when Alpine dispatches `alpine:init`. It evaluates a field's conditions against the form's data with the same rules as Statamic's own field conditions; a test in the add-on compares its vocabulary with Statamic's constants. If the evaluator throws, the field is shown rather than hidden.

## Files

| Path | What it is |
| --- | --- |
| `public/vendor/statamic-alpine-csp-forms/frontend/alpine-csp.js` | The published front-end script. |
| `resources/js/alpine-csp.js` | The script's source, for a host that bundles it. |
| `resources/js/conditions/` | The evaluator the magic calls. |
