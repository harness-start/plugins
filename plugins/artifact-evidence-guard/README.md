# Artifact Evidence Guard

`artifact-evidence-guard` 在 `Stop` 阶段按需校验最终回复中的 `artifact-evidence/v1` 代码块与当前工作区文件是否一致。它检查路径是否位于工作区内、目标是否为普通文件、字节数、SHA-256 摘要以及有限的格式签名。

没有证据块时插件不执行任何操作。格式错误、存在多个证据块、内容过大、文件不可读、路径不安全或观察期间发生变化时，插件只向 stderr 输出诊断并采用 fail-open。只有结构正确且与可确定观察结果冲突的声明才会阻断 `Stop`，包括路径不存在、符号链接、非普通文件、字节数不符、摘要不符或格式不符。

```artifact-evidence
{"schema":"artifact-evidence/v1","artifacts":[{"path":"dist/manual.pdf","bytes":1234,"sha256":"<64 lowercase hex characters>","format":"pdf"}]}
```

支持的格式有 `text`、`json`、`pdf`、`png`、`jpeg`、`zip` 和 `binary`。`binary` 只检查文件身份、大小和摘要，不声明原生格式。

## 设计与证据边界

每个条目必须给出一个工作区相对 POSIX 路径、字节数、小写 SHA-256 摘要和受支持格式。Hook 通过禁止跟随符号链接的文件句柄读取当前文件，再将实际字节与声明比较。

这条因果链只能证明：指定文件在有限检查期间存在，并且当时具有声明的字节。它不能证明设计质量、事实准确性、无障碍质量或发布就绪状态；具体产物仍须由相应插件和工程、发布契约负责。

## 验证

在 marketplace 根目录运行离线测试：

在 marketplace 根目录运行离线测试：

```bash
node --test plugins/artifact-evidence-guard/tests/*.test.mjs
```
