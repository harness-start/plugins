# Misc Language Guards

Target-native checks for C/C++, Ruby, .NET, Elixir, Nix, R, Solidity, Angular, Remotion, and Windows projects. The twenty source hooks are consolidated into three event entries and three parameterized check modules.

Node.js 20+ runs every entry directly. The plugin installs nothing, has no compilation or packaging stage, and carries no vendored source tree. Host compilers or parsers are invoked only when already available and only in syntax-checking modes that create no artifacts.
