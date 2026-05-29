#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
API Extractor for R2MO Module
从 .r2mo/api/metadata.yaml 中提取模块相关的 API 定义

Usage:
    python extract-api.py --match user,role --output api.yaml
    python extract-api.py -m user -m role -o api.yaml
"""

import argparse
import os
import sys
import yaml
from pathlib import Path
from typing import Dict, List, Any


class APIExtractor:
    """API 提取器"""

    def __init__(self, metadata_path: str):
        """
        初始化提取器

        Args:
            metadata_path: metadata.yaml 文件路径
        """
        self.metadata_path = Path(metadata_path)
        self.metadata = None

    def load_metadata(self) -> bool:
        """
        加载 metadata.yaml

        Returns:
            是否成功加载
        """
        try:
            if not self.metadata_path.exists():
                print(f"❌ 错误: 文件不存在 {self.metadata_path}")
                return False

            with open(self.metadata_path, 'r', encoding='utf-8') as f:
                self.metadata = yaml.safe_load(f)

            print(f"✓ 已加载: {self.metadata_path}")
            return True

        except Exception as e:
            print(f"❌ 加载失败: {e}")
            return False

    def extract_paths(self, patterns: List[str]) -> Dict[str, Any]:
        """
        根据模式提取 paths

        Args:
            patterns: 匹配模式列表，如 ["user", "role"]

        Returns:
            提取的 paths 字典
        """
        if not self.metadata or 'paths' not in self.metadata:
            return {}

        extracted_paths = {}
        all_paths = self.metadata['paths']

        # 遍历所有路径
        for path, path_item in all_paths.items():
            # 检查路径是否匹配任一模式
            for pattern in patterns:
                if pattern.lower() in path.lower():
                    extracted_paths[path] = path_item
                    print(f"  ✓ 匹配: {path}")
                    break

        return extracted_paths

    def extract_schemas(self, paths: Dict[str, Any]) -> Dict[str, Any]:
        """
        从 paths 中提取引用的 schemas

        Args:
            paths: 提取的 paths

        Returns:
            提取的 schemas 字典
        """
        if not self.metadata or 'components' not in self.metadata:
            return {}

        schemas = self.metadata['components'].get('schemas', {})
        extracted_schemas = {}
        referenced_schemas = set()

        # 从 paths 中收集所有引用的 schema
        def collect_refs(obj):
            """递归收集 $ref 引用"""
            if isinstance(obj, dict):
                if '$ref' in obj:
                    ref = obj['$ref']
                    if ref.startswith('#/components/schemas/'):
                        schema_name = ref.split('/')[-1]
                        referenced_schemas.add(schema_name)
                else:
                    for value in obj.values():
                        collect_refs(value)
            elif isinstance(obj, list):
                for item in obj:
                    collect_refs(item)

        collect_refs(paths)

        # 提取引用的 schemas
        for schema_name in referenced_schemas:
            if schema_name in schemas:
                extracted_schemas[schema_name] = schemas[schema_name]
                print(f"  ✓ Schema: {schema_name}")

        return extracted_schemas

    def extract_api(self, patterns: List[str]) -> Dict[str, Any]:
        """
        提取 API 定义

        Args:
            patterns: 匹配模式列表

        Returns:
            提取的 API 定义（OpenAPI 格式）
        """
        # 提取 paths
        print(f"\n🔍 提取 Paths (匹配: {', '.join(patterns)})...")
        extracted_paths = self.extract_paths(patterns)

        if not extracted_paths:
            print("⚠️  未找到匹配的 API 路径")
            return {}

        print(f"\n✓ 找到 {len(extracted_paths)} 个路径")

        # 提取 schemas
        print(f"\n🔍 提取关联的 Schemas...")
        extracted_schemas = self.extract_schemas(extracted_paths)

        print(f"\n✓ 找到 {len(extracted_schemas)} 个 Schema")

        # 构建输出结构
        output = {
            'openapi': self.metadata.get('openapi', '3.0.0'),
            'info': {
                'title': f"Module API ({', '.join(patterns)})",
                'version': '1.0.0',
                'description': f"从 metadata.yaml 提取的模块 API 定义"
            },
            'paths': extracted_paths
        }

        # 添加 components
        if extracted_schemas:
            output['components'] = {
                'schemas': extracted_schemas
            }

        return output

    def save_output(self, data: Dict[str, Any], output_path: str) -> bool:
        """
        保存提取的 API 到文件

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

            # 保存 YAML
            with open(output_file, 'w', encoding='utf-8') as f:
                yaml.dump(data, f, allow_unicode=True, sort_keys=False, indent=2)

            print(f"\n✅ 已保存到: {output_file}")
            return True

        except Exception as e:
            print(f"\n❌ 保存失败: {e}")
            return False


def find_metadata_yaml(start_dir: Path = None) -> Path:
    """
    查找 .r2mo/api/metadata.yaml

    Args:
        start_dir: 起始目录

    Returns:
        metadata.yaml 的路径
    """
    if start_dir is None:
        start_dir = Path.cwd()

    # 向上查找项目根目录（包含 .r2mo）
    current = start_dir
    while current != current.parent:
        metadata_path = current / '.r2mo' / 'api' / 'metadata.yaml'
        if metadata_path.exists():
            return metadata_path
        current = current.parent

    # 如果没找到，使用默认路径
    return start_dir / '.r2mo' / 'api' / 'metadata.yaml'


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='从 OpenAPI metadata.yaml 提取模块 API 定义',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 提取包含 "user" 和 "role" 的 API
  python extract-api.py --match user,role

  # 使用多个 -m 参数
  python extract-api.py -m user -m role -m permission

  # 指定输出文件
  python extract-api.py -m user -o custom-api.yaml

  # 指定 metadata.yaml 路径
  python extract-api.py -m user --metadata /path/to/metadata.yaml
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
        default='api.yaml',
        help='输出文件路径（默认: api.yaml）'
    )

    parser.add_argument(
        '--metadata',
        help='metadata.yaml 文件路径（默认: 自动查找 .r2mo/api/metadata.yaml）'
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
    print("🚀 R2MO API Extractor")
    print("=" * 60)

    # 确定 metadata.yaml 路径
    if args.metadata:
        metadata_path = Path(args.metadata)
    else:
        metadata_path = find_metadata_yaml()
        print(f"📁 自动查找: {metadata_path}")

    # 创建提取器
    extractor = APIExtractor(str(metadata_path))

    # 加载 metadata
    if not extractor.load_metadata():
        sys.exit(1)

    # 提取 API
    result = extractor.extract_api(patterns)

    if not result:
        print("\n⚠️  没有提取到任何内容")
        sys.exit(1)

    # 保存结果
    if extractor.save_output(result, args.output):
        print(f"\n🎉 完成！提取了 {len(result.get('paths', {}))} 个 API")
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()

