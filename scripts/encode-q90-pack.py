#!/usr/bin/env python3
"""Encode a fixed source pack to Q90 WebP without mutating any source file.

The source manifest is frozen before workers start. Each worker hashes the exact
bytes it decodes, checks that frozen hash, and validates the decoded output's
dimensions, complete alpha plane, and ICC profile. All original source hashes
are checked again after encoding. RGB is intentionally lossy; a VP8 bitstream
and actual RGB differences are recorded rather than claiming pixel identity.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import struct
import sys
import traceback

import PIL
from PIL import Image, ImageChops, features


PARAMETERS = {
    "format": "WEBP", "quality": 90, "lossless": False, "method": 6,
    "alpha_quality": 100, "exact": True,
    "resize": False, "crop": False, "preserveIcc": True,
    "workers": 4,
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def webp_chunks(data: bytes) -> list[str]:
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("Output is not a RIFF WebP file")
    chunks = []
    offset = 12
    while offset + 8 <= len(data):
        chunks.append(data[offset:offset + 4].decode("ascii"))
        size = struct.unpack_from("<I", data, offset + 4)[0]
        offset += 8 + size + size % 2
    return chunks


def encode_one(job: tuple[str, dict, str, str]) -> tuple[str, dict]:
    asset_id, baseline, pack_root_str, output_root_str = job
    source_path = Path(pack_root_str) / baseline["sourceSrc"]
    output_root = Path(output_root_str)
    source_data = source_path.read_bytes()
    if sha256(source_data) != baseline["sourceSha256"]:
        raise ValueError(f"Source hash changed before encoding: {source_path}")
    with Image.open(BytesIO(source_data)) as source:
        source.load()
        if getattr(source, "n_frames", 1) != 1:
            raise ValueError("Animated images are not accepted as static assets")
        source_rgba = source.convert("RGBA")
        source_icc = source.info.get("icc_profile")
        relative_file = f"output/{asset_id}.webp"
        target_path = output_root / relative_file
        save_parameters = {
            "format": "WEBP", "quality": 90, "lossless": False,
            "method": 6, "alpha_quality": 100, "exact": True,
        }
        if source_icc is not None:
            save_parameters["icc_profile"] = source_icc
        source_rgba.save(target_path, **save_parameters)
        output_data = target_path.read_bytes()
        chunks = webp_chunks(output_data)
        if "VP8 " not in chunks or "VP8L" in chunks:
            raise ValueError(f"Expected lossy VP8 RGB payload; got {chunks}")
        with Image.open(BytesIO(output_data)) as decoded:
            decoded.load()
            result_rgba = decoded.convert("RGBA")
            dimensions_identical = decoded.size == source.size
            alpha_identical = (
                source_rgba.getchannel("A").tobytes()
                == result_rgba.getchannel("A").tobytes()
            )
            icc_identical = decoded.info.get("icc_profile") == source_icc
            rgb_diff = ImageChops.difference(
                source_rgba.convert("RGB"), result_rgba.convert("RGB")
            )
            rgb_identical = all(hi == 0 for lo, hi in rgb_diff.getextrema())
            if not (dimensions_identical and alpha_identical and icc_identical):
                raise ValueError(
                    f"Output validation failed: dimensions={dimensions_identical}, "
                    f"alpha={alpha_identical}, icc={icc_identical}"
                )
            return asset_id, {
                "sourceSrc": baseline["sourceSrc"],
                "sourceSha256": baseline["sourceSha256"],
                "sourceBytes": len(source_data),
                "file": relative_file,
                "sha256": sha256(output_data),
                "bytes": len(output_data),
                "width": decoded.width,
                "height": decoded.height,
                "dimensionsIdentical": dimensions_identical,
                "alphaIdentical": alpha_identical,
                "iccIdentical": icc_identical,
                "iccBytes": len(source_icc) if source_icc is not None else 0,
                "rgbIdentical": rgb_identical,
                "rgbLossyBitstream": True,
                "rgbMaximumChannelDifference": max(hi for lo, hi in rgb_diff.getextrema()),
                "webpChunks": chunks,
            }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, required=True)
    parser.add_argument("--before-pack", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, help="Optional preserved original asset root")
    args = parser.parse_args()
    project_root = args.project_root.resolve()
    before_pack = args.before_pack.resolve()
    output_root = args.output_root.resolve()
    pack_root = args.source_root.resolve() if args.source_root else project_root / "dist/packs/reading-room"
    if output_root == project_root or output_root == pack_root or pack_root in output_root.parents:
        raise ValueError("Output must be outside the original asset directory")
    output_root.mkdir(parents=True, exist_ok=True)
    (output_root / "output").mkdir(exist_ok=True)
    pack_bytes = before_pack.read_bytes()
    source_pack = json.loads(pack_bytes)
    if source_pack.get("imageEncoding", {}).get("quality") == 90:
        raise ValueError("Use the preserved pre-compression manifest; do not recompress a Q90 release")
    assets = source_pack["assets"]
    if not 1 <= len(assets) <= 512:
        raise ValueError("Expected 1 to 512 assets")
    baseline = {}
    errors = []
    for asset_id, asset in assets.items():
        try:
            if not re.fullmatch(r"[a-zA-Z0-9_-]+", asset_id):
                raise ValueError(f"Unsafe asset id: {asset_id}")
            source_path = (pack_root / asset["src"]).resolve()
            if pack_root not in source_path.parents:
                raise ValueError("Source path escapes pack directory")
            data = source_path.read_bytes()
            with Image.open(BytesIO(data)) as source:
                source.load()
                baseline[asset_id] = {
                    "sourceSrc": asset["src"],
                    "sourceSha256": sha256(data),
                    "sourceBytes": len(data),
                    "width": source.width,
                    "height": source.height,
                    "declaredWidth": asset.get("width"),
                    "declaredHeight": asset.get("height"),
                }
        except Exception as exc:
            errors.append({"assetId": asset_id, "stage": "preflight", "error": str(exc)})
    before_manifest = {
        "beforePackSha256": sha256(pack_bytes),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "assets": baseline,
        "errors": errors,
    }
    write_json(output_root / "source-manifest.json", before_manifest)
    if errors:
        write_json(output_root / "errors.json", errors)
        print(json.dumps({"status": "preflight_failed", "errors": errors}), flush=True)
        return 1
    print(f"Preflight froze {len(baseline)} source hashes, "
          f"{sum(x['sourceBytes'] for x in baseline.values()):,} bytes", flush=True)
    result_assets = {}
    jobs = [(asset_id, item, str(pack_root), str(output_root)) for asset_id, item in baseline.items()]
    with ProcessPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(encode_one, job): job[0] for job in jobs}
        for index, future in enumerate(as_completed(futures), start=1):
            asset_id = futures[future]
            try:
                key, result = future.result()
                result_assets[key] = result
            except Exception as exc:
                error = {"assetId": asset_id, "stage": "encode_or_verify", "error": str(exc)}
                errors.append(error)
                print(json.dumps(error), flush=True)
            if index % 20 == 0 or index == len(jobs):
                print(f"Completed {index}/{len(jobs)}; valid={len(result_assets)}, failures={len(errors)}", flush=True)
    # A complete second hash pass demonstrates that no source was replaced or
    # edited while workers were running, including images already encoded.
    for asset_id, item in baseline.items():
        current = (pack_root / item["sourceSrc"]).read_bytes()
        if sha256(current) != item["sourceSha256"]:
            errors.append({"assetId": asset_id, "stage": "final_source_hash", "error": "Source changed during run"})
    if sha256(before_pack.read_bytes()) != before_manifest["beforePackSha256"]:
        errors.append({"stage": "final_before_pack_hash", "error": "Fixed before-pack manifest changed during run"})
    result_assets = {key: result_assets[key] for key in assets if key in result_assets}
    manifest = {
        "assets": result_assets,
        "totals": {
            "assetCount": len(result_assets),
            "expectedAssetCount": len(assets),
            "beforeBytes": sum(item["sourceBytes"] for item in result_assets.values()),
            "afterBytes": sum(item["bytes"] for item in result_assets.values()),
            "rgbIdenticalAssetCount": sum(item["rgbIdentical"] for item in result_assets.values()),
            "failureCount": len(errors),
        },
        "parameters": {**PARAMETERS, "pillowVersion": PIL.__version__, "libwebpVersion": features.version("webp")},
        "sourceManifest": "source-manifest.json",
        "sourceManifestSha256": sha256((output_root / "source-manifest.json").read_bytes()),
        "beforePackSha256": before_manifest["beforePackSha256"],
        "sourcesUnchangedAfterEncoding": not any(error["stage"].startswith("final_") for error in errors),
        "completedAt": datetime.now(timezone.utc).isoformat(),
        "errors": errors,
    }
    write_json(output_root / "manifest.json", manifest)
    write_json(output_root / "errors.json", errors)
    print(json.dumps({"status": "failed" if errors else "complete", "totals": manifest["totals"]}), flush=True)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
