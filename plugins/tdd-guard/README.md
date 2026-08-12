# TDD Guard

`tdd-guard` 是一个纯 Hook 文件顺序守卫。它阻止 agent 在当前会话尚未先创建或修改关联测试用例时写入实现文件。

第一版不运行测试，也不判断测试是否 RED 或 GREEN。它只建立一条可机械复验的因果链：测试文件字节先变化，测试内容包含可识别的测试声明并引用目标实现，然后实现文件才允许写入。

## 工作流程

以 PHP 新增 `OrderService` 为例：

```text
Write tests/Unit/OrderServiceTest.php
  -> PostToolUse 验证测试方法、OrderService 引用和新文件摘要
  -> 插件数据目录记录当前 session 的 test-first evidence
Write src/Service/OrderService.php
  -> PreToolUse 匹配 OrderServiceTest.php <-> OrderService.php
  -> 允许写入
```

如果 agent 先写 `src/Service/OrderService.php`，`PreToolUse` 会在文件产生副作用前拒绝，并给出预期测试文件，例如 `tests/**/OrderServiceTest.php`。

同一个工具调用不能同时修改测试和实现。agent 必须先单独写测试，让 `PostToolUse` 观察到最终字节，再发起实现写入。

## 生效条件

测试文件必须同时满足：

- 在当前 workspace 和 session 中真实创建或发生字节变化；
- 命中语言的固定测试路径或文件名；
- 包含实际测试函数或测试调用，只有空文件、测试类或 `describe()` 不够；
- 通过文件名、import/module 路径或声明符号关联目标实现。

已存在但当前 session 未修改的测试不能解锁实现。测试记录只保存摘要、相对路径、测试名称和引用标识符，不保存测试源码。

## 语言规则

| 语言 | 测试文件 | 实现文件 | 测试声明 |
| --- | --- | --- | --- |
| PHP | `tests?/**`、`*Test.php` | 其他 `*.php` | `test*` 方法、`#[Test]`、Pest `it()` / `test()` |
| Python | `tests?/**`、`test_*.py`、`*_test.py` | 其他 `*.py`、`*.pyi` | `test_*` 函数 |
| JavaScript | test/spec 目录、`.test` / `.spec` 文件 | 其他 JS/JSX/MJS/CJS | `it()` / `test()` |
| TypeScript | test/spec 目录、`.test` / `.spec` 文件 | 其他 TS/TSX/MTS/CTS | `it()` / `test()` |
| Rust | `tests/**/*.rs` | 其他 `*.rs` | `#[test] fn ...` |
| Go | `*_test.go` | 其他 `*.go` | `func TestXxx(...)` |

默认忽略依赖、缓存、生成和构建目录，包括 `vendor/`、`node_modules/`、`.venv/`、`target/`、`dist/`、`build/` 和 `coverage/`。

## 效果边界

插件能够证明测试文件状态先于关联实现文件状态，并阻断普通文件工具、补丁和常见重定向 Shell 写入的跳步。

它不证明测试断言正确、覆盖率充分或测试运行成功。Rust 第一版支持独立 `tests/*.rs`；同文件 `#[cfg(test)]` 区域尚不作为解锁证据，因为一个文件工具事件不能证明测试区先于生产区落盘。

## 验证

从 marketplace 根目录运行：

```bash
node --test plugins/tdd-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin tdd-guard
```

live acceptance 由仓库脚本在 `docker/host-acceptance` 中运行。
