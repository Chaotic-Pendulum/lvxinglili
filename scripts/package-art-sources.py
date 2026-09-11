#!/usr/bin/env python3
"""Preserve selected original PNGs and package a portable authoring workspace."""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import zipfile
from asset_paths import production_dir

PROJECT = Path(__file__).resolve().parent.parent
EXPANSION = PROJECT / 'output/expansion-20260910'
PRODUCTION = EXPANSION / 'production'
PACK = PROJECT / 'dist/packs/reading-room'
SOURCE_ROOT = production_dir()
manifest = json.loads((EXPANSION / 'processed/manifest.json').read_text())
assert manifest['total'] == 404 and len(manifest['assets']) == 404
PRODUCTION.mkdir(parents=True, exist_ok=True)
records = []

def preserve(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.resolve() != target.resolve():
        shutil.copy2(source, target)

for item in manifest['assets']:
    historical = Path(item['source'])
    kind = next(kind for kind in ('outfits', 'furniture', 'interactions') if kind in historical.parts)
    relative = Path(*historical.parts[historical.parts.index(kind):])
    source = SOURCE_ROOT / relative
    if not source.exists():
        source = PRODUCTION / relative
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    assert digest == item['sourceSha256'], f'Original hash mismatch: {relative}'
    target = PRODUCTION / relative
    preserve(source, target)
    records.append({'path': target.relative_to(PROJECT).as_posix(), 'sha256': digest,
                    'processedSha256': item['sha256'], 'historicalSource': item['source']})

# Retain prompts, reference order, repair records and briefs, including historic attempts.
# Rejected image binaries are deliberately excluded from the selected-original bundle.
for source in sorted(SOURCE_ROOT.rglob('*')):
    if not source.is_file() or source.suffix.lower() not in {'.json', '.md', '.txt', '.py'}:
        continue
    content = source.read_text()
    if re.search(r'sk-or-v1-[A-Za-z0-9]{20,}|sk-proj-[A-Za-z0-9_-]{20,}', content):
        raise ValueError(f'Credential-like content in production record: {source.name}')
    preserve(source, PRODUCTION / source.relative_to(SOURCE_ROOT))

for source in sorted((SOURCE_ROOT / 'items').glob('sheet-*.png')):
    preserve(source, PRODUCTION / 'items' / source.name)

index = {'selectedNewOriginals': len(records), 'interactionFrames': 400,
         'newInteractionFrames': 388, 'legacyInteractionFrames': 12, 'files': records}
(EXPANSION / 'ART-SOURCE-INDEX.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
(EXPANSION / 'ART-SOURCES-README.md').write_text('''# 素材原稿包

把本ZIP解压到 roam-atelier-source.zip 的项目根目录，目录可直接合并。正常运行游戏只需要源码包；本包用于复用原始PNG、提示词、参考依赖和制作脚本。

production/ 保留本次404张入选原稿：388互动、7装扮、9空家具，以及7张携带物品图集。dist/packs/reading-room/assets/ 补齐原有12张互动、3装扮、空阅读椅、场景和旅行示例等原始PNG。合起来覆盖10装扮、10家具、400动作帧、100携带物品。ART-SOURCE-INDEX.json 可核对404张新增原稿哈希。

processed/ 在本包只包含处理记录、批准清单和最终复核页；完整透明PNG可用脚本从production原稿重建。源码包已包含最终可玩无损WebP。

安装Python及Pillow、NumPy、SciPy，在项目根运行 scripts/process-expanded-assets.py，复核后再运行 scripts/integrate-expanded-assets.py。制作步骤见 docs/AI-ASSET-AUTHORING.md。脚本优先使用 ROAM_ART_SOURCE_DIR，否则使用本项目production目录。

原制作记录中的 /tmp/roam-expansion-20260910 与 /private/tmp/roam-expansion-20260910 都对应本项目 output/expansion-20260910/production。generated_images绝对路径属于工具原始出处；在用图片已经复制并记录哈希，无需旧机器的该目录。

metadata中的旧失败尝试、初始jobs进度和待复核标志保留作历史。canonical原稿以ART-SOURCE-INDEX及当前PNG为准，最终批准以processed/approved.json、FINAL-ART-REVIEW.md和FINAL-RUNTIME-VALIDATION.json为准。被淘汰的图片文件不包含在本选用包。

此包不包含.env、API密钥或浏览器个人存档。
''')

files = set(PRODUCTION.rglob('*'))
files.update((PROJECT / 'output/scene-expansion-20260911').rglob('*'))
files.update((PROJECT / 'output/q90-release-20260911').rglob('*'))
files.update((PROJECT / 'output/ui-skin-20260911').rglob('*'))
files.update(p for p in (EXPANSION / 'processed').rglob('*') if p.suffix == '.json')
files.update((EXPANSION / 'processed/reviews').glob('*-outfits-[12].png'))
files.update(EXPANSION.glob('FINAL-*'))
files.update(EXPANSION / name for name in ['STATUS.md', 'ART-SOURCE-INDEX.json', 'ART-SOURCES-README.md'])
files.update(PACK.glob('*.json'))
files.update(PACK.glob('*.md'))
files.add(PACK / 'LICENSE.txt')
files.update(p for p in (PACK / 'assets').glob('*.png'))
files.update((PROJECT / 'docs').glob('*'))
files.update((PROJECT / 'scripts').glob('*.py'))
files.add(PROJECT / 'HANDOFF-先读我.md')
files = sorted(p for p in files if p.is_file() and '__pycache__' not in p.parts)
output = PROJECT / 'releases/roam-art-sources.zip'
temporary = output.with_suffix('.zip.tmp')
with zipfile.ZipFile(temporary, 'w', allowZip64=True) as archive:
    for file in files:
        compression = zipfile.ZIP_STORED if file.suffix.lower() in {'.png', '.webp', '.jpg'} else zipfile.ZIP_DEFLATED
        archive.write(file, file.relative_to(PROJECT).as_posix(), compress_type=compression)
temporary.replace(output)
print(json.dumps({'archive': str(output.relative_to(PROJECT)), 'files': len(files),
                  'selectedNewOriginals': len(records), 'bytes': output.stat().st_size}))
