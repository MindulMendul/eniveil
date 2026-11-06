#!/usr/bin/env python3
"""Print a Goal; never execute a prompt or change Git/GitHub state."""
import pathlib
import sys

if len(sys.argv) != 2 or not sys.argv[1].isascii() or not sys.argv[1].isdigit() or int(sys.argv[1]) < 1:
    sys.exit("Usage: python3 scripts/codex/goal.py <positive-issue-number>")
template = pathlib.Path(__file__).resolve().parents[2] / "docs/codex-goal.txt"
print(template.read_text().replace("{{ISSUE_NUMBER}}", str(int(sys.argv[1]))))
