# TDD Guard

`tdd-guard` 是一个纯 Hook 文件顺序守卫。它要求 agent 在当前 workspace 和 session 中先创建或修改关联测试，再写实现文件。

插件暂不运行测试，也不判断命令是否经历 RED 或 GREEN。它检查的是文件状态和关联关系：测试文件字节先变化，文件中有可识别的测试声明，然后测试必须通过语言实体绑定或完整目录镜像指向实现文件。

## 工作流程

以 PHP 新增异常类为例，测试文件可以显式声明覆盖目标：

```php
<?php

namespace Acme\Tests\Exception;

use Acme\Exception\InvalidArgumentException;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(InvalidArgumentException::class)]
final class InvalidArgumentExceptionTest extends TestCase
{
    public function testKeepsMessage(): void
    {
        self::assertSame('bad input', (new InvalidArgumentException('bad input'))->getMessage());
    }
}
```

Hook 的处理顺序是：

```text
Write tests/Exception/InvalidArgumentExceptionTest.php
  -> PostToolUse 确认字节变化和 testKeepsMessage
  -> 解析 CoversClass + use，记录 php:Acme\Exception\InvalidArgumentException

Write src/Exception/InvalidArgumentException.php
  -> PreToolUse 从 namespace + class 得到同一个 FQCN
  -> 实体键精确相等，允许写入
```

如果第二次写入的是 `Acme\Transport\InvalidArgumentException`，即使类名仍是 `InvalidArgumentException`，也会被拒绝。插件不再使用 basename 或全局 simple name 解锁实现。

同一个工具调用不能同时修改测试和实现。agent 必须先单独写测试，让 `PostToolUse` 观察最终字节，再发起实现写入。

## 两级匹配

### 1. 语言实体绑定

这是优先级最高的匹配方式。

| 语言 | 测试侧证据 | 实现侧身份 | 同名消歧边界 |
| --- | --- | --- | --- |
| PHP | `#[CoversClass(Foo::class)]`、`@covers`，解析 `use` 和 alias | `namespace` + class/interface/trait/enum/function | FQCN |
| Python | 被测试体实际使用的绝对 `from ... import ...` 或 `import ...` | source root 后的 module path + class/function | module + symbol |
| JavaScript | 被测试体使用的相对 `import` / `require` | 解析后的相对文件路径；兼容扩展名和 `index` | module file path |
| TypeScript | 被测试体使用的相对 `import` / `require`，含 named/type alias | 解析后的相对文件路径；兼容扩展名和 `index` | module file path |
| Rust | 外部测试中的 `use crate_name::module::Item`，支持一层 grouped use 和 alias | 同一 crate scope 下的 `src` module + item | crate scope + module + item |
| Go | 同 package 测试引用的声明 symbol，或外部测试的 import alias + qualified symbol | directory/package + func/type | package directory + symbol |

无法解析的 Python 相对 import、JS/TS path alias、Rust 宏生成 item 等不会退化为 simple-name 匹配。它们只有命中下面的完整目录镜像时才会放行，否则保持阻断。

### 2. 完整目录镜像 fallback

没有显式实体证据时，测试路径必须与实现路径一一对应。匹配会：

- 在同一 monorepo package scope 内映射 `test/tests/spec/specs` 到 `src/app/lib`；
- 只剥离测试根后的 `Unit`、`Integration`、`Acceptance`、`Functional`、`Feature` suite 层；
- 剥离语言测试后缀，例如 PHP 的 `Test`、Python/Go 的 `_test`、JS/TS 的 `.test` / `.spec`；
- 保留其余完整相对目录，不能只靠文件名相同。

例如：

```text
tests/Acceptance/Exception/InvalidArgumentTest.php
  -> src/Exception/InvalidArgument.php       允许
  -> src/Domain/InvalidArgument.php          拒绝
```

JS/TS 也支持 colocated `src/feature/__tests__/parser.test.ts` 到 `src/feature/parser.ts`。Go fallback 要求测试与实现位于同一目录。

## 生效条件

测试文件必须同时满足：

- 在当前 workspace 和 session 中真实创建或发生字节变化；
- 命中语言的固定测试路径或文件名；
- 包含实际测试函数或测试调用，只有空文件、测试类或 `describe()` 不够；
- 命中语言实体绑定或完整目录镜像之一。

测试记录只保存摘要、相对路径、测试名称、语言实体键和必要的标识符，不保存测试源码。修改测试文件后，记录的 SHA 与当前文件不一致时，旧证据立即失效。

## 语言文件 pattern

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

插件能证明测试文件状态先于一个明确关联的实现文件状态，并阻断普通文件工具、补丁和常见重定向 Shell 的 source-first 跳步。

它不证明测试断言正确、覆盖率充分或测试运行成功。两个文件如果声明完全相同的 FQCN 或 package symbol，语言本身已处于重复声明状态；插件按实体处理，不替代 autoload、编译器或静态分析。Rust 第一版仍只支持独立 `tests/*.rs`，同文件 `#[cfg(test)]` 区域不能建立跨工具调用的文件顺序。

## 验证

从 marketplace 根目录运行：

```bash
node --test plugins/tdd-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin tdd-guard
```

live acceptance 由仓库脚本在 `docker/host-acceptance` 中运行。
