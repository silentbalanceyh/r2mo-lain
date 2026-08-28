# Codex mxt Skills

Codex 使用 plugin skill 形式调用 `mxt` 闭环命令。

## 安装记录

```bash
mxt ai-cmd
codex plugin list
codex debug prompt-input
```

## 调用记录

```bash
$mxt-plan 001
$mxt-run 001
$mxt-end 001
$mxt-goon 001
$mxt-loop 001
$mxt-debug login fails
$mxt-sync
$mxt-start
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

## Skill 源头

```bash
find agent/commands/codex/mxt/skills -maxdepth 2 -name SKILL.md | sort
```
