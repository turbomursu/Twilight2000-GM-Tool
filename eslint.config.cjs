const js = require("@eslint/js");
const globals = require("globals");
const { defineConfig } = require("eslint/config");

module.exports = defineConfig([
  {
    ignores: ["archive/**", "deploy/**", "data/**"]
  },
  {
    files: ["**/*.{js,cjs,mjs}"],
    extends: [js.configs.recommended]
  },
  {
    files: ["*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
        module: "readonly"
      }
    }
  },
  {
    files: ["location-client.js", "personnel-client.js"],
    languageOptions: {
      globals: {
        campaignApiRequest: "readonly",
        showToast: "readonly"
      }
    }
  },
  {
    files: ["map-publication-client.js", "map-visualization-client.js"],
    languageOptions: {
      globals: {
        L: "readonly"
      }
    }
  },
  {
    files: ["**/*.{cjs,mjs}"],
    languageOptions: {
      globals: globals.node
    }
  }
]);
