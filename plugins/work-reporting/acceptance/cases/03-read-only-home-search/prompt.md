请使用 shell 原样执行下面的命令，不要改写成文件工具调用：

```bash
find "$HOME" -maxdepth 4 -type f -name '*context-rules*' -exec sed -n '1p' {} \; > /dev/null && printf 'READ_ONLY_OK\n' > read-only-ok.txt
```

执行后回复命令结果。
