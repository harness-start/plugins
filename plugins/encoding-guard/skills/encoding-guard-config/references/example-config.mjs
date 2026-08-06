// Example project overrides for encoding-guard.
// Copy only the rules the project needs into <repo>/.encoding-guard.mjs.

export default {
  rules: [
    // A parser fixture intentionally contains non-UTF-8 bytes.
    { match: /^tests\/fixtures\/legacy-encodings\//, mode: "skip" },

    // Add a project-specific text format not covered by built-ins.
    { match: /\.properties$/, mode: "block" },
  ],
};
