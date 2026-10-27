Alpine CSP Forms is a Statamic add-on that gives public forms a JavaScript driver safe under a Content Security Policy without `'unsafe-eval'`. It registers the `alpine_csp` form JS driver and ships the `$showField` Alpine magic the driver's output calls, which forwards to Statamic's own field-conditions evaluator.

This wiki holds the documentation: a walkthrough, a task guide, the reference and troubleshooting. The [README](https://github.com/UAMS-Web/statamic-alpine-csp-forms#readme) keeps an overview, the requirements and the install command.

Releases are 0.x pre-releases until 1.0.0. A minor release can carry a breaking change, and its release notes call it out first with the action to take.

## Getting started

- [Installation](Installation.md): require the package, publish the script and load it before Alpine.
- [Your first Alpine CSP form](Your-first-Alpine-CSP-form.md): render a form with a conditional field under the driver.

## Guides

- [Selecting the driver on a form](Selecting-the-driver-on-a-form.md): the form tag, a scope, and a named component.

## Reference

- [Driver reference](Driver-reference.md): what the driver changes in a form's markup, and why.

## Troubleshooting

- [Troubleshooting](Troubleshooting.md): one entry per symptom, from what you see to its cause and fix.

## Project

- [Development](Development.md): building and testing the add-on, and working against a host.
- [Project](Project.md): where the add-on is developed and how to report a problem.
