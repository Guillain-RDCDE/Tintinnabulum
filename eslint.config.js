// Lint: the recommended rules and nothing of taste. It is here to catch what a
// reader cannot -- a name used before it exists, a variable never read, a
// condition that is always true -- not to reformat anything.
//
// The engine and the pages run in a browser; the server, the tools and the
// tests run in Node, and the tools and tests also hand functions to a browser
// page to run (page.evaluate), so they see both.

import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', 'demo/recordings/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      // A caught error that is deliberately dropped is written `catch (e) {}`
      // all over a renderer that must not take the page down.
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['server/**', 'tools/**', 'test/**', '**/*.mjs', '**/*.cjs', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // The drawn-by-hand pictures -- the sketchbook, the natural-media brush
    // and the pen sheets -- are under the owner's own review and are not
    // edited, not even to drop a dead variable. brush.js also carries
    // constants copied digit for digit from their source, which a double
    // cannot hold exactly; the value it does hold is the one that has always
    // been drawn with.
    files: ['src/visual/brush.js', 'src/visual/scenes/brushed.js', 'src/visual/scenes/drawn.js'],
    rules: {
      'no-unused-vars': 'off',
      'no-loss-of-precision': 'off',
    },
  },
];
