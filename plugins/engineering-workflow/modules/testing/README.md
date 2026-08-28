# 测试驱动开发守卫

> **Private AIO module.** This directory is not independently installable or published. Host manifests, Hook registration, and MCP exposure belong to the `engineering-workflow` owner. This module retains only its implementation, bundled methods and assets, tests, and acceptance material.

`test-driven-development` 是一个基于 Git HEAD 的 test-first 文件顺序守卫。它只做一件事：源码发生变化前，对应测试必须已经进入当前 Git 变更。

`SessionStart` 注入一段短提醒，让 agent 在第一次写实现前就知道这条顺序。`PreToolUse` 才是硬门禁。Hook 不解析测试命令，不判断 RED/GREEN，不保存会话状态，也不在 Stop 阶段阻止完成。真实的 RED → GREEN → REFACTOR 流程由插件内 Skill 指导，并由项目自己的测试命令验证。解析失败时会话提示 fail-open，实现写入仍 fail-closed。

## 目标

在源码首次变化前，要求对应测试已经作为当前 Git 变更的一部分存在，从文件顺序上保护 test-first seam。匹配既要支持多语言实体，也要避免只靠同名文件造成跨模块误授权。

## 实现

`SessionStart` 只提示方法，`PreToolUse` 基于 Git HEAD、工具写目标、测试内容和源码身份做硬判断。PHP、Python、JavaScript、TypeScript、Rust 与 Go 优先使用 FQCN、module/package、import 或 symbol 绑定；缺少显式实体时才退化为完整目录镜像。Skill 负责 RED → GREEN → REFACTOR 方法，Hook 不解析测试输出或签发完成回执。

## 规则

| 操作 | 允许 | 拒绝 |
| --- | --- | --- |
| 新建或修改源码 | 至少一个当前仍对应源码的测试已新建或相对 HEAD 修改 | 对应测试不存在，或全部仍与 HEAD 相同 |
| 删除源码 | HEAD 中对应的测试全部已经修改或删除 | 仍有对应历史测试未变化 |
| 回退源码 | 写回 HEAD 内容，或删除 HEAD 中不存在的新源码 | 无 |

同一个工具调用不能同时修改测试和源码。先单独修改测试，再修改实现。一个脏测试可以支持当前 Git 变更中的多次实现修正；Hook 不要求每次实现编辑前再次改测试。

没有 Git HEAD 时，源码变更会被拒绝。测试文件仍可写入，先创建初始提交后再修改实现。

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

```text
Write tests/Exception/InvalidArgumentExceptionTest.php
  -> 测试相对 HEAD 发生变化

Run PHPUnit and confirm RED
  -> agent 自己核对失败原因；Hook 不解析命令

Write src/Exception/InvalidArgumentException.php
  -> PreToolUse 匹配测试和实现身份并放行

Run PHPUnit and confirm GREEN
  -> 项目测试结果是完成证据；Hook 不提供完成回执
```

如果第一次实现仍未通过，可以继续修改同一实现，不必为了过门禁反复改测试。开始下一项行为变化时，应先补充或修改对应测试。

## 两级匹配

### 1. 语言实体绑定

这是优先级最高的匹配方式。

| 语言 | 测试侧证据 | 实现侧身份 | 同名消歧边界 |
| --- | --- | --- | --- |
| PHP | `#[CoversClass(Foo::class)]`、`@covers`，解析 `use` 和 alias | `namespace` + class/interface/trait/enum/function | FQCN |
| Python | 实际使用的绝对或包内相对 import；支持 `__init__.py` 显式重导出 | module path + class/function | module + symbol |
| JavaScript | 被测试体使用的相对 `import` / `require` | 解析后的相对文件路径 | module file path |
| TypeScript | 被测试体使用的相对 `import` / `require`，含 named/type alias | 解析后的相对文件路径 | module file path |
| Rust | 外部测试中的 `use crate_name::module::Item` | crate + module + item | crate + module + item |
| Go | 同 package symbol，或外部测试的 import alias + qualified symbol | module + package + symbol | module + package + symbol |

如果测试已经解析出显式实体，但实体与待写实现不相等，不再退化为同名匹配。

### 2. 完整目录镜像

没有显式实体证据时，测试路径必须保留实现的完整相对目录。测试根 `test/tests/spec/specs` 可映射到 `src/app/lib`，并可剥离 `Unit`、`Integration`、`Acceptance`、`Functional`、`Feature` 这一层。

```text
src/Service/OrderService.php
  -> tests/Service/OrderServiceTest.php           允许
  -> tests/Unit/Service/OrderServiceTest.php      允许
  -> tests/Unit/OrderServiceTest.php              拒绝
```

JS/TS 支持 colocated test 和 `__tests__`；Go 只认同一 package；Python 包内测试可对应同包兄弟模块。

## 生效条件

授权测试必须：

- 是新文件，或内容相对 HEAD 已修改；删除源码时，历史对应测试也可以已删除；
- 命中支持的测试路径或文件名；
- 包含真实测试函数或测试调用；
- 通过语言实体或完整目录镜像对应目标源码。

支持 PHP、Python、JavaScript、TypeScript、Rust 和 Go。默认忽略 `vendor/`、`node_modules/`、`.venv/`、`target/`、`dist/`、`build/`、`coverage/` 等依赖、缓存和生成目录。

## 效果边界

Hook 能证明的是：当前工具调用修改源码前，工作区已有对应的测试变化。它不能证明断言正确、测试真的运行过、失败原因正确或最终测试已通过。

文件工具、补丁、`rm` / `mv` 和常见 shell 写入都进入同一 PreToolUse 门禁。Hook 只能约束宿主可观察到的工具调用，不是操作系统沙箱。SessionStart 文案不是完成证据，也不替代这次门禁。

## 验证

从仓库根目录运行：

```bash
npx tsx --test plugins/test-driven-development/tests/**/*.test.ts
./scripts/acceptance/run.sh --plugin test-driven-development
```

live acceptance 由仓库脚本在 `docker/host-acceptance` 中运行。
