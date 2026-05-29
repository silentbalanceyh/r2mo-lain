#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
R2MO SQL to Protobuf Converter (V4 - Shared .r2mo/repo & Note Properties)
从 Flyway SQL 脚本生成 Protobuf 文件
更新内容：
1. 【共享】与 mxt mmr0/mmr2/domain 共用 .r2mo/repo 仓库；按 message 名称检索 XApp.md
2. 【注释】将文档头部的笔记属性（front-matter）完整追加到 message 的注释中（与 domain 一致）
3. 【保留】中文注释「javaProperty」- 描述、[Java:xxx]、约束规范化等 V3 特性
"""

import os
import re
import sys
import argparse
import yaml

# ================= 1. 配置与映射表 =================

# SQL 类型映射到 Proto 类型
SQL_TYPE_MAPPING = {
    'VARCHAR': 'string', 'CHAR': 'string', 'TEXT': 'string', 'LONGTEXT': 'string',
    'TINYTEXT': 'string', 'MEDIUMTEXT': 'string',
    'INT': 'int32', 'INTEGER': 'int32', 'TINYINT': 'int32', 'SMALLINT': 'int32',
    'BIGINT': 'int64', 'LONG': 'int64',
    'FLOAT': 'float', 'DOUBLE': 'double', 'DECIMAL': 'string',
    'DATETIME': 'string', 'TIMESTAMP': 'string', 'DATE': 'string', 'TIME': 'string',
    'BIT': 'bool', 'BOOLEAN': 'bool',
    'BLOB': 'bytes', 'LONGBLOB': 'bytes', 'MEDIUMBLOB': 'bytes', 'TINYBLOB': 'bytes'
}

# ================= 2. 辅助函数 =================

def camel_to_snake(name):
    """驼峰转蛇形"""
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()

def snake_to_pascal(name):
    """蛇形转帕斯卡"""
    return ''.join(word.capitalize() for word in name.split('_'))

def _snake_to_camel(name):
    """蛇形转驼峰：tenant_id -> tenantId"""
    parts = name.lower().split('_')
    return parts[0] + ''.join(p.capitalize() for p in parts[1:])

def extract_sql_type(type_def):
    """
    从 SQL 类型定义中提取基础类型
    例如: VARCHAR(255) -> VARCHAR, INT(11) -> INT
    """
    match = re.match(r'([A-Z]+)', type_def.upper())
    return match.group(1) if match else 'VARCHAR'


def _find_repo_doc(message_name, project_root):
    """
    从 .r2mo/repo/r2mo-spec 仓库中查找 {message_name}.md 文档。
    返回: (front-matter dict, 命中的文件名) 或 (None, None)
    """
    repo_path = os.path.join(project_root, '.r2mo', 'repo', 'r2mo-spec')
    if not os.path.isdir(repo_path):
        return None, None
    for root, dirs, files in os.walk(repo_path):
        for f in files:
            if f.lower() == f'{message_name.lower()}.md':
                md_file = os.path.join(root, f)
                try:
                    with open(md_file, 'r', encoding='utf-8') as fp:
                        content = fp.read()
                    m = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
                    if m:
                        yaml_text = m.group(1)
                        attrs = yaml.safe_load(yaml_text)
                        if isinstance(attrs, dict):
                            return attrs, os.path.basename(md_file)
                except Exception:
                    pass
    return None, None


def _build_message_comment(attrs):
    """
    将文档头部的所有 front-matter 属性解析到注释中，每个属性一行，格式为 key: value。
    与 r2mo_proto_domain 保持一致。
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

def extract_comment_parts(comment):
    """
    从 COMMENT 提取：Java属性名（「xxx」）、中文描述（- 后面的内容）
    格式: '「fieldName」- 描述'，支持全角「」与半角
    返回: (java_prop, desc)
    """
    java_prop = ''
    desc = ''
    if not comment:
        return java_prop, desc
    # 全角括号 U+300C/U+300D 或 半角
    java_prop_m = re.search(r'[「\u300c]([^」\u300d]+)[」\u300d]', comment)
    if java_prop_m:
        java_prop = java_prop_m.group(1).strip()
    # 描述：」或）后面 -/— 之后到结尾，去尾逗号/空格
    desc_m = re.search(r'[」\u300d]\s*[-—]\s*(.+)', comment)
    if desc_m:
        desc = desc_m.group(1).strip().rstrip(',').strip()
    if not desc:
        chinese = re.findall(r'[\u4e00-\u9fff]+', comment)
        desc = ''.join(chinese) if chinese else ''
    return java_prop, desc


def _extract_field_block(sql_content):
    """提取 CREATE TABLE 后括号内的字段定义块（含括号匹配）。"""
    start = re.search(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`\']?\w+[`\']?\s*\(', sql_content, re.IGNORECASE)
    if not start:
        return None
    i = start.end() - 1  # 指向 '('
    depth = 0
    begin = None
    for j in range(i, len(sql_content)):
        c = sql_content[j]
        if c == '(':
            depth += 1
            if begin is None:
                begin = j + 1
        elif c == ')':
            depth -= 1
            if depth == 0:
                return sql_content[begin:j]
    return None


def parse_create_table(sql_content):
    """
    解析 CREATE TABLE 语句（逐行解析字段，支持 COMMENT 与约束）
    返回: {
        'table_name': '表名',
        'fields': [{'name': '字段名', 'type': 'proto类型', 'comment': '注释（含Java属性名）'}, ...]
    }
    """
    table_match = re.search(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`\']?(\w+)[`\']?', sql_content, re.IGNORECASE)
    if not table_match:
        return None
    
    table_name = table_match.group(1)
    field_block = _extract_field_block(sql_content)
    if not field_block:
        return None
    
    # 去掉多行注释 /* ... */，避免干扰行解析
    field_block = re.sub(r'/\*.*?\*/', '', field_block, flags=re.DOTALL)
    
    fields = []
    for raw_line in field_block.split('\n'):
        line = raw_line.strip()
        if not line or line.startswith('--'):
            continue
        # 跳过索引定义行
        if re.match(r'^(PRIMARY\s+KEY|UNIQUE\s+KEY|KEY|INDEX)\s', line, re.IGNORECASE):
            continue
        
        # 必须包含反引号字段名和 COMMENT
        if '`' not in line or 'COMMENT' not in line.upper():
            continue
        
        # 字段名: 第一个 `name`
        name_m = re.search(r'`(\w+)`', line)
        if not name_m:
            continue
        field_name = name_m.group(1).lower()
        
        # 类型: 紧接在 `name` 后的 WORD 或 WORD(NUM) 或 WORD(NUM,NUM)
        type_m = re.search(r'`\w+`\s+(\w+)(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?', line)
        if not type_m:
            continue
        sql_type_def = type_m.group(1).upper()
        base_sql_type = extract_sql_type(sql_type_def)
        proto_type = SQL_TYPE_MAPPING.get(base_sql_type, 'string')
        
        # COMMENT 内容：支持 '...' 或 "..."，含全角引号
        comment_text = ''
        m = re.search(r"COMMENT\s+['\"]([^'\"]*)['\"]", line, re.IGNORECASE)
        if not m:
            m = re.search(r'COMMENT\s+[\u2018\u2019\u201c\u201d]([^\u2018\u2019\u201c\u201d]*)[\u2018\u2019\u201c\u201d]', line, re.IGNORECASE)
        if m:
            comment_text = m.group(1).strip()
        
        # Java 属性名 + 中文描述（「xxx」- 描述）
        java_prop, desc = extract_comment_parts(comment_text)
        if not java_prop and field_name:
            java_prop = _snake_to_camel(field_name)
        if '--' in line:
            trail = line.split('--', 1)[1].strip()
            trail_cn = re.findall(r'[\u4e00-\u9fff]+', trail)
            if trail_cn:
                desc = (desc + ' ' + ''.join(trail_cn)) if desc else ''.join(trail_cn)
        
        # 约束
        constraints = []
        if re.search(r'\bNOT\s+NULL\b', line, re.IGNORECASE):
            constraints.append('必填')
        if re.search(r'\bUNIQUE\b', line, re.IGNORECASE):
            constraints.append('唯一')
        if re.search(r'\bPRIMARY\s+KEY\b', line, re.IGNORECASE):
            constraints.append('主键')
        default_m = re.search(r'\bDEFAULT\s+([^\s,]+)', line, re.IGNORECASE)
        if default_m:
            v = default_m.group(1).strip()
            if v.upper() not in ('NULL', 'CURRENT_TIMESTAMP'):
                constraints.append(f"默认:{v}")
        len_m = re.search(r'\w+\((\d+)(?:,\s*\d+)?\)', line)
        if len_m and base_sql_type in ('VARCHAR', 'CHAR'):
            constraints.append(f"最大长度:{len_m.group(1)}")
        
        # 最终注释：[Java:xxx] 描述 (约束)
        parts = []
        if java_prop:
            parts.append(f"[Java:{java_prop}]")
        if desc:
            parts.append(desc)
        if constraints:
            parts.append('(' + ', '.join(constraints) + ')')
        final_comment = ' '.join(parts) if parts else ''
        
        fields.append({
            'name': field_name,
            'type': proto_type,
            'comment': final_comment
        })
    
    return {
        'table_name': table_name,
        'fields': fields
    }

def generate_proto_from_table(table_info, java_package="domain", project_root=None):
    """
    从表信息生成 Proto 文件内容。
    java_package: 与 jOOQ 生成的 domain pojos 包一致。
    project_root: 项目根目录，用于在 .r2mo/repo 中检索 {MessageName}.md 并追加笔记属性到注释；默认 getcwd()。
    """
    table_name = table_info['table_name']
    fields = table_info['fields']
    message_name = snake_to_pascal(table_name)
    root = project_root if project_root is not None else os.getcwd()

    lines = [
        'syntax = "proto3";',
        'package domain;',
        '',
        f'// Generated from {java_package}.{message_name}',
    ]
    # 从 .r2mo/repo 检索 {MessageName}.md，将文档头部的笔记属性追加到 message 注释（与 domain 一致）
    doc_attrs, found_md = _find_repo_doc(message_name, root)
    if doc_attrs and found_md:
        for comment_line in _build_message_comment(doc_attrs):
            if comment_line:
                lines.append(f'// {comment_line}')
        print(f"   ✓ {message_name}: 已从 {found_md} 追加笔记属性到注释")
    lines.extend([
        f'option java_package = "{java_package}";',
        'option java_multiple_files = true;',
        '',
        f'message {message_name} {{'
    ])

    for idx, field in enumerate(fields, 1):
        comment_suffix = f' // {field["comment"]}' if field["comment"] else ''
        lines.append(f'  {field["type"]} {field["name"]} = {idx};{comment_suffix}')
    
    lines.append('}')
    
    return "\n".join(lines)

def find_flyway_dirs(base_dir):
    """
    仅查找 src/main/resources 下的 flyway/MYSQL 目录（排除 target/classes 等编译输出）
    """
    flyway_dirs = []
    resources_part = os.path.join('src', 'main', 'resources')
    for root, dirs, files in os.walk(base_dir):
        norm_root = os.path.normpath(root)
        if resources_part not in norm_root:
            continue
        if 'flyway' in norm_root.lower() and 'mysql' in norm_root.lower():
            flyway_dirs.append(root)
    return flyway_dirs


def _discover_java_package(project_root):
    """
    从 -domain 项目中发现 jOOQ 生成的 pojos 包，作为 java_package。
    一般在 -domain/src/main/java/.../domain/.../pojos 或 .../domain/tables/pojos 下。
    返回: 如 "com.formaltech.apps.takeout.domain" 或 "io.zerows.extension.module.ambient.domain.tables.pojos"
    """
    root = os.path.normpath(project_root)
    # 确定 -domain 模块目录
    domain_dir = None
    if os.path.basename(root).endswith('-domain'):
        domain_dir = root
    else:
        for name in os.listdir(root):
            if name.endswith('-domain') and os.path.isdir(os.path.join(root, name)):
                domain_dir = os.path.join(root, name)
                break
    if not domain_dir or not os.path.isdir(domain_dir):
        return 'domain'
    java_src = os.path.join(domain_dir, 'src', 'main', 'java')
    if not os.path.isdir(java_src):
        return 'domain'
    # 查找包含 pojos 的目录下任意 .java，读取 package
    for dirpath, dirnames, filenames in os.walk(java_src):
        if 'pojos' not in os.path.basename(dirpath).lower():
            continue
        for f in filenames:
            if not f.endswith('.java'):
                continue
            path = os.path.join(dirpath, f)
            try:
                with open(path, 'r', encoding='utf-8') as fp:
                    for line in fp:
                        m = re.match(r'\s*package\s+([\w.]+)\s*;', line)
                        if m:
                            return m.group(1).strip()
            except Exception:
                continue
    return 'domain'

# ================= 3. 主程序 =================

def main():
    parser = argparse.ArgumentParser(description='R2MO SQL-to-Proto (V1 - Flyway Mode)')
    parser.add_argument('-i', '--input', help='指定输入目录（默认当前目录）')
    parser.add_argument('-o', '--output', help='指定输出目录')
    args = parser.parse_args()

    input_dir = os.path.abspath(args.input) if args.input else os.getcwd()
    
    if not os.path.exists(input_dir):
        print(f"❌ 输入目录不存在: {input_dir}")
        sys.exit(1)
    
    # 查找所有 flyway 目录
    print(f"🚀 R2MO Proto Generator (V4 - Flyway SQL Mode, .r2mo/repo docs)")
    print(f"   Scanning: {input_dir}")
    print("-" * 40)
    
    flyway_dirs = find_flyway_dirs(input_dir)
    
    if not flyway_dirs:
        print(f"❌ 未找到 flyway/MYSQL 目录")
        sys.exit(1)
    
    print(f"✓ 找到 {len(flyway_dirs)} 个 Flyway 目录")
    for d in flyway_dirs:
        print(f"   - {d}")
    print("-" * 40)
    
    # 确定输出目录
    if args.output:
        output_dir = os.path.abspath(args.output)
    else:
        # 默认输出到第一个 flyway 目录的同级 proto 目录
        output_dir = os.path.join(os.path.dirname(flyway_dirs[0]), 'proto')
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    print(f"   Out: {output_dir}")
    print("-" * 40)
    
    # 从 -domain 项目中发现 jOOQ pojos 包，作为 java_package
    java_package = _discover_java_package(input_dir)
    print(f"   Java package: {java_package}")
    print("-" * 40)
    
    count = 0
    for flyway_dir in flyway_dirs:
        for filename in os.listdir(flyway_dir):
            if filename.endswith('.sql'):
                sql_file = os.path.join(flyway_dir, filename)
                try:
                    with open(sql_file, 'r', encoding='utf-8') as f:
                        sql_content = f.read()
                    
                    table_info = parse_create_table(sql_content)
                    
                    if table_info and table_info['fields']:
                        proto_content = generate_proto_from_table(table_info, java_package=java_package)
                        
                        # 输出文件名：表名的蛇形形式
                        proto_filename = f"{table_info['table_name'].lower()}.proto"
                        proto_file = os.path.join(output_dir, proto_filename)
                        
                        with open(proto_file, 'w', encoding='utf-8') as f:
                            f.write(proto_content)
                        
                        count += 1
                        print(f"✅ {table_info['table_name']} -> {proto_filename} ({len(table_info['fields'])} fields)")
                    else:
                        print(f"⚠️  Skip {filename}: 未找到有效的 CREATE TABLE")
                
                except Exception as e:
                    print(f"⚠️  Skip {filename}: {e}")
    
    print("-" * 40)
    print(f"🎉 处理完成: {count} 个文件")

if __name__ == "__main__":
    main()
