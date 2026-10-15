import { defineConfig } from 'vite'

// Builds the add-on's public front-end script (`resources/js/alpine-csp.js`) as one
// self-contained classic script, so a host can load it with a plain `<script defer>` and
// get document-order execution against its own Alpine bundle. Alpine itself is the host's
// and is not bundled. `ServiceProvider::$publishables` publishes the output directory, and
// `vite.config.js` builds the Control Panel assets. The output is committed, because a
// Composer install does not run npm.
export default defineConfig({
    build: {
        outDir: 'resources/dist/frontend',
        emptyOutDir: true,
        lib: {
            entry: 'resources/js/alpine-csp.js',
            name: 'AlpineCspForms',
            formats: ['iife'],
            fileName: () => 'alpine-csp.js',
        },
    },
})
