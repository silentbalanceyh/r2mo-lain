# R2MO API Extractor

从 OpenAPI metadata.yaml 中提取模块相关的 API 定义。

## 功能

- 从大型 `.r2mo/api/metadata.yaml` 中提取指定模式的 API
- 自动提取关联的 Schema 定义
- 生成精简的模块级 `api.yaml`
- 支持模糊匹配路径
- 减少 API 解析开销，提高开发效率

## 安装依赖

```bash
pip install pyyaml
```

或使用 requirements.txt:

```bash
pip install -r requirements.txt
```

## 使用方法

### 基本用法

```bash
# 在模块目录下运行
cd {module-dir}

# 提取包含 "user" 和 "role" 的 API
python ../../../skills/r2-dev-page/scripts/extract-api.py -m user -m role
```

### 高级用法

```bash
# 指定输出文件
python extract-api.py -m user -m role -o custom-api.yaml

# 使用逗号分隔的模式
python extract-api.py -m user,role,permission

# 指定 metadata.yaml 路径
python extract-api.py -m user --metadata /path/to/metadata.yaml

# 查看帮助
python extract-api.py --help
```

## 参数说明

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--match` | `-m` | 匹配模式（可多次使用） | 必需 |
| `--output` | `-o` | 输出文件路径 | `api.yaml` |
| `--metadata` | 无 | metadata.yaml 文件路径 | 自动查找 |

## 匹配规则

脚本使用**模糊匹配**方式：

- 匹配模式会在 API 路径中进行**不区分大小写**的查找
- 例如：`-m user` 会匹配：
  - `/api/users`
  - `/api/users/{id}`
  - `/api/user-profiles`
  - `/api/system/user-management`

## 输出示例

### 命令

```bash
python extract-api.py -m user -m role
```

### 控制台输出

```
============================================================
🚀 R2MO API Extractor
============================================================
📁 自动查找: /project/.r2mo/api/metadata.yaml
✓ 已加载: /project/.r2mo/api/metadata.yaml

🔍 提取 Paths (匹配: user, role)...
  ✓ 匹配: /api/users
  ✓ 匹配: /api/users/{id}
  ✓ 匹配: /api/roles
  ✓ 匹配: /api/roles/{id}

✓ 找到 4 个路径

🔍 提取关联的 Schemas...
  ✓ Schema: User
  ✓ Schema: Role
  ✓ Schema: UserQuery

✓ 找到 3 个 Schema

✅ 已保存到: api.yaml

🎉 完成！提取了 4 个 API
```

### 生成的 api.yaml

```yaml
openapi: 3.0.0
info:
  title: Module API (user, role)
  version: 1.0.0
  description: 从 metadata.yaml 提取的模块 API 定义
paths:
  /api/users:
    get:
      summary: 获取用户列表
      # ...
  /api/users/{id}:
    get:
      summary: 获取用户详情
      # ...
  /api/roles:
    get:
      summary: 获取角色列表
      # ...
  /api/roles/{id}:
    get:
      summary: 获取角色详情
      # ...
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        # ...
    Role:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        # ...
    UserQuery:
      type: object
      properties:
        # ...
```

## 集成到 metadata.yaml

在模块的 `metadata.yaml` 中配置：

```yaml
api:
  source: ".r2mo/api/metadata.yaml"      # OpenAPI 完整定义
  extracted: "api.yaml"                  # 提取的模块 API（由脚本生成）
  match: ["user", "role"]                # 匹配模式
```

## 工作流程

1. **项目初始化**
   - 确保 `.r2mo/api/metadata.yaml` 存在并包含完整的 OpenAPI 定义

2. **模块开发**
   - 在模块目录下运行提取脚本
   - 生成 `api.yaml` 供模块使用

3. **代码生成**
   - r2-dev-page 优先读取 `api.yaml`
   - 如不存在则回退到 `.r2mo/api/metadata.yaml`

## 优势

- **性能优化**: 只解析模块相关的 API，减少解析时间
- **清晰明确**: 模块 API 一目了然，便于开发和维护
- **自动化**: 一次配置，自动提取所需 API 和 Schema
- **灵活性**: 支持多种匹配模式和自定义输出

## 注意事项

1. **依赖**: 需要安装 PyYAML (`pip install pyyaml`)
2. **路径**: 默认自动查找项目根目录的 `.r2mo/api/metadata.yaml`
3. **匹配**: 模糊匹配可能会提取到非预期的 API，建议使用更具体的模式
4. **Schema**: 只提取被引用的 Schema，未被使用的不会包含在输出中

## 故障排查

### 问题：找不到 metadata.yaml

**解决**:
- 确保在正确的目录运行（模块目录或项目根目录）
- 或使用 `--metadata` 参数指定完整路径

### 问题：没有匹配到 API

**解决**:
- 检查匹配模式是否正确
- 尝试更宽泛的匹配模式（如 `-m api`）
- 查看 metadata.yaml 中的实际路径

### 问题：缺少 Schema

**解决**:
- 脚本只提取被 API 引用的 Schema
- 如果 Schema 未被引用，不会包含在输出中
- 检查 metadata.yaml 中的 `$ref` 引用是否正确

## 示例场景

### 场景 1: 用户管理模块

```bash
cd modules/sys-admin
python ../../skills/r2-dev-page/scripts/extract-api.py -m user -m role -m permission
```

### 场景 2: 订单管理模块

```bash
cd modules/order
python ../../skills/r2-dev-page/scripts/extract-api.py -m order -m product -m payment
```

### 场景 3: 报表模块

```bash
cd modules/report
python ../../skills/r2-dev-page/scripts/extract-api.py -m report -m chart -m export
```

## 版本历史

- **v1.0.0** (2026-02-06): 初始版本
  - 基本的 API 提取功能
  - 自动 Schema 提取
  - 模糊匹配支持
  - 自动查找 metadata.yaml

## 许可证

MIT License

