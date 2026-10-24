// eslint.config.js
const js = require("@eslint/js");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        process: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
        console: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      // Relax unused vars to ignore any variable starting with an underscore (_)
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      
      // Allow empty catch blocks or empty code blocks if used as placeholders
      "no-empty": ["warn", { allowEmptyCatch: true }],
      
      // Turn off annoying escape character warnings in regex
      "no-useless-escape": "off",
      
      // Allow console.log statements in Node.js
      "no-console": "off",
      
      // Enforce semicolons
      "semi": ["error", "always"],
    },
  },
];

