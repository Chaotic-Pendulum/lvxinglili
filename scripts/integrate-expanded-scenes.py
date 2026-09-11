#!/usr/bin/env python3
"""Integrate reviewed scene paintings while preserving original image pixels."""
from pathlib import Path
from PIL import Image
import hashlib
import json
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
STAGE = ROOT / 'output/scene-expansion-20260911'
PACK_ROOT = ROOT / 'dist/packs/reading-room'
catalog = json.loads((STAGE / 'catalog.json').read_text())
approved = set(json.loads((STAGE / 'approved.json').read_text()))
pack_path = PACK_ROOT / 'pack.json'
pack = json.loads(pack_path.read_text())
records = {}
for scene in catalog:
    if scene['id'] not in approved:
        continue
    source = STAGE / 'originals' / (scene['id'] + '.png')
    original = Image.open(source).convert('RGBA')
    if original.getchannel('A').getextrema() != (255, 255):
        raise ValueError('Scene backgrounds must be opaque: ' + scene['id'])
    key = 'scene-' + scene['id']
    target = PACK_ROOT / 'assets' / (key + '.webp')
    original.save(target, format='WEBP', lossless=True, method=6)
    decoded = np.asarray(Image.open(target).convert('RGBA'))
    if not np.array_equal(decoded, np.asarray(original)):
        raise ValueError('Lossless scene conversion mismatch: ' + scene['id'])
    pack['assets'][key] = {'src': 'assets/' + target.name, 'width': original.width, 'height': original.height}
    definition = {k: scene[k] for k in ['id', 'name', 'price', 'description']}
    definition.update(background=key, width=original.width, height=original.height, placements=[])
    existing = next((entry for entry in pack['scenes'] if entry['id'] == scene['id']), None)
    if existing is None:
        pack['scenes'].append(definition)
    else:
        placements = existing['placements']
        existing.update(definition)
        existing['placements'] = placements
    records[key] = {
        'sceneId': scene['id'], 'file': 'assets/' + target.name,
        'original': source.relative_to(ROOT).as_posix(),
        'width': original.width, 'height': original.height,
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
        'pixelsLossless': True, 'bytes': target.stat().st_size,
    }
total = sum((PACK_ROOT / asset['src']).stat().st_size for asset in pack['assets'].values())
if total > 510 * 1024 * 1024:
    raise ValueError('Scene expansion exceeds the current archive budget')
pack['revision'] = 'expanded-scenes-20260911-' + str(len(pack['scenes']))
temporary = pack_path.with_suffix('.json.tmp')
temporary.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
temporary.replace(pack_path)
report = {'method': 'Built-in image generation; reviewed original PNG; pixel-identical lossless WebP.',
          'newScenes': len(records), 'totalScenes': len(pack['scenes']), 'runtimeAssetBytes': total, 'assets': records}
(PACK_ROOT / 'SCENE-ASSETS.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
(STAGE / 'INTEGRATION.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'newScenes': len(records), 'totalScenes': len(pack['scenes']), 'runtimeAssetBytes': total}))
