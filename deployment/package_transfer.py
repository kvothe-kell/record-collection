"""Package source and data. Stop Flask and the Pi sender before final cutover."""
import argparse
import json
import sqlite3
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='New archive path; never overwrites an existing file')
    args = parser.parse_args()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    output = args.output or Path('/private/tmp') / f'record-collection-{stamp}.tar.gz'
    files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    files = {f for f in files if f and (ROOT / f).is_file()}
    files.update(str(p.relative_to(ROOT)) for p in (ROOT / 'deployment').rglob('*')
                 if p.is_file() and '__pycache__' not in p.parts)
    files = {f for f in files if not any(part in {'.git', '.env', 'venv', 'node_modules', '__pycache__'}
                                       for part in Path(f).parts) and f != 'records.db'}
    if not (ROOT / 'records.db').is_file():
        raise SystemExit('Missing records.db; refusing to package an empty database')
    with tempfile.TemporaryDirectory() as temp:
        snapshot = Path(temp) / 'records.db'
        with sqlite3.connect((ROOT / 'records.db').as_uri() + '?mode=ro', uri=True) as source:
            with sqlite3.connect(snapshot) as target:
                source.backup(target)
                if target.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                    raise SystemExit('Database integrity check failed')
                tables = [r[0] for r in target.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
                counts = {name: target.execute('SELECT COUNT(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0] for name in tables}
        manifest = Path(temp) / 'TRANSFER.json'
        manifest.write_text(json.dumps({'created_utc': stamp, 'table_counts': counts,
                                       'note': 'Final transfer requires Flask and Pi sender stopped.'}, indent=2))
        with output.open('xb') as handle:
            with tarfile.open(fileobj=handle, mode='w:gz') as archive:
                for name in sorted(files):
                    archive.add(ROOT / name, arcname=name, recursive=False)
                archive.add(snapshot, arcname='records.db')
                archive.add(manifest, arcname='TRANSFER.json')
                if (ROOT / 'static/covers').is_dir():
                    archive.add(ROOT / 'static/covers', arcname='static/covers')
    output.chmod(0o600)
    print(output)
    print(json.dumps(counts, indent=2))
    print(f'Archive size: {output.stat().st_size / 1024 / 1024:.1f} MiB')


if __name__ == '__main__':
    main()
