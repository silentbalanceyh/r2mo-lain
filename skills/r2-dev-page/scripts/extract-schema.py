#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Schema Extractor for R2MO Module
从 .r2mo/api/components/schemas/ 和 .r2mo/domain/ 提取模块相关的数据模型定义

Usage:
    python extract-schema.py --match user,role --output schemas.yaml
    python extract-schema.py -m user -m role -o schemas.yaml
"""

import argparse
import os
import sys
import yaml
from pathlib import Path
from typing import Dict, List, Any


class SchemaExtractor:
    """Schema 提取器"""

    def __init__(self, project_root: Path):
        """
        初始化提取器

        Args:
            project_root: 项目根目录路径
        """
        self.project_root = project_root
        self.schemas_dir = project_root / '.r2mo' / 'api' / 'components' / 'schemas'
        self.domain_dir = project_root / '.r2mo' / 'domain'

    def extract_schemas(self, patterns: List[str]) -> Dict[str, Any]:
        """
        根据模式提取 schemas

        Args:
            patterns: 匹配模式列表，如 ["user", "role"]

        Returns:
            提取的 schemas 字典
        """
        extracted = {
            'schemas': {},
            'protos': {}
        }

        # 提取 Markdown schemas
        if self.schemas_dir.exists():
            print(f"\n🔍 扫描 Schemas: {self.schemas_dir}")
            md_files = list(self.schemas_dir.glob('*.md'))

            for md_file in md_files:
                # 检查文件名是否匹配任一模式
                for pattern in patterns:
                    if pattern.lower() in md_file.stem.lower():
                        print(f"  ✓ 匹配: {md_file.name}")
                        content = md_file.read_text(encoding='utf-8')
                        extracted['schemas'][md_file.stem] = {
                            'file': str(md_file.relative_to(self.project_root)),
                            'content': content
                        }
                        break

        # 提取 Proto files
        if self.domain_dir.exists():
            print(f"\n🔍 扫描 Domain Models: {self.domain_dir}")
            proto_files = list(self.domain_dir.glob('*.proto'))

            for proto_file in proto_files:
                # 检查文件名是否匹配任一模式
                for pattern in patterns:
                    if pattern.lower() in proto_file.stem.lower():
                        print(f"  ✓ 匹配: {proto_file.name}")
                        content = proto_file.read_text(encoding='utf-8')
                        extracted['protos'][proto_file.stem] = {
                            'file': str(proto_file.relative_to(self.project_root)),
                            'content': content
                        }
                        break

        return extracted

    def save_output(self, data: Dict[str, Any], output_path: str) -> bool:
        """
        保存提取的 schemas 到文件

        Args:
            data: 提取的数据
            output_path: 输出文件路径

        Returns:
            是否成功保存
        """
        try:
            output_file = Path(output_path)

            # 确保目录存在
            output_file.parent.mkdir(parents=True, exist_ok=True)

            # 构建输出结构
            output = {
                'schemas': {},
                'domain_models': {}
            }

            # 添加 schemas
            for name, info in data['schemas'].items():
                output['schemas'][name] = {
                    'source': info['file'],
                    'content': info['content']
                }

            # 添加 protos
            for name, info in data['protos'].items():
                output['domain_models'][name] = {
                    'source': info['file'],
                    'content': info['content']
                }

            # 保存 YAML
            with open(output_file, 'w', encoding='utf-8') as f:
                yaml.dump(output, f, allow_unicode=True, sort_keys=False, indent=2)

            print(f"\n✅ 已保存到: {output_file}")
            return True

        except Exception as e:
            print(f"\n❌ 保存失败: {e}")
            return False


def find_project_root(start_dir: Path = None) -> Path:
    """
    查找项目根目录（包含 .r2mo）

    Args:
        start_dir: 起始目录

    Returns:
        项目根目录路径
    """
    if start_dir is None:
        start_dir = Path.cwd()

    # 向上查找包含 .r2mo 的目录
    current = start_dir
    while current != current.parent:
        r2mo_dir = current / '.r2mo'
        if r2mo_dir.exists():
            return current
        current = current.parent

    # 如果没找到，使用当前目录
    return start_dir


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='从 .r2mo 提取模块数据模型定义',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 提取包含 "user" 和 "role" 的 schemas
  python extract-schema.py --match user,role

  # 使用多个 -m 参数
  python extract-schema.py -m user -m role -m permission

  # 指定输出文件
  python extract-schema.py -m user -o schemas.yaml

  # 指定项目根目录
  python extract-schema.py -m user --project-root /path/to/project
        """
    )

    parser.add_argument(
        '-m', '--match',
        action='append',
        dest='patterns',
        help='匹配模式（可多次使用）。也可以用逗号分隔：-m user,role'
    )

    parser.add_argument(
        '-o', '--output',
        default='schemas.yaml',
        help='输出文件路径（默认: schemas.yaml）'
    )

    parser.add_argument(
        '--project-root',
        help='项目根目录路径（默认: 自动查找包含 .r2mo 的目录）'
    )

    args = parser.parse_args()

    # 处理 patterns
    patterns = []
    if args.patterns:
        for pattern in args.patterns:
            # 支持逗号分隔
            patterns.extend([p.strip() for p in pattern.split(',')])

    if not patterns:
        parser.print_help()
        print("\n❌ 错误: 请指定至少一个匹配模式 (-m 或 --match)")
        sys.exit(1)

    print("=" * 60)
    print("🚀 R2MO Schema Extractor")
    print("=" * 60)

    # 确定项目根目录
    if args.project_root:
        project_root = Path(args.project_root)
    else:
        project_root = find_project_root()
        print(f"📁 自动查找项目根目录: {project_root}")

    # 验证项目结构
    r2mo_dir = project_root / '.r2mo'
    if not r2mo_dir.exists():
        print(f"\n❌ 错误: 未找到 .r2mo 目录在 {project_root}")
        sys.exit(1)

    # 创建提取器
    extractor = SchemaExtractor(project_root)

    # 提取 schemas
    result = extractor.extract_schemas(patterns)

    # 统计
    schema_count = len(result['schemas'])
    proto_count = len(result['protos'])
    total = schema_count + proto_count

    if total == 0:
        print("\n⚠️  未找到匹配的 Schema 或 Domain Model")
        sys.exit(1)

    print(f"\n✓ 找到 {schema_count} 个 Schema (Markdown)")
    print(f"✓ 找到 {proto_count} 个 Domain Model (Proto)")

    # 保存结果
    if extractor.save_output(result, args.output):
        print(f"\n🎉 完成！提取了 {total} 个数据模型")
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()

