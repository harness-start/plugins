import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

function read(path) { try { return readFileSync(path, "utf8").slice(0, 512 * 1024); } catch { return ""; } }
function json(path) { try { return JSON.parse(read(path)); } catch { return null; } }
function findUp(start, names) {
  let current = start;
  while (true) {
    for (const name of names) { const path = join(current, name); if (existsSync(path)) return path; }
    const parent = dirname(current); if (parent === current) return null; current = parent;
  }
}
function section(label, facts) { return facts.length ? [`[${label} Env]`, ...facts.map((fact) => `  ${fact}`)].join("\n") : null; }

function angular(cwd) {
  const marker = findUp(cwd, ["angular.json"]); if (!marker) return null;
  const root = dirname(marker), pkg = json(join(root, "package.json")) ?? {}, deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const facts = [];
  for (const [name, label] of [["@angular/core", "Angular"], ["typescript", "TypeScript"], ["rxjs", "RxJS"]]) if (deps[name]) facts.push(`${label}: ${deps[name]}`);
  if (existsSync(join(root, "tsconfig.app.json"))) facts.push("TSConfig: tsconfig.app.json");
  const notable = [["@ngrx/store", "NgRx"], ["@angular/material", "Angular Material"], ["primeng", "PrimeNG"]].filter(([name]) => deps[name]).map(([, label]) => label);
  if (notable.length) facts.push(`Key libraries: ${notable.join(", ")}`);
  return section("Angular", facts);
}

function cpp(cwd) {
  const marker = findUp(cwd, ["CMakeLists.txt", "meson.build", "Makefile", "conanfile.txt", "conanfile.py", "vcpkg.json"]); if (!marker) return null;
  const root = dirname(marker), cmake = read(join(root, "CMakeLists.txt")), facts = [];
  if (existsSync(join(root, "CMakeLists.txt"))) facts.push("Build system: CMake"); else if (existsSync(join(root, "meson.build"))) facts.push("Build system: Meson"); else if (existsSync(join(root, "Makefile"))) facts.push("Build system: Make");
  const cppStandard = cmake.match(/CXX_STANDARD\s+(\d+)/u); if (cppStandard) facts.push(`C++ standard: C++${cppStandard[1]}`);
  if (existsSync(join(root, "conanfile.txt")) || existsSync(join(root, "conanfile.py"))) facts.push("Package manager: Conan");
  if (existsSync(join(root, "vcpkg.json"))) facts.push("Package manager: vcpkg");
  if (/GTest|GoogleTest|gtest_discover_tests/u.test(cmake)) facts.push("Test framework: GoogleTest"); else if (cmake.includes("Catch2")) facts.push("Test framework: Catch2");
  if (existsSync(join(root, ".clang-tidy"))) facts.push("Lint: clang-tidy"); if (existsSync(join(root, ".clang-format"))) facts.push("Formatter: clang-format");
  return section("C/C++", facts);
}

function elixir(cwd) {
  const marker = findUp(cwd, ["mix.exs"]); if (!marker) return null; const text = read(marker), facts = [];
  const patterns = [["Project name", /app\s*:\s*:(\w+)/u], ["Elixir", /elixir\s*:\s*"(~>\s*[\d.]+)/u], ["Phoenix", /\{:phoenix,\s*"(~>\s*[\d.]+)/u]];
  for (const [label, pattern] of patterns) { const match = text.match(pattern); if (match) facts.push(`${label}: ${match[1]}`); }
  if (text.includes(":ecto_sql")) facts.push("ORM: Ecto"); if (text.includes(":postgrex")) facts.push("Database: PostgreSQL"); else if (text.includes(":myxql")) facts.push("Database: MySQL");
  const tools = [[":credo", "Credo"], [":dialyxir", "Dialyxir"], [":ex_machina", "ExMachina"]].filter(([needle]) => text.includes(needle)).map(([, label]) => label); if (tools.length) facts.push(`Tools: ${tools.join(", ")}`);
  return section("Elixir", facts);
}

function remotion(cwd) {
  const packagePath = findUp(cwd, ["package.json"]); if (!packagePath) return null; const pkg = json(packagePath); if (!pkg) return null;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }; const entries = Object.entries(deps).filter(([name]) => name === "remotion" || name.startsWith("@remotion/")); if (!entries.length) return null;
  const root = dirname(packagePath), versions = new Set(entries.map(([, version]) => version)); const config = ["remotion.config.ts", "remotion.config.js", "remotion.config.mjs"].some((name) => existsSync(join(root, name)));
  return section("Remotion", [`Packages: ${entries.map(([name, version]) => `${name}@${version}`).join(", ")}`, `Package versions aligned: ${versions.size === 1 ? "yes" : "no"}`, `Config file: ${config ? "found" : "not found"}`]);
}

function solidity(cwd) {
  const hardhat = findUp(cwd, ["hardhat.config.ts", "hardhat.config.js"]), foundry = findUp(cwd, ["foundry.toml"]); if (!hardhat && !foundry) return null; const facts = [];
  if (hardhat) { facts.push("Development framework: Hardhat"); const pkg = json(join(dirname(hardhat), "package.json")) ?? {}, deps = { ...pkg.dependencies, ...pkg.devDependencies }; if (deps.hardhat) facts.push(`Hardhat: ${deps.hardhat}`); if (deps["@openzeppelin/contracts"]) facts.push("Library: OpenZeppelin"); if (deps.ethers) facts.push("SDK: ethers.js"); else if (deps.viem) facts.push("SDK: viem"); }
  if (foundry) { facts.push("Development framework: Foundry"); const match = read(foundry).match(/solc\s*=\s*"([^"]+)"/u); if (match) facts.push(`solc: ${match[1]}`); }
  return section("Solidity", facts);
}

function windows() {
  if (process.platform !== "win32") return null; const env = process.env, facts = [`Default shell: cmd.exe${env.COMSPEC ? ` (${env.COMSPEC})` : ""}`];
  if (env.PSModulePath) facts.push("PowerShell available"); if (env.MSYSTEM) facts.push(`Git Bash/MSYS session: ${env.MSYSTEM}`); else facts.push("No Git Bash detected; prefer Node or PowerShell over .sh scripts");
  if (env.ELECTRON_RUN_AS_NODE) facts.push("ELECTRON_RUN_AS_NODE is inherited by child processes"); if (env.CARGO_TARGET_DIR) facts.push(`CARGO_TARGET_DIR: ${env.CARGO_TARGET_DIR}`);
  return section("Windows", facts);
}

export function miscEnvironment(cwd) { const reports = [angular(cwd), cpp(cwd), elixir(cwd), remotion(cwd), solidity(cwd), windows()].filter(Boolean); return reports.length ? reports.join("\n\n") : null; }
