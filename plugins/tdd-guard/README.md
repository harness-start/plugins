# TDD Guard

`tdd-guard` 是一个纯 Hook 文件顺序守卫。它要求 agent 在当前 workspace 和 session 中先创建或修改关联测试，再写实现文件。已有实现和测试的历史代码同样走这条顺序：如果磁盘上已经找得到对应测试，必须先改那些现有测试，再改源码。另写一份新测试不能用来绕过。

插件暂不运行测试，也不判断命令是否经历 RED 或 GREEN。它检查的是文件状态和关联关系：测试文件字节先变化，文件中有可识别的测试声明，然后测试必须通过语言实体绑定或完整目录镜像指向实现文件。会话队列写在当前工作目录的 `.tdd-guard/.state/`，带 `*` 的 `.gitignore`。

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

### 历史代码

审计或修补已经同时存在实现和测试的文件时，插件会扫描工作区里同语言的测试文件，用和写前授权相同的实体绑定 / 目录镜像规则找出对应测试。

- 找到现有对应测试后，本会话必须先改动其中至少一个文件；拒绝文案会列出这些路径。
- 本会话新建的另一份测试即使也能对上同一个 FQCN 或镜像，也不能解锁这份历史源码。
- 磁盘上没有对应测试时，仍走原来的新写路径：先创建匹配测试，再写实现。

## 两级匹配

### 1. 语言实体绑定

这是优先级最高的匹配方式。

| 语言 | 测试侧证据 | 实现侧身份 | 同名消歧边界 |
| --- | --- | --- | --- |
| PHP | `#[CoversClass(Foo::class)]`、`@covers`，解析 `use` 和 alias | `namespace` + class/interface/trait/enum/function | FQCN |
| Python | 被测试体实际使用的绝对 `from ... import ...` 或 `import ...` | source root 后的 module path + class/function | module + symbol |
| JavaScript | 被测试体使用的相对 `import` / `require` | 解析后的相对文件路径；兼容扩展名和 `index` | module file path |
| TypeScript | 被测试体使用的相对 `import` / `require`，含 named/type alias | 解析后的相对文件路径；兼容扩展名和 `index` | module file path |
| Rust | 外部测试中的 `use crate_name::module::Item`，支持一层 grouped use 和 alias | 最近 `Cargo.toml` 的 `[lib].name` / `[package].name` + crate scope + `src` module + item | crate + module + item |
| Go | 同 package 测试引用的声明 symbol，或外部测试的 import alias + qualified symbol | 最近 `go.mod` 的 module path + package directory + func/type | module + package + symbol |

如果测试已经解析出显式实体，但该实体与待写实现不相等，插件会直接拒绝，不再尝试目录镜像。无法解析的 Python 相对 import、JS/TS path alias、Rust 宏生成 item 等也不会退化为 simple-name 匹配；没有显式实体时，它们只有命中下面的完整目录镜像才会放行。

### 2. 完整目录镜像 fallback

没有显式实体证据时，测试路径必须与实现路径一一对应。匹配会：

- 在同一 monorepo package scope 内映射 `test/tests/spec/specs` 到 `src/app/lib`；
- 只剥离测试根后的 `Unit`、`Integration`、`Acceptance`、`Functional`、`Feature` suite 层；
- 剥离语言测试后缀，例如 PHP 的 `Test`、Python/Go 的 `_test`、JS/TS 的 `.test` / `.spec`；
- 保留其余完整相对目录，不能只靠文件名相同。

例如 `src/Service/OrderService.php` 对应的测试路径必须保留 `Service`：

```text
src/Service/OrderService.php
  -> tests/Service/OrderServiceTest.php           允许
  -> tests/Unit/Service/OrderServiceTest.php      允许
  -> tests/Unit/OrderServiceTest.php              拒绝（丢掉了 Service）
```

`tests/Acceptance/Exception/InvalidArgumentTest.php` 同样只对应 `src/Exception/InvalidArgument.php`，不能对应 `src/Domain/InvalidArgument.php`。

其他语言用同一条相对目录规则：

| 语言 | 实现 | 对应测试 |
| --- | --- | --- |
| PHP | `src/Service/OrderService.php` | `tests/Service/OrderServiceTest.php`、`tests/Unit/Service/OrderServiceTest.php` |
| Python | `src/service/order_service.py` | `tests/service/test_order_service.py`、`tests/unit/service/test_order_service.py` |
| JavaScript | `src/service/order-service.js` | `tests/service/order-service.test.js`、`tests/unit/service/order-service.test.js`，或同目录 `src/service/order-service.test.js` |
| TypeScript | `src/service/order-service.ts` | `tests/service/order-service.test.ts`、`tests/unit/service/order-service.test.ts`，或同目录 `.test.ts` / `.spec.ts` |
| Rust | `src/service/order_service.rs` | `tests/service/order_service.rs`、`tests/Unit/service/order_service.rs` |
| Go | `service/order_service.go` | 同目录 `service/order_service_test.go` |

JS/TS 也支持 colocated `src/feature/__tests__/parser.test.ts` 到 `src/feature/parser.ts`。Go 不走 `tests/` 镜像，只认同一 package 目录。显式实体绑定（例如 PHP `#[CoversClass]`）仍可指向别的测试文件；没有实体证据时，不能只靠文件名相同。

## 生效条件

测试文件必须同时满足：

- 在当前 workspace 和 session 中真实创建或发生字节变化；
- 磁盘上已有对应测试时，变化必须发生在那些现有文件上，本会话新建的另一份测试不算；
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

它核对的是：关联测试的文件状态先变，实现文件后变。已有对应测试时，改的必须是那些文件，而不是另写一份新测试。普通文件工具、补丁和常见重定向 Shell 的 source-first 跳步会被拦住。

它不核对断言对不对、覆盖够不够、测试有没有跑绿。两个文件如果声明了完全相同的 FQCN 或 package symbol，语言本身已经重复声明；插件按实体处理，不替代 autoload、编译器或静态分析。Rust 第一版仍只支持独立 `tests/*.rs`，同文件 `#[cfg(test)]` 区域不能建立跨工具调用的文件顺序。

## 验证

从 marketplace 根目录运行：

```bash
node --test plugins/tdd-guard/tests/*.test.mjs
./scripts/acceptance/run.sh --plugin tdd-guard
```

live acceptance 由仓库脚本在 `docker/host-acceptance` 中运行。
