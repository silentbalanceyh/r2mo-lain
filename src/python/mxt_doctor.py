#!/usr/bin/env python3
"""
mxt_doctor.py - Main entry point for mxt doctor command.

Three-phase closed loop:
  1. mxt doctor --gen???    — script analyzes project, generates baseline metadata
  2. mxt-doctor skill       — LLM calibrates metadata to match project reality
  3. mxt doctor             — scan verifies the result of steps 1+2

Usage:
    mxt doctor --generate [--profile loc|k8s|mob|win]
    mxt doctor --genk8s | --genloc | --genmob | --genwin
    mxt doctor [--profile loc|k8s|mob|win]
    mxt doctor --profile   (list profiles)
"""
import sys, os, argparse

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)


def main():
    parser = argparse.ArgumentParser(
        prog='mxt_doctor',
        description='Anti-drift scanner for software projects.'
    )
    parser.add_argument(
        '--generate', '-g', action='store_true',
        help='Scan project and generate baseline configs to .r2mo/doctor/<profile>/'
    )
    parser.add_argument(
        '--genk8s', action='store_true',
        help='Shortcut for --generate --profile k8s'
    )
    parser.add_argument(
        '--genloc', action='store_true',
        help='Shortcut for --generate --profile loc'
    )
    parser.add_argument(
        '--genmob', action='store_true',
        help='Shortcut for --generate --profile mob'
    )
    parser.add_argument(
        '--genwin', action='store_true',
        help='Shortcut for --generate --profile win'
    )
    parser.add_argument(
        '--profile', '-p',
        nargs='?', const='', default=None,
        help='Profile name. Empty value lists profiles. Omit to use config.json default.'
    )
    args = parser.parse_args()

    cwd = os.getcwd()

    do_generate = args.generate or args.genk8s or args.genloc or args.genmob or args.genwin

    if do_generate:
        from mxt_doctor_generate import generate

        if args.genk8s:
            profile = 'k8s'
        elif args.genloc:
            profile = 'loc'
        elif args.genmob:
            profile = 'mob'
        elif args.genwin:
            profile = 'win'
        elif args.profile is None:
            profile = _get_default_profile(cwd)
            if profile is None:
                print('ERROR: no --profile specified and no default_profile in config.json')
                print('Usage: mxt doctor --genk8s | --genloc | --genmob | --genwin')
                sys.exit(1)
        elif args.profile == '':
            print('ERROR: --generate requires a profile name.')
            _list_profiles(cwd)
            sys.exit(1)
        else:
            profile = args.profile

        ok = generate(cwd=cwd, profile=profile)
        sys.exit(0 if ok else 1)

    else:
        from mxt_doctor_scan import scan

        if args.profile is None:
            profile = None
        elif args.profile == '':
            _list_profiles(cwd)
            sys.exit(0)
        else:
            profile = args.profile

        ok = scan(cwd=cwd, profile=profile)
        sys.exit(0 if ok else 1)


def _get_default_profile(cwd):
    import json
    config_path = os.path.join(cwd, '.r2mo', 'doctor', 'config.json')
    if os.path.isfile(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f).get('default_profile')
        except (json.JSONDecodeError, OSError):
            pass
    return None


def _list_profiles(cwd):
    doctor_dir = os.path.join(cwd, '.r2mo', 'doctor')
    if not os.path.isdir(doctor_dir):
        print('No .r2mo/doctor/ directory found. Run "mxt doctor --generate --profile <name>" first.')
        return
    print('Available profiles:')
    for entry in sorted(os.listdir(doctor_dir)):
        full = os.path.join(doctor_dir, entry)
        if os.path.isdir(full) and not entry.startswith('.') and entry != 'verify':
            conf_count = sum(1 for f in os.listdir(full) if f.endswith('.conf'))
            print(f'  {entry} ({conf_count} configs)')


if __name__ == '__main__':
    main()
