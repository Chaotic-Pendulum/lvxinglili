#!/usr/bin/env python3
"""Create an extract-and-run development handoff without credentials or old ZIPs."""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=ROOT / 'releases/roam-atelier-development-handoff.zip')
args = parser.parse_args()
output = args.output.resolve()
output.parent.mkdir(parents=True, exist_ok=True)
temporary = output.with_suffix('.zip.tmp')
ignored_parts = {'__pycache__', '.git', 'node_modules', '.DS_Store', '.pytest_cache'}
ignored_suffixes = {'.zip', '.7z', '.gz', '.xz', '.pyc', '.log'}

def include(file):
    if not file.is_file() or file.is_symlink():
        return False
    if any(part in ignored_parts for part in file.parts):
        return False
    if file.name.startswith('.env') and file.name != '.env.example':
        return False
    return file.suffix.lower() not in ignored_suffixes and not file.name.endswith('.zip.tmp')

files = []
for directory in ['dist', 'server', 'scripts', 'tests', 'docs', 'output']:
    files.extend(p for p in (ROOT / directory).rglob('*') if include(p))
for name in ['package.json', 'README.md', 'HANDOFF-先读我.md', 'LICENSE', '.env.example', '.gitignore', '.openai/hosting.json']:
    file = ROOT / name
    if file.exists():
        files.append(file)
files = sorted(set(files))

# Check actual local credential values without printing them or writing them into metadata.
secrets = []
env = ROOT / '.env'
if env.exists():
    for line in env.read_text().splitlines():
        if '=' not in line or line.lstrip().startswith('#'):
            continue
        key, value = line.split('=', 1)
        value = value.strip().strip('\"\'')
        if (key.strip().endswith('_KEY') or key.strip().endswith('_TOKEN')) and len(value) >= 12:
            secrets.append(value.encode())
credential_pattern = re.compile(rb'sk-or-v1-[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{20,}')
text_suffixes = {'.json', '.md', '.txt', '.mjs', '.js', '.py', '.html', '.css', '.toml', '.yaml', '.yml'}
entries = []
for file in files:
    relative = file.relative_to(ROOT).as_posix()
    data = file.read_bytes()
    if file.suffix.lower() in text_suffixes or file.name in {'.env.example', '.gitignore'}:
        if credential_pattern.search(data) or any(secret in data for secret in secrets):
            raise ValueError('Credential-like content detected in ' + relative)
    entries.append({'path': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})

pack = json.loads((ROOT / 'dist/packs/reading-room/pack.json').read_text())
manifest = {
    'createdAt': datetime.now(timezone.utc).isoformat(),
    'archiveRoot': 'roam-atelier/',
    'entrypoint': 'HANDOFF-先读我.md',
    'credentialsIncluded': False,
    'browserSaveIncluded': False,
    'nodeRequirement': '>=20.12',
    'counts': {k: len(pack[k]) for k in ['scenes', 'outfits', 'furniture', 'items', 'assets']},
    'revision': pack['revision'],
    'files': entries,
}
binary_suffixes = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.woff', '.woff2', '.pdf'}
with zipfile.ZipFile(temporary, 'w', allowZip64=True, compresslevel=6) as archive:
    for file in files:
        compression = zipfile.ZIP_STORED if file.suffix.lower() in binary_suffixes else zipfile.ZIP_DEFLATED
        archive.write(file, 'roam-atelier/' + file.relative_to(ROOT).as_posix(), compress_type=compression)
    archive.writestr('roam-atelier/DEVELOPMENT-MANIFEST.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', compress_type=zipfile.ZIP_DEFLATED)
temporary.replace(output)
with zipfile.ZipFile(output) as archive:
    if archive.testzip() is not None:
        raise ValueError('Archive CRC validation failed')
    assert not any(Path(name).name == '.env' for name in archive.namelist())
    assert len(archive.namelist()) == len(set(archive.namelist()))

hasher = hashlib.sha256()
with output.open('rb') as stream:
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        hasher.update(chunk)
report = {'file': output.name, 'bytes': output.stat().st_size, 'files': len(entries) + 1,
          'sha256': hasher.hexdigest(), 'crcValid': True, 'credentialsIncluded': False,
          'uncompressedBytes': sum(item['bytes'] for item in entries), 'counts': manifest['counts']}
output.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False))
