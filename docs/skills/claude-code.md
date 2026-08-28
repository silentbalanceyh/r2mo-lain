# Claude Code mxt 命令

Claude Code 使用 slash command 形式调用 `mxt` 闭环命令。

## 安装记录

```bash
mxt ai-cmd
claude plugin list
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

## 写回规则

- `plan` 只写 `task-NNN.md` 的 `## Plan`。
- `run` / `goon` 追加 `## Changes`。
- `end` 重写 `goon-NNN.md` 当前整改项。
