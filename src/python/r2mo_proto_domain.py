#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
R2MO Java Domain to Protobuf Converter (V11 - Shared .r2mo/repo & Note Properties)
从 Java Domain 实体类生成 Protobuf 文件
更新内容：
1. 【共享】与 mxt mmr0/mmr2 共用 .r2mo/repo 仓库；mxt domain 执行前会克隆/更新该仓库
2. 【检索】在仓库中按 message 名称（如 XApp）查找对应 XApp.md 文件
3. 【注释】将文档头部的笔记属性（front-matter）完整追加到 message 的注释中（首行主描述，其余 key: value）
4. 【保留】Java 属性名 [Java:xxx]、约束规范化、V9/V10 特性
"""

import os
import re
import sys
import argparse
import xml.etree.ElementTree as ET
import yaml

# ================= 1. 配置与映射表 =================

# BaseEntity 公共字段：proto 名、类型、Java 属性名（驼峰）、中文描述
BASE_ENTITY_FIELDS = [
    {'name': 'key', 'type': 'string', 'label': '', 'comment': '主键', 'java_name': 'id'},
    {'name': 'active', 'type': 'bool', 'label': '', 'comment': '是否启用', 'java_name': 'active'},
    {'name': 'sigma', 'type': 'string', 'label': '', 'comment': '统一标识', 'java_name': 'sigma'},
    {'name': 'metadata', 'type': 'string', 'label': '', 'comment': '附加配置', 'java_name': 'metadata'},
    {'name': 'language', 'type': 'string', 'label': '', 'comment': '语言', 'java_name': 'language'},
    {'name': 'created_at', 'type': 'string', 'label': '', 'comment': '创建时间', 'java_name': 'createdAt'},
    {'name': 'created_by', 'type': 'string', 'label': '', 'comment': '创建人', 'java_name': 'createdBy'},
    {'name': 'updated_at', 'type': 'string', 'label': '', 'comment': '更新时间', 'java_name': 'updatedAt'},
    {'name': 'updated_by', 'type': 'string', 'label': '', 'comment': '更新人', 'java_name': 'updatedBy'},
]

# 基础类型映射
TYPE_MAPPING = {
    'String': 'string', 'Integer': 'int32', 'int': 'int32',
    'Long': 'int64', 'long': 'int64', 'Boolean': 'bool', 'boolean': 'bool',
    'Double': 'double', 'double': 'double', 'Float': 'float', 'float': 'float',
    'BigDecimal': 'string', 'LocalDateTime': 'string', 'LocalDate': 'string',
    'LocalTime': 'string', 'Date': 'string', 'UUID': 'string',
    'JsonObject': 'string', 'JsonArray': 'string'
}

CONSTRAINT_MAPPING = {
    'NotNull': '必填', 'NotBlank': '必填', 'NotEmpty': '必填',
    'Deprecated': '已废弃', 'Email': '邮箱格式', 'Phone': '手机号格式'
}

# ================= 2. 辅助函数 =================

def get_project_name():
    if os.path.exists('pom.xml'):
        try:
            tree = ET.parse('pom.xml')
            root = tree.getroot()
            ns = re.match(r'\{.*\}', root.tag)
            ns_map = { 'mvn': ns.group(0).strip('{}') } if ns else {}
            if ns:
                aid = root.find(f"{{{ns_map['mvn']}}}artifactId")
            else:
                aid = root.find('artifactId')
            if aid is not None: return aid.text
        except Exception: pass
    return os.path.basename(os.getcwd())

def camel_to_snake(name):
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()

def get_package_name(content):
    match = re.search(r'package\s+([\w\.]+);', content)
    return match.group(1) if match else "domain"


def _read_md_front_matter(md_path):
    """只提取 .md 文件头部 front-matter，返回 (attrs dict, 文件名) 或 (None, None)。"""
    if not os.path.isfile(md_path):
        return None, None
    try:
        with open(md_path, 'r', encoding='utf-8') as fp:
            content = fp.read()
        m = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
        if m:
            attrs = yaml.safe_load(m.group(1))
            if isinstance(attrs, dict):
                return attrs, os.path.basename(md_path)
    except Exception:
        pass
    return None, None


def _find_doc_for_java(message_name, java_file_path, project_root):
    """
    查找与 Java 类对应的 .md 文档，只提取头部 front-matter。
    1）优先：与 Java 同目录的同名 .md（如 Order.java 同目录的 Order.md）
    2）回退：.r2mo/repo/r2mo-spec 中 {message_name}.md 或去掉 Entity 的 {name}.md
    返回: (front-matter dict, 命中的文件名) 或 (None, None)
    """
    # 1）与 Java 同目录的 {ClassName}.md
    if java_file_path and os.path.isfile(java_file_path):
        same_dir = os.path.dirname(java_file_path)
        same_dir_md = os.path.join(same_dir, f'{message_name}.md')
        attrs, found = _read_md_front_matter(same_dir_md)
        if attrs and found:
            return attrs, found
    # 2）.r2mo/repo/r2mo-spec
    repo_path = os.path.join(project_root, '.r2mo', 'repo', 'r2mo-spec')
    if not os.path.isdir(repo_path):
        return None, None
    candidates = [f'{message_name}.md']
    if message_name.endswith('Entity'):
        candidates.append(f'{message_name[:-6]}.md')
    for root, dirs, files in os.walk(repo_path):
        for f in files:
            if f.lower() in [c.lower() for c in candidates]:
                md_file = os.path.join(root, f)
                attrs, _ = _read_md_front_matter(md_file)
                if attrs:
                    return attrs, os.path.basename(md_file)
    return None, None


def _build_message_comment(attrs):
    """
    将文档头部的所有 front-matter 属性解析到注释中，每个属性一行，格式为 key: value。
    """
    if not attrs or not isinstance(attrs, dict):
        return []
    lines = []
    for k, v in attrs.items():
        if v is None or v == '':
            continue
        if isinstance(v, (list, dict)):
            v = str(v)[:80]
        lines.append(f"{k}: {v}")
    return lines

def extract_constraints(lines):
    """
    从注解中提取约束信息（规范化格式），包括：
    1. 长度约束 (@Size, @Length)
    2. 数值约束 (@Max, @Min, @DecimalMax, @DecimalMin)
    3. 验证约束 (@NotNull, @NotBlank, @NotEmpty, @Email, @Pattern 等)
    4. Swagger 描述 (@Schema, @ApiModelProperty)
    """
    constraints = []
    block = " ".join(lines)
    
    # 提取 @Size / @Length 约束（规范化格式）
    size = re.search(r'@(?:Size|Length)\(([^)]*)\)', block)
    if size:
        params = size.group(1)
        min_v = re.search(r'min\s*=\s*(\d+)', params)
        max_v = re.search(r'max\s*=\s*(\d+)', params)
        if min_v and max_v:
            constraints.append(f"长度:{min_v.group(1)}-{max_v.group(1)}")
        elif min_v:
            constraints.append(f"最小长度:{min_v.group(1)}")
        elif max_v:
            constraints.append(f"最大长度:{max_v.group(1)}")
    
    # 提取数值约束（规范化）
    for ann_name, cn_name in [('Max', '最大值'), ('Min', '最小值'), 
                               ('DecimalMax', '最大值'), ('DecimalMin', '最小值')]:
        val = re.search(fr'@{ann_name}\(?\s*(?:value\s*=\s*)?["\']?([0-9.]+)["\']?\s*\)?', block)
        if val:
            constraints.append(f"{cn_name}:{val.group(1)}")
    
    # 提取验证约束（规范化）
    for k, v in CONSTRAINT_MAPPING.items():
        if f'@{k}' in block:
            constraints.append(v)
    
    # 提取 @Pattern 正则约束
    pattern = re.search(r'@Pattern\([^)]*regexp\s*=\s*"([^"]+)"', block)
    if pattern:
        constraints.append(f"格式:{pattern.group(1)[:30]}")  # 截断过长正则
    
    # 提取 @Schema 或 @ApiModelProperty 中的 description (中文注释)
    schema_desc = re.search(r'@(?:Schema|ApiModelProperty)\([^)]*(?:description|value)\s*=\s*"([^"]+)"', block)
    if schema_desc:
        desc_text = schema_desc.group(1)
        # 优先使用包含中文的描述
        if re.search(r'[\u4e00-\u9fff]', desc_text):
            return constraints, desc_text
    
    return constraints, None

# ================= 3. 解析逻辑 =================

def parse_java_enum(content, class_name):
    start_match = re.search(r'public\s+enum\s+\w+\s*\{', content)
    if not start_match: return []

    start_idx = start_match.end()
    end_idx = content.find(';', start_idx)
    if end_idx == -1: end_idx = content.rfind('}')

    body = content[start_idx:end_idx]
    body = re.sub(r'//.*', '', body)
    body = re.sub(r'/\*.*?\*/', '', body, flags=re.DOTALL)

    raw_items = body.split(',')
    enum_items = []
    auto_idx = 0

    for item in raw_items:
        item = item.strip()
        if not item: continue

        name_match = re.match(r'([A-Z0-9_]+)', item)
        if not name_match: continue
        name = name_match.group(1)

        val_match = re.search(r'\(\s*(\d+)', item)
        if val_match:
            val = int(val_match.group(1))
        else:
            val = auto_idx
            auto_idx += 1

        enum_items.append({'name': name, 'value': val})

    enum_items.sort(key=lambda x: x['value'])
    if not enum_items or enum_items[0]['value'] != 0:
        prefix = camel_to_snake(class_name).upper()
        enum_items.insert(0, {'name': f"{prefix}_UNSPECIFIED", 'value': 0})

    return enum_items

def parse_java_class(content):
    """
    解析 Class，返回 (字段列表, 依赖导入集合)
    支持两种模式：
    1. 字段声明上的注解和注释
    2. Getter 方法中的 JavaDoc 注释（jOOQ 风格）
    """
    fields = []
    imports = set()

    if 'extends BaseEntity' in content:
        fields.extend(BASE_ENTITY_FIELDS)

    lines = content.split('\n')
    buf_anno, buf_doc = [], ""

    field_pat = re.compile(r'private\s+([\w<>?]+)\s+(\w+)\s*;')
    json_pat = re.compile(r'@JsonProperty\("([^"]+)"\)')
    
    # 首先尝试从字段声明处理（带注解的方式）
    for i, line in enumerate(lines):
        line_stripped = line.strip()
        if not line_stripped: continue

        if line_stripped.startswith('/**'):
            buf_doc = re.sub(r'/\*\*|\*/|\*', '', line_stripped).strip()
            continue
        if line_stripped.startswith('*'):
            clean = line_stripped.replace('*', '').strip()
            if clean and clean != '/': buf_doc += " " + clean
            continue
        if line_stripped.startswith('@'):
            buf_anno.append(line_stripped)
            continue
        if 'static final' in line_stripped:
            buf_anno, buf_doc = [], ""
            continue

        match = field_pat.search(line)
        if match:
            j_type, raw_name = match.group(1), match.group(2)

            # 1. 命名：转为 snake_case
            final_name = camel_to_snake(raw_name)
            for anno in buf_anno:
                jp = json_pat.search(anno)
                if jp: final_name = jp.group(1); break

            # 2. 类型映射与依赖分析
            p_type, label, target_type_for_import = _map_java_type(j_type)

            # 依赖收集逻辑
            if target_type_for_import:
                import_file = f"{camel_to_snake(target_type_for_import)}.proto"
                imports.add(import_file)

            # 3. 注释和约束提取
            constraints, schema_desc = extract_constraints(buf_anno)
            
            # 提取行尾注释
            eol_cmt = lines[i].split('//')[1].strip() if '//' in lines[i] else ""
            
            # 优先级：Schema description (中文) > JavaDoc > 行尾注释
            if schema_desc:
                base_desc = schema_desc
            elif buf_doc:
                base_desc = buf_doc
            elif eol_cmt:
                base_desc = eol_cmt
            else:
                base_desc = ""
            
            # **追加 Java 属性名（大小写敏感）到注释开头**
            java_field_hint = f"[Java:{raw_name}]"
            
            # 构建最终注释：Java属性名 + 描述 + 约束
            if base_desc and constraints:
                final_cmt = f"{java_field_hint} {base_desc} ({', '.join(constraints)})"
            elif base_desc:
                final_cmt = f"{java_field_hint} {base_desc}"
            elif constraints:
                final_cmt = f"{java_field_hint} ({', '.join(constraints)})"
            else:
                final_cmt = java_field_hint

            fields.append({'name': final_name, 'type': p_type, 'label': label, 'comment': final_cmt})
            buf_anno, buf_doc = [], ""
    
    # 如果字段列表为空、只有 BaseEntity，或大部分字段无注释（jOOQ 风格），尝试从 Getter 提取
    has_meaningful_comments = sum(1 for f in fields if f.get('comment') and f.get('comment').strip()) > len(fields) * 0.5
    
    if len(fields) <= len(BASE_ENTITY_FIELDS) or not has_meaningful_comments:
        fields_from_getters = _extract_fields_from_getters(content)
        if fields_from_getters:
            # 清空字段，重新从 getter 提取
            fields = []
            if 'extends BaseEntity' in content or 'implements VertxPojo' in content:
                fields.extend(BASE_ENTITY_FIELDS)
            fields.extend(fields_from_getters)

    return fields, imports

def _map_java_type(j_type):
    """映射 Java 类型到 Proto 类型"""
    p_type = j_type
    label = ""
    target_type_for_import = None

    if j_type.startswith("List<"):
        label = "repeated "
        inner = re.search(r'List<(\w+)>', j_type)
        if inner:
            inner_type = inner.group(1)
            if inner_type in TYPE_MAPPING:
                p_type = TYPE_MAPPING[inner_type]
            else:
                p_type = inner_type
                target_type_for_import = inner_type
    else:
        if j_type in TYPE_MAPPING:
            p_type = TYPE_MAPPING[j_type]
        else:
            p_type = j_type
            target_type_for_import = j_type
    
    return p_type, label, target_type_for_import

def _extract_fields_from_getters(content):
    """
    从 Getter 方法中提取字段信息（用于 jOOQ 生成的代码）
    匹配格式： /** Getter for <code>ZDB.TABLE.FIELD</code>. 「fieldName」- 描述 */
    返回字段时附带 Java 属性名
    """
    fields = []
    
    # 匹配 getter 方法及其 JavaDoc
    getter_pattern = re.compile(
        r'/\*\*\s*Getter for[^*]*?\*/'  # JavaDoc
        r'\s*@Override\s*'               # @Override
        r'public\s+([\w<>?]+)\s+get(\w+)\(\)',  # 方法签名
        re.DOTALL
    )
    
    for match in getter_pattern.finditer(content):
        javadoc = match.group(0)
        j_type = match.group(1)
        field_name_camel = match.group(2)  # 如 CreatedAt
        
        # 提取 Java 属性名（getter 去掉 get 后首字母小写）
        java_prop_name = field_name_camel[0].lower() + field_name_camel[1:] if field_name_camel else field_name_camel
        
        # 提取中文注释：「fieldName」- 描述
        chinese_match = re.search(r'[「」]([^」]+)[」][\s\-—]*([^*\n]+)', javadoc)
        if chinese_match:
            description = chinese_match.group(2).strip()  # 如 "主键"
        else:
            # 回退：提取任何中文内容
            chinese_text = re.findall(r'[\u4e00-\u9fff]+', javadoc)
            description = ''.join(chinese_text) if chinese_text else ''
        
        # 字段名转换为 snake_case
        field_name = camel_to_snake(java_prop_name)
        
        # 类型映射
        p_type, label, _ = _map_java_type(j_type)
        
        # **追加 Java 属性名**
        java_field_hint = f"[Java:{java_prop_name}]"
        final_comment = f"{java_field_hint} {description}" if description else java_field_hint
        
        fields.append({
            'name': field_name,
            'type': p_type,
            'label': label,
            'comment': final_comment
        })
    
    return fields

def generate_proto(name, pkg, content, ftype, java_file_path=None):
    lines = [
        'syntax = "proto3";',
        'package domain;', ''
    ]

    imports = set()
    fields = []
    enum_items = []

    if ftype == 'enum':
        enum_items = parse_java_enum(content, name)
        if not enum_items: return None
    else:
        fields, imports = parse_java_class(content)
        if not fields: return None

        self_import = f"{camel_to_snake(name)}.proto"
        if self_import in imports:
            imports.remove(self_import)

        if imports:
            sorted_imports = sorted(list(imports))
            for imp in sorted_imports:
                lines.append(f'import "{imp}";')
            lines.append('')

    lines.append(f'// Generated from {pkg}.{name}')
    
    # 先查与 Java 同目录的同名 .md，再查 .r2mo/repo；只提取头部 front-matter，找到才打印
    project_root = os.getcwd()
    doc_attrs, found_md = _find_doc_for_java(name, java_file_path, project_root)
    if doc_attrs and found_md:
        for comment_line in _build_message_comment(doc_attrs):
            if comment_line:
                lines.append(f'// {comment_line}')
        print(f"   ✓ {name}: 已从 {found_md} 追加笔记属性到注释")
    
    lines.append(f'option java_package = "{pkg}";')
    lines.append('option java_multiple_files = true;')
    lines.append('')

    if ftype == 'enum':
        lines.append(f'enum {name} {{')
        for i in enum_items: lines.append(f'  {i["name"]} = {i["value"]};')
        lines.append('}')
    else:
        lines.append(f'message {name} {{')
        for idx, f in enumerate(fields, 1):
            comment_str = f.get("comment") or ""
            if f.get("java_name"):
                comment_str = f"[Java:{f['java_name']}] {comment_str}".strip() if comment_str else f"[Java:{f['java_name']}]"
            suf = f' // {comment_str}' if comment_str else ''
            lines.append(f'  {f["label"]}{f["type"]} {f["name"]} = {idx};{suf}')
        lines.append('}')

    return "\n".join(lines)

# ================= 4. 主程序 =================

def main():
    parser = argparse.ArgumentParser(description='R2MO Java-to-Proto (V8 - Domain Mode)')
    parser.add_argument('-i', '--input', help='指定输入目录')
    parser.add_argument('-o', '--output', help='指定输出目录')
    args = parser.parse_args()

    cwd = os.getcwd()
    project_name = get_project_name()

    if args.input: input_dir = os.path.abspath(args.input)
    else: input_dir = os.path.join(cwd, f"{project_name}-domain")

    if args.output: output_dir = os.path.abspath(args.output)
    else: output_dir = os.path.join(cwd, f"{project_name}-ui", ".r2mo", "domain")

    if not os.path.exists(input_dir):
        if f"{project_name}-domain" in cwd: input_dir = cwd
        else:
             print(f"❌ 输入目录不存在: {input_dir}"); sys.exit(1)

    if not os.path.exists(output_dir): os.makedirs(output_dir)

    print(f"🚀 R2MO Proto Generator (V9 - Domain Mode)")
    print(f"   In:  {input_dir}")
    print(f"   Out: {output_dir}")
    print("-" * 40)

    count = 0
    for root, dirs, files in os.walk(input_dir):
        for f in files:
            if f.endswith(".java") and f != "BaseEntity.java":
                path = os.path.join(root, f)
                try:
                    with open(path, 'r', encoding='utf-8') as fh: content = fh.read()

                    is_enum = 'public enum' in content
                    match = re.search(r'public\s+(class|enum)\s+(\w+)', content)

                    if match:
                        name = match.group(2)
                        pkg = get_package_name(content)
                        ftype = 'enum' if is_enum else 'class'

                        proto = generate_proto(name, pkg, content, ftype, java_file_path=path)
                        if proto:
                            out_name = f"{camel_to_snake(name)}.proto"
                            with open(os.path.join(output_dir, out_name), 'w') as fh: fh.write(proto)
                            count += 1
                            print(f"✅ {name} -> {out_name}")
                except Exception as e:
                    print(f"⚠️  Skip {f}: {e}")

    print("-" * 40)
    print(f"🎉 处理完成: {count} 个文件")

if __name__ == "__main__":
    main()
