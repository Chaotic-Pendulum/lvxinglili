#!/usr/bin/env python3
"""Install verified Q90 variants with new URLs and preserve original artwork."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parent.parent
STAGE = ROOT / 'output/q90-release-20260911'
PACK_ROOT = ROOT / 'dist/packs/reading-room'

def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()

def copy_verified(source, target, expected):
    if digest(source) != expected:
        raise ValueError('Hash mismatch: ' + str(source))
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        shutil.copy2(source, target)
    if digest(target) != expected:
        raise ValueError('Existing output differs: ' + str(target))

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pack-output', type=Path, required=True)
parser.add_argument('--extras-output', type=Path, required=True)
args = parser.parse_args()
before = json.loads((STAGE / 'before-pack.json').read_text())
pack = json.loads((PACK_ROOT / 'pack.json').read_text())
encoded = json.loads((args.pack_output / 'manifest.json').read_text())
extras = json.loads((args.extras_output / 'manifest.json').read_text())
if set(encoded['assets']) != set(before['assets']) or encoded['errors']:
    raise ValueError('Incomplete Q90 output')
replacements = pack.setdefault('assetReplacements', {})
records = {}
for key, result in encoded['assets'].items():
    old = before['assets'][key]
    assert result['alphaIdentical'] and result['iccIdentical'] and result['dimensionsIdentical']
    assert result['width'] == old['width'] and result['height'] == old['height']
    original = PACK_ROOT / old['src']
    copy_verified(original, STAGE / 'originals/pack' / old['src'], result['sourceSha256'])
    relative = 'assets/q90/' + key + '.webp'
    target = PACK_ROOT / relative
    copy_verified(args.pack_output / result['file'], target, result['sha256'])
    pack['assets'][key] = {**old, 'src': relative}
    previous = replacements.setdefault(key, [])
    if old not in previous:
        previous.append(old)
    records[key] = {**result, 'file': relative}
pack['revision'] = 'expanded-q90-20260911-v1'
pack['imageEncoding'] = {'format': 'webp', 'quality': 90, 'alphaQuality': 100,
                         'originalDimensionsPreserved': True, 'rgbLossy': True}
styles = json.loads((STAGE / 'before-styles.json').read_text())
style_module = {}
extra_records = []
for result in extras['entries']:
    assert result['alphaIdentical'] and result['iccIdentical']
    copy_verified(ROOT / result['source'], STAGE / 'originals' / result['source'], result['sourceSha256'])
    if result['kind'] == 'style-preview':
        relative = 'previews/q90/' + result['id'] + '.webp'
        target = ROOT / 'dist/photo-styles' / relative
        entry = next(s for s in styles['styles'] if s['id'] == result['id'])
        entry.update(originalFile=entry['file'], originalSha256=entry['sha256'], file=relative,
                     sha256=result['sha256'], width=result['width'], height=result['height'], quality=90)
        style_module[result['id']] = {'src': './photo-styles/' + relative, 'width': result['width'], 'height': result['height']}
    else:
        target = ROOT / 'dist/app-icon-q90.webp'
    copy_verified(args.extras_output / result['file'], target, result['sha256'])
    extra_records.append({**result, 'file': target.relative_to(ROOT).as_posix()})
styles['encoding'] = pack['imageEncoding']
(ROOT / 'dist/photo-styles/manifest.json').write_text(json.dumps(styles, ensure_ascii=False, indent=2) + '\n')
(ROOT / 'dist/app/photo-style-previews.js').write_text('// Frontend-only preview URLs; models receive style text only.\nexport const PHOTO_STYLE_PREVIEWS = Object.freeze(' + json.dumps(style_module, ensure_ascii=False, indent=2) + ');\n')
report = {'parameters': encoded['parameters'], 'assets': records, 'totals': encoded['totals'],
          'extras': extra_records, 'originals': 'output/q90-release-20260911/originals',
          'preservedCompatibilityFiles': ['dist/app-icon.png'],
          'unchangedMapSources': ['dist/maps/world-standard-GS2020-4403.jpg', 'dist/maps/china-standard-GS2023-2764.jpg']}
(PACK_ROOT / 'Q90-ASSETS.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
(STAGE / 'INTEGRATION.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
shutil.copy2(args.pack_output / 'source-manifest.json', STAGE / 'source-manifest.json')
shutil.copy2(args.extras_output / 'manifest.json', STAGE / 'extras-manifest.json')
temporary = PACK_ROOT / 'pack.json.tmp'
temporary.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
temporary.replace(PACK_ROOT / 'pack.json')
print(json.dumps({'assets': len(records), 'extras': len(extra_records), 'beforeBytes': encoded['totals']['beforeBytes'],
                  'afterBytes': encoded['totals']['afterBytes'], 'revision': pack['revision']}))
