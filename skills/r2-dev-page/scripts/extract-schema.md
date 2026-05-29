# R2MO Schema Extractor

从 `.r2mo/api/components/schemas/` 和 `.r2mo/domain/` 提取模块相关的数据模型定义。

## 功能

- 从 `.r2mo/api/components/schemas/` 提取 Markdown 格式的 Schema 定义
- 从 `.r2mo/domain/` 提取 Proto 格式的 Domain Model
- 支持模糊匹配文件名
- 自动查找项目根目录
- 生成统一的 `schemas.yaml` 文件

## 依赖

```bash
pip install pyyaml
```

## 使用方法

### 基本用法

```bash
# 在模块目录下运行
cd {module-dir}

# 提取包含 "user" 和 "role" 的 schemas
python {SKILL_ROOT}/scripts/extract-schema.py -m user -m role
```

### 高级用法

```bash
# 使用逗号分隔的模式
python extract-schema.py -m user,role,permission

# 指定输出文件
python extract-schema.py -m user -o custom-schemas.yaml

# 指定项目根目录
python extract-schema.py -m user --project-root /path/to/project

# 查看帮助
python extract-schema.py --help
```

## 参数说明

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--match` | `-m` | 匹配模式（可多次使用） | 必需 |
| `--output` | `-o` | 输出文件路径 | `schemas.yaml` |
| `--project-root` | 无 | 项目根目录路径 | 自动查找 |

## 匹配规则

脚本使用**模糊匹配**方式：

- 匹配模式会在文件名中进行**不区分大小写**的查找
- 例如：`-m user` 会匹配：
  - `user.md`
  - `user-profile.md`
  - `sys-user.md`
  - `user.proto`

## 输出示例

### 命令

```bash
python extract-schema.py -m user -m role
```

### 控制台输出

```
============================================================
🚀 R2MO Schema Extractor
============================================================
📁 自动查找项目根目录: /project

🔍 扫描 Schemas: /project/.r2mo/api/components/schemas
  ✓ 匹配: user.md
  ✓ 匹配: user-profile.md
  ✓ 匹配: role.md

🔍 扫描 Domain Models: /project/.r2mo/domain
  ✓ 匹配: user.proto
  ✓ 匹配: role.proto

✓ 找到 3 个 Schema (Markdown)
✓ 找到 2 个 Domain Model (Proto)

✅ 已保存到: schemas.yaml

🎉 完成！提取了 5 个数据模型
```

### 生成的 schemas.yaml

```yaml
schemas:
  user:
    source: .r2mo/api/components/schemas/user.md
    content: |
      # User Schema
      
      ## Properties
      - id: string
      - name: string
      - email: string
      ...
  
  user-profile:
    source: .r2mo/api/components/schemas/user-profile.md
    content: |
      # User Profile Schema
      ...
  
  role:
    source: .r2mo/api/components/schemas/role.md
    content: |
      # Role Schema
      ...

domain_models:
  user:
    source: .r2mo/domain/user.proto
    content: |
      syntax = "proto3";
      
      message User {
        string id = 1;
        string name = 2;
        ...
      }
  
  role:
    source: .r2mo/domain/role.proto
    content: |
      syntax = "proto3";
      
      message Role {
        string id = 1;
        string name = 2;
        ...
      }
```

## 集成到 metadata.yaml

在模块的 `metadata.yaml` 中配置：

```yaml
schema:
  store: [
    ".r2mo/api/components/schemas/{module}-*.md",
    ".r2mo/domain/{module}*.proto"
  ]
  extracted: "schemas.yaml"          # 提取的 schemas（由脚本生成）
  match: ["{module}"]                # 匹配模式
  marker: ".r2mo/api/marker.md"
```

## 工作流程

1. **项目初始化**
   - 确保 `.r2mo/api/components/schemas/` 存在并包含 Schema 定义
   - 确保 `.r2mo/domain/` 存在并包含 Proto 定义（可选）

2. **模块开发**
   - 在模块目录下运行提取脚本
   - 生成 `schemas.yaml` 供模块使用

3. **代码生成**
   - r2-dev-page 优先读取 `schemas.yaml`
   - 如不存在则回退到 `.r2mo/api/components/schemas/`

## 优势

- **性能优化**: 只提取模块相关的 schemas，减少解析时间
- **清晰明确**: 模块数据模型一目了然
- **自动化**: 一次配置，自动提取相关 schemas
- **灵活性**: 支持多种匹配模式和自定义输出

## 注意事项

1. **依赖**: 需要安装 PyYAML (`pip install pyyaml`)
2. **路径**: 默认自动查找项目根目录的 `.r2mo`
3. **匹配**: 模糊匹配可能会提取到非预期的 schemas，建议使用更具体的模式
4. **格式**: 支持 Markdown (`.md`) 和 Proto (`.proto`) 格式

## 故障排查

### 问题：找不到 .r2mo 目录

**解决**:
- 确保在正确的目录运行（模块目录或项目根目录）
- 或使用 `--project-root` 参数指定完整路径

### 问题：没有匹配到 Schema

**解决**:
- 检查匹配模式是否正确
- 尝试更宽泛的匹配模式
- 查看 `.r2mo/api/components/schemas/` 中的实际文件名

### 问题：输出文件过大

**解决**:
- 使用更精确的匹配模式
- 只提取当前模块需要的 schemas
- 检查是否匹配到了不相关的文件

## 示例场景

### 场景 1: 用户管理模块

```bash
cd modules/sys-admin
python ../../skills/r2-dev-page/scripts/extract-schema.py -m user -m role -m permission
```

### 场景 2: 订单管理模块

```bash
cd modules/order
python ../../skills/r2-dev-page/scripts/extract-schema.py -m order -m product -m payment
```

### 场景 3: 同时提取 API 和 Schema

```bash
cd modules/report

# 提取 API
python ../../skills/r2-dev-page/scripts/extract-api.py -m report -o api.yaml

# 提取 Schema
python ../../skills/r2-dev-page/scripts/extract-schema.py -m report -o schemas.yaml
```

## 与 extract-api.py 的配合使用

```bash
cd {module-dir}

# 1. 提取模块 API
python {SKILL_ROOT}/scripts/extract-api.py -m {pattern} -o api.yaml

# 2. 提取模块 Schema
python {SKILL_ROOT}/scripts/extract-schema.py -m {pattern} -o schemas.yaml

# 3. r2-dev-page 使用两者生成代码
# - api.yaml: API 客户端方法
# - schemas.yaml: 类型定义
```

## 版本历史

- **v1.0.0** (2026-02-06): 初始版本
  - 基本的 Schema 提取功能
  - 支持 Markdown 和 Proto 格式
  - 模糊匹配支持
  - 自动查找项目根目录

## 许可证

MIT License

