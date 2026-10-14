/**
 * The add-on's public front-end script: registers the `$showField` Alpine magic
 * that the `alpine_csp` form JS driver's output calls.
 *
 * It does not bundle Alpine. The host owns its own `@alpinejs/csp` instance, so this
 * script waits for the `alpine:init` event Alpine dispatches from `Alpine.start()`,
 * before it walks the DOM, and registers the magic on `window.Alpine`. The host must
 * therefore set `window.Alpine` and load this script before it calls `Alpine.start()`:
 * as a classic `<script defer>` placed before the host's own Alpine bundle, the two run
 * in document order. A host that imports the module instead calls
 * `registerShowFieldMagic(Alpine)` itself.
 *
 * @see resources/js/conditions/showFieldMagic.js  the magic and why it exists
 * @see src/JsDrivers/AlpineCsp.php                the driver that emits `$showField(...)`
 */

import { registerShowFieldMagic } from './conditions/showFieldMagic.js';

document.addEventListener('alpine:init', () => {
	registerShowFieldMagic(window.Alpine);
});

export { registerShowFieldMagic };
