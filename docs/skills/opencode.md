# OpenCode mxt 命令

OpenCode 使用配置中的 command 模板调用 `mxt` 闭环命令。

## 安装记录

```bash
mxt ai-cmd
cat ~/.config/opencode/opencode.json
```

## 调用记录

```bash
/mxt:plan 001
/mxt:run 001
/mxt:end 001
/mxt:goon 001
/mxt:loop 001
/mxt:debug login fails
/mxt:sync
/mxt:start
```


## Skill 明细

- [mxt-plan](mxt-plan.md)
- [mxt-run](mxt-run.md)
- [mxt-end](mxt-end.md)
- [mxt-goon](mxt-goon.md)
- [mxt-loop](mxt-loop.md)
- [mxt-debug](mxt-debug.md)
- [mxt-sync](mxt-sync.md)
- [mxt-start](mxt-start.md)

## 配置源头

```bash
find agent/commands/opencode/mxt -maxdepth 3 -type f | sort
```
