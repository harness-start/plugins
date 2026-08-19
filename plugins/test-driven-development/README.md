# TDD Guard

`test-driven-development` 是一个 Hook 驱动的 RED/GREEN 顺序守卫。是否改过对应测试或实现，只看工作区相对当前 HEAD 的 git 状态，不看会话里有没有写过那个文件。观察 RED/GREEN 仍来自 shell 测试命令的真实回执。没有 git HEAD 时，实现写入一律拒绝；测试写入和未改实现时的 Stop 仍可用。

三种任务共用同一套授权，但逃生路径不同：

| 任务 | 允许 | 拒绝 |
| --- | --- | --- |
| 新实现 | HEAD 里还没有对应测试；工作区出现匹配测试且观察到 RED，再写实现，再 GREEN | 空仓库直接写实现 |
| 修 bug | HEAD 里已有对应测试：改那些文件后观察 RED，或测试已经失败时直接观察 RED，再改实现 | 对应测试干净且没有 RED 就改实现；另写一份新测试不能解锁 |
| 删特性 | 先删掉或改瘦对应测试，再删除/移走实现，不要求再制造一次已经不可能出现的 RED | 对应测试未动就 `rm` / `mv` / `Delete File` 实现 |

实现发生变化后，Stop 会卡住直到相关测试跑绿（GREEN）。连续两次改实现之间必须实际运行一次相关测试：仍然 RED 时允许继续修正，但该失败会保留为完成阻断；没有测试观察就连续改实现仍会被拒绝。把实现恢复成 HEAD 内容会清掉这道屏障，避免无法回退。另写一份新测试不能用来绕过 HEAD 里已经存在的对应测试。实现已经相对 HEAD 变化后，任一已识别测试 scope 出现失败，Stop 会继续阻断，直到同一 runner 在相同或更宽的测试选择范围内后续成功；更窄的局部 GREEN 不能覆盖更宽的已知失败，等价命令中的 reporter、verbosity 等非选择参数也不会造成死锁。

Hook 只约束可机械验证的 RED/GREEN 顺序与已知失败闭环，不从测试字面量猜测领域语义，也不规定某个 bug 应当怎样修。边界组合、返回值和异常等行为契约应由题面、当前实现、调用方与邻近测试共同确定。

插件不会自行启动测试进程。RED 必须同时具备可识别的测试 runner、能绑定到测试文件的命令范围，以及测试框架报告的失败；命令不存在、依赖缺失、权限错误和其他基础设施失败不会算作 RED。GREEN 要求成功退出且没有相矛盾的失败摘要，因此 `pytest ... | tail` 一类管道即使末端退出码为 0，也不能把输出中的失败记成 GREEN。Claude 的 Bash 回执有时没有退出码；这时插件接受 pytest 的非零 `passed` 摘要、unittest 的非零 `Ran ... tests` + `OK` 摘要，以及 TAP 的非零 pass/零 fail 摘要。除常见框架命令外，插件支持 `runtests.py` / `run_tests.py` 与 `manage.py test`，并把 `expressions.tests` 这类 Python 点号 selector 绑定到工作区测试路径。缺少明确退出状态或可识别测试结果时不会记作 RED/GREEN。

测试文件仍须通过语言实体绑定或完整目录镜像指向实现文件。会话状态只保存 RED/GREEN 回执，写在当前工作目录的 `.test-driven-development/state/`。`.test-driven-development/.gitignore` 忽略该工作目录的全部内容，插件不会修改项目根目录的 `.gitignore`。

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

Run PHPUnit and observe the new test fail
  -> PostToolUseFailure 记录当前测试文件哈希对应的 RED

Write src/Exception/InvalidArgumentException.php
  -> PreToolUse 从 namespace + class 得到同一个 FQCN
  -> 实体键精确相等，允许写入

Run PHPUnit successfully
  -> PostToolUse 记录 GREEN，Stop 才允许完成
```

如果第一次实现仍未通过，相关 PHPUnit 失败会同时记录新的 RED 和未关闭验证失败；下一次实现修正会被允许，但 Stop 继续阻断，直到该 scope 后续 GREEN。

如果第二次写入的是 `Acme\Transport\InvalidArgumentException`，即使类名仍是 `InvalidArgumentException`，也会被拒绝。插件不再使用 basename 或全局 simple name 解锁实现。

同一个工具调用不能同时修改测试和实现。agent 必须先单独写测试，让 `PostToolUse` 观察最终字节，再发起实现写入。

### 历史代码与死锁逃生

对应测试是否存在、是否改过，以 `git status` / `git show HEAD` 为准。会话外改过的测试，只要相对 HEAD 是脏的，仍然算数。

- HEAD 里已有对应测试时，拒绝文案会列出那些路径。本会话新建的另一份测试即使也能对上同一个 FQCN 或镜像，也不能解锁。
- 对应测试已经失败时，只要观察到 RED，不必再改测试字节。
- 对应测试已从工作区删除，或相对 HEAD 已改瘦时，允许删除或重命名该实现，不再要求 RED。
- 上一次实现改动后还没有运行相关测试时，不能继续改实现；相关测试仍 RED 时允许下一次修正，但不能完成。写成与 HEAD 完全相同的内容（回退）会放行并清除屏障。HEAD 里还不存在的新实现，用 `rm` / `Delete File` 删掉也算回退，Stop 不会因此锁死。
- 文件工具的 `Delete File` 以及常见的 `rm` / `mv` 与普通实现写入一样受门禁，不能静默绕过。

## 两级匹配

### 1. 语言实体绑定

这是优先级最高的匹配方式。

| 语言 | 测试侧证据 | 实现侧身份 | 同名消歧边界 |
| --- | --- | --- | --- |
| PHP | `#[CoversClass(Foo::class)]`、`@covers`，解析 `use` 和 alias | `namespace` + class/interface/trait/enum/function | FQCN |
| Python | 被测试体实际使用的绝对 `from ... import ...` 或 `import ...`；`from package import lower_case_module` 同时按子模块解析；包重导出由当前仓库 `__init__.py` 的显式或 `*` 导入证明，目录镜像只能补充同名模块 | source root 后或包内的 module path + class/function | module + symbol |
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

Python 包内布局也保留完整包目录，例如 `lumen/geometry/tests/test_converter.py` 可以对应 `lumen/geometry/converter.py`，不能对应另一个包中的同名模块。

## 生效条件

测试文件必须同时满足：

- 相对当前 HEAD 是新文件、已修改或已删除（已经失败的历史测试除外：git 干净但观察到 RED 即可修实现）；
- HEAD 里已有对应测试时，授权必须落在那些路径上，本会话新建的另一份测试不算；
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

它核对的是：git 里对应测试是否相对 HEAD 变化（或已经失败并观察到 RED），以及测试命令回执是不是失败/成功。已有对应测试时，改的必须是那些文件，而不是另写一份新测试。普通文件工具、补丁、`rm` / `mv` 和常见重定向 Shell 的 source-first 跳步会被拦住。

它不核对断言对不对、覆盖够不够、失败是不是“正确原因”。Shell 检测只把 Python `open()` 的显式写入、追加、创建或更新模式视为写操作；默认只读 `open(path).read()` 不进入写门禁。两个文件如果声明了完全相同的 FQCN 或 package symbol，语言本身已经重复声明；插件按实体处理，不替代 autoload、编译器或静态分析。Rust 第一版仍只支持独立 `tests/*.rs`，同文件 `#[cfg(test)]` 区域不能建立跨工具调用的文件顺序。无 git HEAD 的工作区不能改实现。

## 验证

从 marketplace 根目录运行：

```bash
npx tsx --test plugins/test-driven-development/tests/*.test.ts
./scripts/acceptance/run.sh --plugin test-driven-development
```

live acceptance 由仓库脚本在 `docker/host-acceptance` 中运行。
