// Example project overrides for markdown-format-guard.
// Copy only the keys the project needs into <repo>/.markdown-format-guard.mjs.

export default {
  checks: {
    // Keep most defaults; soft-nudge language tags on fences.
    fencedCodeLanguage: "report",
    // Many doc sets intentionally use multiple H1s.
    singleH1: "off",
  },
  overrides: [
    // Changelogs often use free-form version headings.
    {
      match: /^CHANGELOG\.md$/i,
      checks: {
        headingIncrement: "off",
        singleH1: "off",
      },
    },
    // Legacy docs: report blank-line issues instead of blocking.
    {
      match: /^docs\/legacy\//,
      checks: {
        headingBlankLines: "report",
      },
    },
  ],
};
