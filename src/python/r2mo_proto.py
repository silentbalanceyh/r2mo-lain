#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
R2MO Java to Protobuf Converter (V8 - Enhanced Comments & Constraints)
更新内容：
1. 【新增】从 @Schema(description) 中提取中文注释
2. 【新增】约束信息增强：长度、必填、数值范围等
3. 【优化】注释优先级：Schema description > JavaDoc > 行尾注释
4. 保留所有 V7 特性（自动导入、Enum 排序、BaseEntity 补全、注解提取、路径推导）
"""

import os
import re
import sys
import argparse
import xml.etree.ElementTree as ET

# ================= 1. 配置与映射表 =================

BASE_ENTITY_FIELDS = [
    {'name': 'key', 'type': 'string', 'label': '', 'comment': '主键'},
    {'name': 'active', 'type': 'bool', 'label': '', 'comment': '是否启用'},
    {'name': 'sigma', 'type': 'string', 'label': '', 'comment': '统一标识'},
    {'name': 'metadata', 'type': 'string', 'label': '', 'comment': '附加配置'},
    {'name': 'language', 'type': 'string', 'label': '', 'comment': '语言'},
    {'name': 'created_at', 'type': 'string', 'label': '', 'comment': '创建时间'},
    {'name': 'created_by', 'type': 'string', 'label': '', 'comment': '创建人'},
    {'name': 'updated_at', 'type': 'string', 'label': '', 'comment': '更新时间'},
    {'name': 'updated_by', 'type': 'string', 'label': '', 'comment': '更新人'},
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

def extract_constraints(lines):
    """
    从注解中提取约束信息，包括：
    1. 长度约束 (@Size, @Length)
    2. 数值约束 (@Max, @Min)
    3. 验证约束 (@NotNull, @NotBlank, @Email 等)
    4. Swagger 描述 (@Schema)
    """
    constraints = []
    block = " ".join(lines)
    
    # 提取 @Size / @Length 约束
    size = re.search(r'@(?:Size|Length)\((.*?)\)', block)
    if size: 
        size_str = size.group(1).replace(' ','').replace('"','')
        constraints.append(f"长度[{size_str}]")
    
    # 提取 @Max / @Min 约束
    for k in ['Max', 'Min']:
        val = re.search(fr'@{k}\(?\s*(?:value\s*=\s*)?(\d+)\s*\)?', block)
        if val: constraints.append(f"{k}:{val.group(1)}")
    
    # 提取验证约束
    for k, v in CONSTRAINT_MAPPING.items():
        if f'@{k}' in block: constraints.append(v)
    
    # 提取 @Schema 中的 description (中文注释)
    schema_desc = re.search(r'@Schema\([^)]*description\s*=\s*"([^"]+)"', block)
    if schema_desc:
        desc_text = schema_desc.group(1)
        # 如果包含中文，优先使用
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
    2. Getter 方法中的 JavaDoc 注释
    """
    fields = []
    imports = set() # 收集需要 import 的文件名

    if 'extends BaseEntity' in content:
        fields.extend(BASE_ENTITY_FIELDS)

    lines = content.split('\n')
    buf_anno, buf_doc = [], ""

    field_pat = re.compile(r'private\s+([\w<>?]+)\s+(\w+)\s*;')
    json_pat = re.compile(r'@JsonProperty\("([^"]+)"\)')
    # 匹配 Getter 方法的 JavaDoc: /** Getter for <code>ZDB.TABLE.FIELD</code>. 「fieldName」- 描述 */
    getter_doc_pat = re.compile(r'/\*\*\s*Getter for.*?[「」].*?[\u4e00-\u9fff]+.*?\*/', re.DOTALL)
    
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

            # 1. 命名
            final_name = camel_to_snake(raw_name)
            for anno in buf_anno:
                jp = json_pat.search(anno)
                if jp: final_name = jp.group(1); break

            # 2. 类型映射与依赖分析
            p_type, label, target_type_for_import = _map_java_type(j_type)

            # 【新增】依赖收集逻辑
            if target_type_for_import:
                import_file = f"{camel_to_snake(target_type_for_import)}.proto"
                imports.add(import_file)

            # 3. 注释和约束提取
            constraints, schema_desc = extract_constraints(buf_anno)
            
            # 提取行尾注释
            eol_cmt = lines[i].split('//')[1].strip() if '//' in lines[i] else ""
            
            # 优先级：Schema description (中文) > JavaDoc > 行尾注释
            if schema_desc:
                if constraints:
                    final_cmt = f"{schema_desc} [{', '.join(constraints)}]"
                else:
                    final_cmt = schema_desc
            else:
                con_str = f"[{', '.join(constraints)}]" if constraints else ""
                parts = [p for p in [con_str, eol_cmt, buf_doc] if p]
                final_cmt = " ".join(parts)

            fields.append({'name': final_name, 'type': p_type, 'label': label, 'comment': final_cmt})
            buf_anno, buf_doc = [], ""
    
    # 如果字段列表为空（可能是 jOOQ 风格），尝试从 Getter 方法提取
    if len(fields) <= len(BASE_ENTITY_FIELDS):
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
        field_name_camel = match.group(2)
        
        # 提取中文注释：「fieldName」- 描述
        chinese_match = re.search(r'[「」]([^」]+)[」][\s\-—]*([^*\n]+)', javadoc)
        if chinese_match:
            # field_label = chinese_match.group(1)  # 如 "id"
            description = chinese_match.group(2).strip()  # 如 "主键"
        else:
            # 回退：提取任何中文内容
            chinese_text = re.findall(r'[\u4e00-\u9fff]+', javadoc)
            description = ''.join(chinese_text) if chinese_text else ''
        
        # 字段名转换为 snake_case
        field_name = camel_to_snake(field_name_camel[0].lower() + field_name_camel[1:])
        
        # 类型映射
        p_type, label, _ = _map_java_type(j_type)
        
        fields.append({
            'name': field_name,
            'type': p_type,
            'label': label,
            'comment': description
        })
    
    return fields

def generate_proto(name, pkg, content, ftype):
    lines = [
        'syntax = "proto3";',
        'package domain;', ''
    ]

    # 只有 class 类型才需要 import
    imports = set()
    fields = []
    enum_items = []

    if ftype == 'enum':
        enum_items = parse_java_enum(content, name)
        if not enum_items: return None
    else:
        # 解析字段并获取依赖
        fields, imports = parse_java_class(content)
        if not fields: return None

        # 【新增】生成 import 语句
        # 排除自己引用自己
        self_import = f"{camel_to_snake(name)}.proto"
        if self_import in imports:
            imports.remove(self_import)

        if imports:
            sorted_imports = sorted(list(imports))
            for imp in sorted_imports:
                lines.append(f'import "{imp}";')
            lines.append('') # 空行分隔

    lines.append(f'// Generated from {pkg}.{name}')
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
            suf = f' // {f["comment"]}' if f["comment"] else ''
            lines.append(f'  {f["label"]}{f["type"]} {f["name"]} = {idx};{suf}')
        lines.append('}')

    return "\n".join(lines)

# ================= 4. 主程序 =================

def main():
    parser = argparse.ArgumentParser(description='R2MO Java-to-Proto (V8)')
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

    print(f"🚀 R2MO Proto Generator (V8)")
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

                        proto = generate_proto(name, pkg, content, ftype)
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