import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG_PATH = BASE_DIR / "config.json"


def load_config(config_path):
    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with config_path.open("r", encoding="utf-8") as file:
        return json.load(file)


def resolve_path(path_value, base_dir=BASE_DIR):
    path = Path(path_value)
    if path.is_absolute():
        return path
    return base_dir / path


def get_output_dir(config, override):
    if override:
        return resolve_path(override)

    output_dir = config.get("output_dir")
    if not output_dir:
        output_dir = config.get("storage", {}).get("output_dir")
    if not output_dir:
        output_dir = "output"

    return resolve_path(output_dir)


def get_rendition_names(config):
    renditions = config.get("renditions", [])
    names = [rendition.get("name") for rendition in renditions if rendition.get("name")]
    if not names:
        raise ValueError("No renditions found in config.json")
    return names


def infer_video_groups(input_dir, rendition_names):
    groups = {}
    for input_file in input_dir.glob("*.mp4"):
        stem = input_file.stem
        for rendition_name in rendition_names:
            suffix = f"_{rendition_name}"
            if stem.endswith(suffix):
                video_id = stem[: -len(suffix)]
                groups.setdefault(video_id, {})[rendition_name] = input_file
                break
    return groups


def select_video_ids(args, groups):
    if args.all:
        if not groups:
            raise ValueError("No transcoded MP4 files found to package.")
        return sorted(groups.keys())

    if args.video_id:
        return [args.video_id]

    if len(groups) == 1:
        return [next(iter(groups))]

    if not groups:
        raise ValueError("No transcoded MP4 files found. Pass a video_id or check --input-dir.")

    available = ", ".join(sorted(groups.keys()))
    raise ValueError(f"Multiple video IDs found ({available}). Pass one video_id or use --all.")


def build_packager_command(config, input_files, packager_bin):
    command = [
        packager_bin,
        "--segment_duration",
        str(config.get("segment_duration", 6)),
    ]

    for rendition_name, input_file in input_files:
        video_init = f"{rendition_name}/video.mp4"
        video_segment = f"{rendition_name}/v_$Number$.m4s"
        audio_init = f"{rendition_name}/audio.mp4"
        audio_segment = f"{rendition_name}/a_$Number$.m4s"

        command.append(
            f"input={input_file},stream=video,output={video_init},segment_template={video_segment}"
        )
        command.append(
            f"input={input_file},stream=audio,output={audio_init},segment_template={audio_segment}"
        )

    command.extend(["--mpd_output", "manifest.mpd"])

    encryption = config.get("encryption", {})
    if encryption.get("enabled"):
        key_id = encryption.get("key_id")
        key = encryption.get("key")
        if not key_id or not key:
            raise ValueError("Encryption is enabled, but key_id/key is missing in config.json")

        command.extend(
            [
                "--enable_raw_key_encryption",
                "--keys",
                f"label=:key_id={key_id}:key={key}",
                "--protection_scheme",
                encryption.get("protection_scheme", "cenc"),
            ]
        )

    return command


def package_video(video_id, groups, rendition_names, config, output_root, args):
    if video_id not in groups:
        expected = ", ".join(f"{video_id}_{name}.mp4" for name in rendition_names)
        raise ValueError(f"No transcoded files found for '{video_id}'. Expected one of: {expected}")

    found = groups[video_id]
    missing = [name for name in rendition_names if name not in found]
    if missing and args.strict:
        missing_files = ", ".join(f"{video_id}_{name}.mp4" for name in missing)
        raise ValueError(f"Missing required rendition(s): {missing_files}")

    input_files = [(name, found[name]) for name in rendition_names if name in found]
    if not input_files:
        raise ValueError(f"No matching rendition files found for '{video_id}'.")

    output_dir = output_root / video_id

    command = build_packager_command(config, input_files, args.packager_bin)
    print(f"Packaging video_id: {video_id}")
    print(f"Input dir: {args.input_dir}")
    print(f"Output dir: {output_dir}")
    print("Renditions: " + ", ".join(name for name, _ in input_files))
    if missing:
        print("Skipped missing renditions: " + ", ".join(missing))
    print("Command: " + subprocess.list2cmdline(command))

    if args.dry_run:
        return

    if not shutil.which(args.packager_bin):
        raise FileNotFoundError(
            f"Shaka Packager executable not found: {args.packager_bin}. "
            "Install it or pass --packager-bin with the full path."
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    for rendition_name, _ in input_files:
        (output_dir / rendition_name).mkdir(parents=True, exist_ok=True)

    subprocess.run(command, check=True, cwd=output_dir)
    print(f"Packaging complete: {output_dir / 'manifest.mpd'}")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Standalone Shaka Packager runner for already-transcoded files."
    )
    parser.add_argument(
        "video_id",
        nargs="?",
        help="Video ID prefix, for files like workdir/<video_id>_720p.mp4.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Package every video ID found in the input directory.",
    )
    parser.add_argument(
        "--config",
        default=str(DEFAULT_CONFIG_PATH),
        help="Path to config.json.",
    )
    parser.add_argument(
        "--input-dir",
        default=str(BASE_DIR / "workdir"),
        help="Directory containing transcoded MP4 files.",
    )
    parser.add_argument(
        "--output-dir",
        help="Output root directory. Defaults to output_dir from config.json.",
    )
    parser.add_argument(
        "--packager-bin",
        default="packager",
        help="Shaka Packager executable name or full path.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail if any configured rendition is missing.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the packager command without running it.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    args.input_dir = resolve_path(args.input_dir)
    config_path = resolve_path(args.config)

    try:
        config = load_config(config_path)
        rendition_names = get_rendition_names(config)
        groups = infer_video_groups(args.input_dir, rendition_names)
        video_ids = select_video_ids(args, groups)
        output_root = get_output_dir(config, args.output_dir)

        for video_id in video_ids:
            package_video(video_id, groups, rendition_names, config, output_root, args)
    except subprocess.CalledProcessError as error:
        print(f"Packaging failed with exit code {error.returncode}", file=sys.stderr)
        return error.returncode
    except Exception as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
