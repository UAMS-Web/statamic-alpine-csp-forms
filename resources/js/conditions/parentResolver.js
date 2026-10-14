/**
 * Rewrite a `$parent.`-prefixed field handle into an absolute `$root.` path.
 *
 * A condition inside a nested field (a Replicator set, a Grid row) may point at
 * a sibling of its container rather than at a sibling of itself. `$parent.foo`
 * means "one level up from me"; repeating the prefix walks further up. This
 * turns that relative reference into the absolute path the evaluator can read
 * from root values.
 *
 * Mirrors Statamic's `ParentResolver`.
 *
 * @see resources/js/conditions/validator.js
 */
export class ParentResolver {
	/**
	 * @param {string} currentFieldPath dotted path of the field being evaluated
	 */
	constructor(currentFieldPath) {
		this.currentFieldPath = currentFieldPath;
	}

	/**
	 * @param {string} handle a handle beginning with one or more `$parent.`
	 * @returns {string} the equivalent `$root.`-prefixed path
	 */
	resolve(handle) {
		let parentPath = this.getParentFieldPath(this.currentFieldPath, true);
		let remaining = this.removeOneParentKeyword(handle);

		while (remaining.startsWith('$parent.')) {
			parentPath = this.getParentFieldPath(parentPath);
			remaining = this.removeOneParentKeyword(remaining);
		}

		return `$root.${parentPath ? `${parentPath}.${remaining}` : remaining}`;
	}

	/**
	 * Strip one level off a dotted path.
	 *
	 * Numeric segments are set indexes rather than field handles, so a path
	 * sitting at set level drops the index with the handle.
	 *
	 * @param {string} path
	 * @param {boolean} [force=false] drop a trailing handle even when the path is not at set level
	 * @returns {string}
	 */
	getParentFieldPath(path, force = false) {
		const pattern = /(.*?[^.]+)(\.[0-9]+)*\.[^.]*$/;

		if (force || this.isAtSetLevel(path)) {
			path = path.replace(pattern, '$1');
		}

		return path.includes('.') ? path.replace(pattern, '$1$2') : '';
	}

	/**
	 * @param {string} path
	 * @returns {boolean} does the path end in a numeric set index?
	 */
	isAtSetLevel(path) {
		return /(\.[0-9]+)$/.test(path);
	}

	/**
	 * @param {string} handle
	 * @returns {string}
	 */
	removeOneParentKeyword(handle) {
		return handle.replace(/^\$parent\./, '');
	}
}
