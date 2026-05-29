---
name: r2mo-rad-domain
description: R2MO Domain Intelligence Enhancer (AI Protocol)
version: 1.0.0
tags: [r2mo, rad, lain, protocol, natural-language]
repository: https://gitee.com/silentbalanceyh/r2mo-lain.git
---

# Role: R2MO Domain Expert

## 🚨 Critical Rules
1.  **Execution Mode**: You act as a direct processor. Do not generate script code. **Perform the analysis and file modifications directly.**
2.  **Path Resolution Logic**:
    - **Identify**: Read `pom.xml` in the current root -> Extract `<artifactId>` -> Set as **{PROJECT_ID}**.
    - **Locate**: Enter directory `./{PROJECT_ID}-ui/.r2mo/domain/`.
3.  **Enhancement Logic**:
    - **Read**: Scan all `.proto` files in the target directory.
    - **Translate**: Identify the main model name, translate its business meaning into Chinese, and append it as a comment.
    - **Infer**: Apply "Expert Experience" rules to field names.
    - **Rewrite**: Append semantic constraints as comments to the file content in-place.
4.  **Language Requirement**: All appended comments and constraints **MUST be in Simplified Chinese**.

## 📂 Architecture
- **Input**: Project `pom.xml` and Protobuf definitions.
- **Logic**: Semantic Inference Engine (Expert Knowledge Base).
- **Output**: Enhanced `.proto` files with Chinese business constraints.

## 💻 Executor Template(Native)

**[INSTRUCTION SET FOR AI AGENT]**

### STEP 1: CONTEXTUALIZATION
1.  **Find Project ID**:
    - Scan the current directory for `pom.xml`.
    - Extract the text content of the `<artifactId>` tag.
    - *Example*: If `<artifactId>shop</artifactId>`, then ID is `shop`.
2.  **Target Directory**:
    - Construct path: `{ID}-ui/.r2mo/domain/`.
    - If directory exists, proceed. If not, stop and report error.

### STEP 2: SEMANTIC ANALYSIS (The Expert Rules)

**Part A: Model Name Translation**
Identify the main `message` name in each file. Translate the English model name into appropriate business Chinese and append it to the message definition line.
* *Example*: `message MerchantAccount {` -> `message MerchantAccount { // [模型: 商户账户]`
* *Example*: `message OrderItem {` -> `message OrderItem { // [模型: 订单明细]`

**Part B: Field Constraint Inference**
Read every field definition. Analyze the **Field Name**. If it matches a pattern below, append the specific **Chinese Comment**:

| Field Name Pattern | Constraint Comment to Append (Chinese) |
| :--- | :--- |
| `email` | `// [格式: 邮箱]` |
| `phone`, `mobile` | `// [格式: 手机号]` |
| `password`, `secret` | `// [安全: 加密存储]` |
| `price`, `amount`, `cost` | `// [精度: 2位小数]` |
| `rate`, `ratio` | `// [精度: 4位小数]` |
| `status`, `type`, `state` | `// [枚举/常量]` (Check for Enum definitions) |
| `created_at`, `_time` | `// [格式: ISO8601]` |
| `is_...`, `active`, `enable` | `// [布尔: 0/1]` |
| `_id`, `_key` | `// [必填, 雪花/UUID]` |
| `name`, `title` | `// [长度: 64]` |
| `desc`, `content`, `remark` | `// [长度: 500/大字段]` |
| *(Repeated Field)* | `// [关系: 0..n]` |

### STEP 3: EXECUTION (Rewrite)
1.  **Modify**: Update the file content by adding the comments identified in Step 2.
    - *Constraint*: Do **NOT** change the `syntax`, `package`, `option`, field types, or field names. Only add comments at the end of lines.
2.  **Save**: Overwrite the files with the enhanced content.
3.  **Report**: List the files that were successfully enhanced.