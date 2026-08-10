import musicOwnership from "./local-rules/music-ownership.mjs";

export default [{
  files: ["src/**/*.mjs"],
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: { "tonejs-music": { rules: { "music-ownership": musicOwnership } } },
  rules: { "tonejs-music/music-ownership": "error" },
}];
