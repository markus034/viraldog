"""
Video editing module — Batch video processing using native FFmpeg subprocesses
for maximum performance, low memory usage, and zero memory leaks.
"""
import os
import sys
import re
import time
import uuid
import random
import string
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont
import textwrap
from utils import get_ffmpeg_exe

# ponytail: Windows-only flag to hide console windows spawned by ffmpeg subprocesses.
_NO_WINDOW = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0


def resolve_font_file(font_family: str = "Arial", is_bold: bool = False) -> str:
    """
    Finds the requested font TTF file across packaged app resources,
    local backend fonts, frontend fonts, or Windows system fonts.
    Always returns a valid existing font path.
    """
    custom_fonts_map = {
        "Arial": "arialbd.ttf" if is_bold else "arial.ttf",
        "Roboto": "Roboto-Bold.ttf" if is_bold else "Roboto-Regular.ttf",
        "Inter": "Inter-Bold.ttf" if is_bold else "Inter-Regular.ttf",
        "Anton": "Anton-Regular.ttf",
        "Wedges": "Wedges.ttf",
        "Archivo Black": "ArchivoBlack-Regular.ttf",
        "League Spartan": "LeagueSpartan-Bold.ttf"
    }
    target_filename = custom_fonts_map.get(font_family, "arialbd.ttf" if is_bold else "arial.ttf")

    # Candidate directories
    base_dirs = []
    if getattr(sys, "frozen", False):
        if hasattr(sys, "_MEIPASS"):
            base_dirs.append(os.path.join(sys._MEIPASS, "fonts"))
        base_dirs.append(os.path.join(os.path.dirname(sys.executable), "fonts"))
        base_dirs.append(os.path.join(os.path.dirname(sys.executable), "_internal", "fonts"))

    cur_dir = os.path.dirname(os.path.abspath(__file__))
    base_dirs.extend([
        os.path.join(cur_dir, "fonts"),
        os.path.join(cur_dir, "_internal", "fonts"),
        os.path.join(cur_dir, "..", "frontend", "public", "fonts"),
        os.path.join(cur_dir, "..", "frontend", "dist", "fonts"),
        os.path.join(cur_dir, "..", "resources", "fonts"),
        os.path.join(cur_dir, "..", "resources", "frontend", "dist", "fonts"),
    ])

    for d in base_dirs:
        candidate = os.path.abspath(os.path.join(d, target_filename))
        if os.path.isfile(candidate):
            return candidate

    # Check Windows system fonts
    win_fonts = os.environ.get("WINDIR", "C:\\Windows") + "\\Fonts"
    win_candidate = os.path.join(win_fonts, target_filename)
    if os.path.isfile(win_candidate):
        return win_candidate

    # Try standard fallback fonts on Windows
    for fallback in ["arialbd.ttf" if is_bold else "arial.ttf", "arial.ttf", "calibri.ttf", "segoeui.ttf", "tahoma.ttf"]:
        fb_path = os.path.join(win_fonts, fallback)
        if os.path.isfile(fb_path):
            return fb_path

    # Try any ttf in backend/fonts
    for d in base_dirs:
        if os.path.isdir(d):
            for f in os.listdir(d):
                if f.lower().endswith(".ttf"):
                    return os.path.abspath(os.path.join(d, f))

    return ""


def wrap_text_for_box(text: str, box_width_px: int, font_size_px: int) -> str:
    if not text:
        return ""
    # Estimate characters per line based on font size (average width is approx 0.55 of font size)
    char_width = font_size_px * 0.55
    max_chars = max(5, int(box_width_px / char_width))
    
    # Process paragraph by paragraph (preserving original manual newlines)
    paragraphs = text.split("\n")
    wrapped_paragraphs = []
    for p in paragraphs:
        if not p.strip():
            wrapped_paragraphs.append("")
        else:
            wrapped_paragraphs.extend(textwrap.wrap(p, width=max_chars))
            
    return "\n".join(wrapped_paragraphs)

def get_video_info(video_path: str) -> dict:
    """
    Quickly extract video metadata (duration, width, height, has_audio)
    using a brief FFmpeg probe. Takes ~50ms.
    """
    ffmpeg_exe = get_ffmpeg_exe()
    try:
        result = subprocess.run(
            [ffmpeg_exe, "-i", video_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="ignore",
            creationflags=_NO_WINDOW
        )
        output = result.stderr
        
        # Parse duration
        # Duration: 00:00:15.34, start: 0.000000, bitrate: 1234 kb/s
        duration = 0.0
        dur_match = re.search(r"Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})", output)
        if dur_match:
            hours = int(dur_match.group(1))
            minutes = int(dur_match.group(2))
            seconds = int(dur_match.group(3))
            centiseconds = int(dur_match.group(4))
            duration = hours * 3600 + minutes * 60 + seconds + centiseconds / 100.0
            
        # Parse resolution
        width, height = 1080, 1920
        res_match = re.search(r"Video:.*?\b(\d{3,4})x(\d{3,4})\b", output)
        if res_match:
            width = int(res_match.group(1))
            height = int(res_match.group(2))
            
        has_audio = "Audio:" in output
        
        return {
            "duration": duration,
            "width": width,
            "height": height,
            "has_audio": has_audio
        }
    except Exception as e:
        print(f"Error getting video info: {e}")
        return {"duration": 10.0, "width": 1080, "height": 1920, "has_audio": False}


def detect_template_video_zone(template_path: str, std_threshold: float = 8.0) -> tuple:
    """
    Analyzes a template PNG image to automatically detect the central video window.

    Three strategies are tried in order:
    1. Alpha channel — transparent rows mark the video window (most reliable for
       PNGs that have actual transparency).
    2. Content-block detection — finds contiguous bands of high-variance rows
       (logos, decorations) and infers video zone between them. Works for templates
       where the logo/header sits atop a solid-color central area.
    3. Solid-border band detection — if top/bottom rows are uniform (std < threshold),
       those uniform bands are the frame; the video window is in between.

    Returns (header_height, bottom_y) in pixels, or defaults (160, 1820) on failure.
    """
    import numpy as np
    from itertools import groupby
    from operator import itemgetter

    DEFAULT_HEADER = 160
    DEFAULT_BOTTOM = 1820

    try:
        img = Image.open(template_path)
        img_w, img_h = img.size

        # ── Strategy 1: Alpha channel ──────────────────────────────────────────
        if img.mode in ("RGBA", "LA"):
            alpha = np.array(img.getchannel("A"))  # shape (H, W)
            transparent_ratio_per_row = (alpha < 128).mean(axis=1)  # (H,)
            TRANSPARENT_ROW_THRESHOLD = 0.5

            header_height = DEFAULT_HEADER
            bottom_y = DEFAULT_BOTTOM

            for y in range(img_h):
                if transparent_ratio_per_row[y] >= TRANSPARENT_ROW_THRESHOLD:
                    header_height = y
                    break

            for y in range(img_h - 1, -1, -1):
                if transparent_ratio_per_row[y] >= TRANSPARENT_ROW_THRESHOLD:
                    bottom_y = y + 1
                    break

            if header_height < bottom_y:
                print(f"detect_template_video_zone (alpha): header={header_height}, bottom={bottom_y}")
                return header_height, bottom_y

        # ── Shared: compute per-row std-dev ────────────────────────────────────
        frame = np.array(img.convert("RGB"), dtype=np.float32)  # (H, W, 3)
        row_std = np.std(frame, axis=(1, 2))  # (H,)
        high_std_rows = np.where(row_std > std_threshold)[0]

        # ── Strategy 2: Contiguous content-block detection ─────────────────────
        # Group high-std rows into contiguous blocks (logo/decoration bands).
        # The video zone is the largest uniform gap between these blocks.
        if len(high_std_rows) > 0:
            blocks = []
            for k, g in groupby(enumerate(high_std_rows), lambda x: x[0] - x[1]):
                group = list(map(itemgetter(1), g))
                blocks.append((int(group[0]), int(group[-1])))

            # The header block is any block(s) confined to the top 40% of the image
            top_blocks = [b for b in blocks if b[0] < img_h * 0.4]
            # The footer block is any block(s) confined to the bottom 40%
            bot_blocks = [b for b in blocks if b[1] > img_h * 0.6]

            header_height = top_blocks[-1][1] + 1 if top_blocks else 0
            bottom_y = bot_blocks[0][0] if bot_blocks else img_h

            # Sanity: video zone must be at least 30% of total height
            if header_height < bottom_y and (bottom_y - header_height) > img_h * 0.3:
                print(f"detect_template_video_zone (blocks): header={header_height}, bottom={bottom_y}")
                return header_height, bottom_y

        # ── Strategy 3: Solid-border band (uniform top/bottom) ─────────────────
        header_height = 0
        for y in range(img_h):
            if row_std[y] > std_threshold:
                break
            header_height = y + 1

        bottom_y = img_h
        for y in range(img_h - 1, -1, -1):
            if row_std[y] > std_threshold:
                # First row from bottom with content → footer starts here
                break
            bottom_y = y

        # Sanity checks
        if header_height >= bottom_y or header_height > img_h * 0.5 or bottom_y < img_h * 0.5:
            print(f"detect_template_video_zone (std): values out of range (h={header_height}, b={bottom_y}), using defaults.")
            return DEFAULT_HEADER, DEFAULT_BOTTOM

        print(f"detect_template_video_zone (std): header={header_height}, bottom={bottom_y}")
        return header_height, bottom_y

    except Exception as e:
        print(f"Warning: detect_template_video_zone failed: {e}")
        return DEFAULT_HEADER, DEFAULT_BOTTOM


def detect_video_content_bounds(video_path: str) -> tuple:
    """
    Detects overlay/borders (TikTok/Reels UI header/footer) using a robust
    heuristic frame-to-frame activity and background-color analysis.
    Returns (top, bottom, left, right) pixel offsets relative to the video's native resolution.
    """
    import sys
    import os
    import tempfile
    import subprocess
    import numpy as np
    from PIL import Image
    import imageio_ffmpeg

    try:
        # Get video information (duration, native resolution)
        info = get_video_info(video_path)
        duration = info.get("duration", 10.0)
        native_w = info.get("width", 1080)
        native_h = info.get("height", 1920)

        if duration <= 1.0:
            return 0, 0, 0, 0

        # Define 3 frame extraction timestamps (20%, 50%, 80%)
        timestamps = [duration * 0.2, duration * 0.5, duration * 0.8]
        ffmpeg_exe = get_ffmpeg_exe()
        
        frames = []
        temp_files = []
        
        for ts in timestamps:
            temp_frame = tempfile.mktemp(suffix=".png")
            temp_files.append(temp_frame)
            try:
                subprocess.run(
                    [ffmpeg_exe, "-y", "-ss", f"{ts:.3f}", "-i", video_path, "-vframes", "1", temp_frame],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=_NO_WINDOW
                )
                if os.path.exists(temp_frame):
                    # Load frame and convert to RGB
                    img = Image.open(temp_frame).convert("RGB")
                    # Resize to a smaller standard resolution for fast processing (e.g. height=480, preserving aspect ratio)
                    h_small = 480
                    w_small = int(native_w * (h_small / native_h))
                    if w_small % 2 != 0:
                        w_small += 1
                    img_small = img.resize((w_small, h_small), Image.Resampling.NEAREST)
                    frames.append(np.array(img_small, dtype=np.int16)) # int16 to avoid underflow/overflow on subtraction
            except Exception as e:
                print(f"Error extracting frame at {ts}s: {e}")

        # Clean up temp files immediately
        for tf in temp_files:
            if os.path.exists(tf):
                try:
                    os.remove(tf)
                except OSError:
                    pass

        if len(frames) < 1:
            print("Could not extract enough frames for comparison. Falling back to zero crops.")
            return 0, 0, 0, 0

        # Filter out invalid frames (e.g., transition frames that are completely black/white or uniform)
        # Average brightness must be > 20 and std-dev of pixels > 5 to be valid video content
        valid_frames = [f for f in frames if np.mean(f) > 20 and np.std(f) > 5]
        if not valid_frames:
            # Fallback if all frames seem dark/uniform
            valid_frames = frames

        h_small, w_small = valid_frames[0].shape[0], valid_frames[0].shape[1]
        
        # Calculate pixel-level differences between adjacent frames to identify motion/activity
        # If we only have 1 frame, activity will be 0 (all static)
        diffs = []
        if len(valid_frames) >= 2:
            for idx in range(len(valid_frames) - 1):
                diffs.append(np.abs(valid_frames[idx] - valid_frames[idx+1]))
            
        pixel_activity = np.zeros((h_small, w_small), dtype=bool)
        for diff in diffs:
            pixel_activity = pixel_activity | (np.max(diff, axis=2) > 10)
            
        # For each row, calculate the fraction of active pixels (motion)
        row_activity = pixel_activity.mean(axis=1) # shape (H_small,)
        
        # Classify rows as "solid" (white or black background bands)
        # We calculate the ratio of black/white pixels in each row across frames.
        # We use slightly more relaxed thresholds to tolerate noise.
        row_black_ratio_list = []
        row_white_ratio_list = []
        for frame in valid_frames:
            # Check for black pixels: R < 45, G < 45, B < 45
            is_black_pixel = (frame[:, :, 0] < 45) & (frame[:, :, 1] < 45) & (frame[:, :, 2] < 45)
            row_black_ratio_list.append(is_black_pixel.mean(axis=1))
            
            # Check for white pixels: R > 210, G > 210, B > 210
            is_white_pixel = (frame[:, :, 0] > 210) & (frame[:, :, 1] > 210) & (frame[:, :, 2] > 210)
            row_white_ratio_list.append(is_white_pixel.mean(axis=1))
            
        # Average ratios across valid frames
        mean_black_ratio = np.mean(row_black_ratio_list, axis=0) # shape (H_small,)
        mean_white_ratio = np.mean(row_white_ratio_list, axis=0) # shape (H_small,)
        
        # A row is solid if it is predominantly black/white AND has low activity (not active content)
        # We increase the activity threshold from 0.05 to 0.15 to allow status icons/captions
        row_solid_black = (mean_black_ratio > 0.50) & (row_activity <= 0.15)
        row_solid_white = (mean_white_ratio > 0.50) & (row_activity <= 0.15)
        
        row_solid = row_solid_white | row_solid_black
        
        # Video content rows are rows that are not solid white/black backgrounds
        is_video_row = ~row_solid
        
        # Scan from top down to find the starting index of video content
        # We increase consecutive_threshold from 6 to 15 to skip clock/battery icons or top bars
        y_start_small = 0
        consecutive_threshold = 15
        
        for y in range(h_small - consecutive_threshold):
            if np.all(is_video_row[y : y + consecutive_threshold]):
                y_start_small = y
                break
                
        # Scan from bottom up to find the ending index of video content
        y_end_small = h_small
        for y in range(h_small - 1, consecutive_threshold, -1):
            if np.all(is_video_row[y - consecutive_threshold : y]):
                y_end_small = y
                break

        # Map back to native resolution
        y_start = int(y_start_small * (native_h / h_small))
        y_end = int(y_end_small * (native_h / h_small))
        
        # Ensure start < end and within bounds
        y_start = max(0, min(y_start, native_h))
        y_end = max(y_start + 100, min(y_end, native_h))
        
        # Adicionar recuo de precisão de 5 pixels para eliminar frestas e bordas residuais
        top_crop = y_start + (5 if y_start > 0 else 0)
        bot_crop = (native_h - y_end) + (5 if (native_h - y_end) > 0 else 0)
        
        # Ignore crops smaller than 25 pixels
        if top_crop < 25:
            top_crop = 0
        if bot_crop < 25:
            bot_crop = 0
            
        print(f"[CROP HEURISTIC] Video content bounds: y_start={y_start}, y_end={y_end} (native_h={native_h}). Crops: top={top_crop}, bottom={bot_crop}")
        return int(top_crop), int(bot_crop), 0, 0

    except Exception as e:
        print(f"Error in heuristic crop bounds detection: {e}. Returning zero crops.")
        return 0, 0, 0, 0




def format_filter_chain(input_label: str, filters: list, output_label: str = None, is_audio: bool = False) -> str:
    """Helper to assemble a list of filter strings into a syntactically correct FFmpeg filter chain."""
    if not filters:
        if output_label:
            null_filter = "anull" if is_audio else "null"
            return f"{input_label}{null_filter}{output_label}"
        return ""
    chain = f"{input_label}{filters[0]}"
    if len(filters) > 1:
        chain += "," + ",".join(filters[1:])
    if output_label:
        chain += output_label
    return chain


def to_ffmpeg_color(c: str) -> str:
    """Convert web color string to FFmpeg-compatible drawtext/drawbox color representation."""
    c = c.strip().lower()
    if c == "white":
        return "white"
    if c == "black":
        return "black"
    if c.startswith("rgba"):
        # extract nums
        parts = c[c.find("(")+1:c.find(")")].split(",")
        r = int(parts[0].strip())
        g = int(parts[1].strip())
        b = int(parts[2].strip())
        a = float(parts[3].strip())
        if a > 1.0:
            a = a / 255.0
        return f"0x{r:02x}{g:02x}{b:02x}@{a:.2f}"
    if c.startswith("rgb"):
        parts = c[c.find("(")+1:c.find(")")].split(",")
        r = int(parts[0].strip())
        g = int(parts[1].strip())
        b = int(parts[2].strip())
        return f"0x{r:02x}{g:02x}{b:02x}"
    return c


def escape_drawtext_text(t: str) -> str:
    """Escape text for drawtext filter."""
    # FFmpeg drawtext escaping rules: escape backslashes, single quotes, colons, commas, percents, semicolons, equals
    t = t.replace('\\', '\\\\')
    t = t.replace("'", "'\\''")
    t = t.replace(':', '\\:')
    t = t.replace(',', '\\,')
    t = t.replace('%', '\\%')
    t = t.replace(';', '\\;')
    t = t.replace('=', '\\=')
    return t


def escape_path_for_filter(p: str) -> str:
    """Escape path for subtitles filter."""
    p = p.replace('\\', '/')
    p = p.replace(':', '\\:')
    p = p.replace("'", "'\\\\''").replace(',', '\\,')
    return p


# ─── Subtitle Transcription Functions ───

def generate_subtitles(video_path: str, mode: str = "api", api_key: str = None, model_size: str = "base") -> str:
    """
    Transcribe audio from video and generate SRT subtitle content.
    Modes: "api" (OpenAI Whisper API) or "local" (local whisper model).
    """
    if mode == "api" and api_key:
        return _whisper_api_transcribe(video_path, api_key)
    else:
        return _whisper_local_transcribe(video_path, model_size)


def _whisper_api_transcribe(video_path: str, api_key: str) -> str:
    import openai
    client = openai.OpenAI(api_key=api_key)
    with open(video_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="srt"
        )
    return transcript


def _whisper_local_transcribe(video_path: str, model_size: str = "base") -> str:
    try:
        import whisper
    except ImportError:
        raise ImportError("openai-whisper não está instalado. Execute: pip install openai-whisper")
    
    model = whisper.load_model(model_size)
    result = model.transcribe(video_path, language="pt")
    
    srt_lines = []
    for i, segment in enumerate(result["segments"], 1):
        start = _format_srt_time(segment["start"])
        end = _format_srt_time(segment["end"])
        text = segment["text"].strip()
        srt_lines.append(f"{i}\n{start} --> {end}\n{text}\n")
    
    return "\n".join(srt_lines)


def _format_srt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


# ─── Thumbnail Generation ───

def generate_thumbnail(
    video_path: str,
    timestamp_sec: float = 1.0,
    text_overlay: str = None,
    output_path: str = None,
    size: tuple = (1080, 1080)
) -> str:
    """
    Extract a frame from a video and optionally add text overlay.
    Uses FFmpeg for frame extraction and Pillow for overlays.
    """
    if not output_path:
        base = os.path.splitext(video_path)[0]
        output_path = f"{base}_thumb.jpg"
        
    temp_frame = tempfile.mktemp(suffix=".png")
    ffmpeg_exe = get_ffmpeg_exe()
    
    try:
        # Determine video duration
        info = get_video_info(video_path)
        timestamp_sec = min(timestamp_sec, info["duration"] - 0.1)
        timestamp_sec = max(timestamp_sec, 0.0)
        
        # Extract frame
        subprocess.run(
            [ffmpeg_exe, "-y", "-ss", str(timestamp_sec), "-i", video_path, "-vframes", "1", temp_frame],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=_NO_WINDOW
        )
        
        if not os.path.exists(temp_frame):
            raise FileNotFoundError("FFmpeg failed to extract thumbnail frame.")
            
        img = Image.open(temp_frame).convert("RGB")
        img_w, img_h = img.size
        target_w, target_h = size
        
        # Scale & center crop
        scale = max(target_w / img_w, target_h / img_h)
        img = img.resize((int(img_w * scale), int(img_h * scale)), Image.Resampling.LANCZOS)
        
        img_w, img_h = img.size
        left = (img_w - target_w) // 2
        top = (img_h - target_h) // 2
        img = img.crop((left, top, left + target_w, top + target_h))
        
        # Add text overlay
        if text_overlay:
            draw = ImageDraw.Draw(img)
            try:
                font = ImageFont.truetype("C:\\Windows\\Fonts\\arialbd.ttf", int(target_h * 0.06))
            except Exception:
                font = ImageFont.load_default()
                
            try:
                left_b, top_b, right_b, bottom_b = draw.textbbox((0, 0), text_overlay, font=font)
                tw = right_b - left_b
                th = bottom_b - top_b
            except AttributeError:
                tw, th = draw.textsize(text_overlay, font=font)
                
            x = (target_w - tw) // 2
            y = int(target_h * 0.8)
            
            # Shadow
            draw.text((x + 2, y + 2), text_overlay, fill=(0, 0, 0), font=font)
            # Text
            draw.text((x, y), text_overlay, fill=(255, 255, 255), font=font)
            
        img.save(output_path, "JPEG", quality=95)
        return output_path
    finally:
        if os.path.exists(temp_frame):
            try:
                os.remove(temp_frame)
            except OSError:
                pass


# ─── Subtitle Shifting Helper ───

def shift_srt_timestamps(srt_content: str, shift_seconds: float) -> str:
    if not srt_content or shift_seconds == 0.0:
        return srt_content
        
    def time_to_sec(h, m, s, ms):
        return h * 3600 + m * 60 + s + ms / 1000.0
        
    def sec_to_time_str(seconds):
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        ms = int(round((seconds % 1) * 1000))
        if ms >= 1000:
            s += 1
            ms -= 1000
        if s >= 60:
            m += 1
            s -= 60
        if m >= 60:
            h += 1
            m -= 60
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    pattern = r"(\d{2}):(\d{2}):(\d{2}),(\d{3})"
    
    lines = srt_content.splitlines()
    new_lines = []
    
    for line in lines:
        if "-->" in line:
            matches = re.findall(pattern, line)
            if len(matches) == 2:
                sh, sm, ss, sms = map(int, matches[0])
                start_sec = time_to_sec(sh, sm, ss, sms) - shift_seconds
                eh, em, es, ems = map(int, matches[1])
                end_sec = time_to_sec(eh, em, es, ems) - shift_seconds
                
                start_sec = max(0.0, start_sec)
                end_sec = max(0.0, end_sec)
                
                line = f"{sec_to_time_str(start_sec)} --> {sec_to_time_str(end_sec)}"
        new_lines.append(line)
        
    return "\n".join(new_lines)


# ─── Main Native FFmpeg Video Editing ───

def edit_video(
    input_path: str,
    output_path: str,
    crop_9_16: bool = False,
    crop_video: bool = False,
    mirror: bool = False,
    speed: float = 1.0,
    volume: float = 1.0,
    template_image_path: str = None,
    top_text: str = None,
    bottom_text: str = None,
    text_color: str = "white",
    bg_color: str = "rgba(0, 0, 0, 200)",
    watermark_text: str = None,
    anti_duplicity: bool = False,
    normalize_audio: bool = False,
    background_music_path: str = None,
    bg_music_volume: float = 0.3,
    fade_in: float = 0.0,
    fade_out: float = 0.0,
    burn_subs: bool = False,
    srt_content: str = None,
    subtitle_style: str = "default",
    aspect_ratio_mode: str = "original",
    generate_thumb: bool = False,
    thumbnail_timestamp: float = 1.0,
    progress_callback=None,
    preview_duration: float = None,
    template_header_height: int = 160,
    template_bottom_y: int = 1820,
    top_text_y: int = None,
    bottom_text_y: int = None,
    cut_start: float = 0.0,
    cut_end: float = None,
    video_scale: float = 1.0,
    video_x_offset: int = 0,
    video_y_offset: int = 0
) -> str:
    """
    Edits a video clip applying all configurations using native FFmpeg.
    Extremely fast, memory efficient, and runs progress reporting in real-time.
    """
    if progress_callback:
        progress_callback(5, "Analisando vídeo de entrada...")
        
    video_info = get_video_info(input_path)
    
    # 1. Determine base speed and duplicity speed shift
    actual_speed = speed
    if anti_duplicity:
        actual_speed *= random.uniform(0.985, 1.015)
        
    # 2. Output duration calculations
    orig_duration = video_info["duration"]
    start_t = max(0.0, cut_start) if cut_start is not None else 0.0
    end_t = min(orig_duration, cut_end) if (cut_end is not None and cut_end > start_t) else orig_duration
    duration_to_process = end_t - start_t
    output_duration = duration_to_process / actual_speed
    if preview_duration is not None:
        output_duration = min(preview_duration, output_duration)
        
    # 3. Detect solid borders if crop_video is enabled and crop mode is NOT already active
    t, b, l, r = 0, 0, 0, 0
    has_template = template_image_path and os.path.exists(template_image_path)
    if crop_video and not crop_9_16 and aspect_ratio_mode not in ('crop_916', 'blur_916'):
        if progress_callback:
            progress_callback(10, "Detectando área útil do vídeo...")
        t, b, l, r = detect_video_content_bounds(input_path)
        
    # 4. Read template dimensions
    target_w, target_h = 1080, 1920
    if has_template:
        try:
            with Image.open(template_image_path) as img:
                target_w, target_h = img.size
        except Exception as e:
            print(f"Warning: Failed to read template image size: {e}")
            
    # Assemble inputs and keep track of indices
    ffmpeg_exe = get_ffmpeg_exe()
    inputs = [ffmpeg_exe, "-y"]
    
    # Input 0: Video
    if cut_start > 0.0:
        inputs.extend(["-ss", f"{cut_start:.3f}", "-i", input_path])
    else:
        inputs.extend(["-i", input_path])
    video_idx = 0
    template_idx = -1
    music_idx = -1
    
    next_idx = 1
    if has_template:
        inputs.extend(["-loop", "1", "-i", template_image_path])
        template_idx = next_idx
        next_idx += 1
        
    if background_music_path and os.path.exists(background_music_path):
        inputs.extend(["-stream_loop", "-1", "-i", background_music_path])
        music_idx = next_idx
        next_idx += 1
        
    # Filter complex parts assembly
    filter_complex_parts = []
    
    # A. Video base transformations: crop borders, hflip, setpts
    v_base_filters = []
    # If custom placement is used, we do not pad it here since it will be positioned on a 1080x1920 canvas in step B.
    use_custom_placement = has_template or crop_video or crop_9_16 or aspect_ratio_mode in ("crop_916", "blur_916")
    
    if t > 0 or b > 0 or l > 0 or r > 0:
        v_base_filters.append(f"crop=iw-{l}-{r}:ih-{t}-{b}:{l}:{t}")
        if not has_template and not use_custom_placement:
            v_base_filters.append(f"pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:black")
    if mirror:
        v_base_filters.append("hflip")
    if actual_speed != 1.0:
        v_base_filters.append(f"setpts=PTS/{actual_speed}")
        
    v_base = format_filter_chain("[0:v]", v_base_filters, "[v_basic]")
    if v_base:
        filter_complex_parts.append(v_base)
        v_source = "[v_basic]"
    else:
        v_source = "[0:v]"
    
    # B. Aspect ratio and templates fitting
    if use_custom_placement:
        if has_template:
            zone_y = template_header_height if template_header_height is not None else 160
            zone_bottom = template_bottom_y if template_bottom_y is not None else 1820
            zone_w = target_w
            zone_h = zone_bottom - zone_y
        else:
            zone_y = 0
            zone_bottom = 1920
            zone_w = 1080
            zone_h = 1920
            
        iw_actual = video_info["width"]
        ih_actual = video_info["height"]
        if t > 0 or b > 0 or l > 0 or r > 0:
            iw_actual = iw_actual - l - r
            ih_actual = ih_actual - t - b
        video_ar = iw_actual / ih_actual if ih_actual > 0 else 9/16
        
        # Cover fit calculations:
        zone_ar = zone_w / zone_h
        if video_ar > zone_ar:
            # Video is wider than the zone: scale by height to fully cover
            base_h = zone_h
            base_w = base_h * video_ar
        else:
            # Video is taller (or same AR): scale by width to fully cover
            base_w = zone_w
            base_h = base_w / video_ar

        # Apply user-controlled scale on top of the cover-fit base
        sw = int(base_w * video_scale)
        sh = int(base_h * video_scale)
            
        if sw % 2 != 0:
            sw += 1
        if sh % 2 != 0:
            sh += 1
            
        # Calculate position relative to the zone (default centered)
        default_x = (zone_w - sw) / 2
        default_y = (zone_h - sh) / 2
        
        x = int(default_x + video_x_offset)
        y = int(default_y + video_y_offset)
        
        # 1. Scale the video
        scale_fit = f"{v_source}scale={sw}:{sh}[v_scaled]"
        filter_complex_parts.append(scale_fit)
        
        if has_template:
            # 2. Create a transparent zone canvas to clip the video within zone bounds
            color_zone = f"color=c=black@0:s={zone_w}x{zone_h}[v_zone_canvas]"
            filter_complex_parts.append(color_zone)
            
            # 3. Overlay the scaled video onto the zone canvas (clips it to zone bounds)
            overlay_zone = f"[v_zone_canvas][v_scaled]overlay={x}:{y}:shortest=1[v_fitted]"
            filter_complex_parts.append(overlay_zone)
            
            # 4. Place template PNG as base, then overlay the video zone on top at zone_y
            video_placement = f"[{template_idx}:v][v_fitted]overlay=0:{zone_y}:shortest=1[v_templated]"
            filter_complex_parts.append(video_placement)
            v_source = "[v_templated]"
        elif aspect_ratio_mode == "blur_916":
            # 2. Blurred background (1080x1920)
            blur_bg = f"{v_source}scale='iw*max(1080/iw,1920/ih)':'ih*max(1080/iw,1920/ih)',crop=1080:1920,gblur=sigma=30,drawbox=w=1080:h=1920:t=fill:color=black@0.5[v_blur_bg]"
            filter_complex_parts.append(blur_bg)
            
            # 3. Overlay scaled video centered/positioned on top of blurred background
            video_placement = f"[v_blur_bg][v_scaled]overlay={x}:{y}:shortest=1[v_templated]"
            filter_complex_parts.append(video_placement)
            v_source = "[v_templated]"
        else:
            # 2. Black background (1080x1920)
            color_bg = f"color=c=black:s=1080x1920[v_black_bg]"
            filter_complex_parts.append(color_bg)
            
            # 3. Overlay scaled video centered/positioned on top of black background
            video_placement = f"[v_black_bg][v_scaled]overlay={x}:{y}:shortest=1[v_templated]"
            filter_complex_parts.append(video_placement)
            v_source = "[v_templated]"
            
    # C. Anti-duplicity video tweaks
    if anti_duplicity:
        b_val = random.uniform(-0.015, 0.015)
        c_val = random.uniform(0.98, 1.02)
        s_val = random.uniform(0.98, 1.02)
        tweak = f"{v_source}eq=brightness={b_val}:contrast={c_val}:saturation={s_val}[v_tweaked]"
        filter_complex_parts.append(tweak)
        v_source = "[v_tweaked]"
        
    # D. Text and subtitles decorations
    decorations = []
    
    # Top Text Banner
    if top_text:
        banner_h = int(target_h * 0.12) if (has_template or aspect_ratio_mode in ("blur_916", "crop_916") or crop_9_16) else int(video_info["height"] * 0.12)
        font_size_top = int(banner_h * 0.4)
        y_val = top_text_y if top_text_y is not None else 0
        bg_color_ff = to_ffmpeg_color(bg_color)
        text_color_ff = to_ffmpeg_color(text_color)
        escaped_text = escape_drawtext_text(top_text)
        decorations.append(f"drawbox=y={y_val}:w=iw:h={banner_h}:color={bg_color_ff}:t=fill")
        decorations.append(f"drawtext=font='Arial':text='{escaped_text}':fontcolor={text_color_ff}:fontsize={font_size_top}:x=(w-tw)/2:y={y_val}+({banner_h}-th)/2")
        
    # Bottom Text Banner
    if bottom_text:
        h_ref = target_h if (has_template or aspect_ratio_mode in ("blur_916", "crop_916") or crop_9_16) else video_info["height"]
        banner_h = int(h_ref * 0.12)
        font_size_bot = int(banner_h * 0.4)
        y_val = bottom_text_y if bottom_text_y is not None else h_ref - banner_h
        bg_color_ff = to_ffmpeg_color(bg_color)
        text_color_ff = to_ffmpeg_color(text_color)
        escaped_text = escape_drawtext_text(bottom_text)
        decorations.append(f"drawbox=y={y_val}:w=iw:h={banner_h}:color={bg_color_ff}:t=fill")
        decorations.append(f"drawtext=font='Arial':text='{escaped_text}':fontcolor={text_color_ff}:fontsize={font_size_bot}:x=(w-tw)/2:y={y_val}+({banner_h}-th)/2")
        
    # Watermark Text
    if watermark_text:
        h_ref = target_h if (has_template or aspect_ratio_mode in ("blur_916", "crop_916") or crop_9_16) else video_info["height"]
        font_size_wm = int(h_ref * 0.03)
        escaped_wm = escape_drawtext_text(watermark_text)
        decorations.append(f"drawtext=font='Arial':text='{escaped_wm}':fontcolor=white@0.3:fontsize={font_size_wm}:x=w-tw-10:y=h-th-10")
        
    # Subtitles burning
    temp_srt_filename = None
    temp_srt_path = None
    output_dir = os.path.dirname(output_path)
    if not output_dir:
        output_dir = os.getcwd()
        
    if burn_subs and srt_content:
        # Shift subtitles to match the trimmed video timeline
        if cut_start > 0.0:
            srt_content = shift_srt_timestamps(srt_content, cut_start)
            
        # Write SRT directly to the output directory to avoid windows path issues
        temp_srt_filename = f"temp_subs_{uuid.uuid4().hex[:8]}.srt"
        temp_srt_path = os.path.join(output_dir, temp_srt_filename)
        with open(temp_srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)
            
        style_ass = ""
        if subtitle_style == "default":
            style_ass = "FontSize=18,PrimaryColour=&H00FFFFFF,BorderStyle=3,Outline=0,Shadow=0,MarginV=25"
        elif subtitle_style == "minimal":
            style_ass = "FontSize=18,PrimaryColour=&H00FFFFFF,BorderStyle=1,Outline=1,Shadow=1,OutlineColour=&H00000000,MarginV=25"
        elif subtitle_style == "bold":
            style_ass = "FontSize=22,PrimaryColour=&H0000FFFF,Bold=1,BorderStyle=3,Outline=0,Shadow=0,MarginV=25"
            
        escaped_srt = escape_path_for_filter(temp_srt_filename)
        decorations.append(f"subtitles='{escaped_srt}':force_style='{style_ass}'")
        
    dec_chain = format_filter_chain(v_source, decorations, "[v_decorated]")
    if dec_chain:
        filter_complex_parts.append(dec_chain)
        v_final = "[v_decorated]"
    else:
        v_final = v_source
            
    # E. Audio transformations
    a_final = None
    has_vid_audio = video_info["has_audio"]
    
    if has_vid_audio:
        a_filters = []
        if volume != 1.0:
            a_filters.append(f"volume={volume}")
        if actual_speed != 1.0:
            if actual_speed < 0.5:
                a_filters.append("atempo=0.5")
            elif actual_speed > 2.0:
                a_filters.append("atempo=2.0")
            else:
                a_filters.append(f"atempo={actual_speed}")
        a_chain = format_filter_chain("[0:a]", a_filters, "[v_audio]", is_audio=True)
        if a_chain:
            filter_complex_parts.append(a_chain)
            v_audio_source = "[v_audio]"
        else:
            v_audio_source = "[0:a]"
    else:
        v_audio_source = None
        
    # Mixing BGM
    if music_idx != -1:
        bgm_chain = f"[{music_idx}:a]volume={bg_music_volume}[bg_music]"
        filter_complex_parts.append(bgm_chain)
        
        if v_audio_source:
            mix = f"{v_audio_source}[bg_music]amix=inputs=2:duration=first:dropout_transition=2[a_mixed]"
            filter_complex_parts.append(mix)
            a_source = "[a_mixed]"
        else:
            a_source = "[bg_music]"
    else:
        a_source = v_audio_source
        
    # Apply normalization & fade on final audio
    if a_source:
        a_decorations = []
        if normalize_audio:
            a_decorations.append("loudnorm")
        if fade_in > 0:
            a_decorations.append(f"afade=t=in:ss=0:d={fade_in}")
        if fade_out > 0:
            fade_out_start = max(0.0, output_duration - fade_out)
            a_decorations.append(f"afade=t=out:st={fade_out_start}:d={fade_out}")
            
        a_dec_chain = format_filter_chain(a_source, a_decorations, "[a_final]", is_audio=True)
        if a_dec_chain:
            filter_complex_parts.append(a_dec_chain)
            a_final = "[a_final]"
        else:
            a_final = a_source
            
    # Combine filtercomplex and map
    filter_complex_str = "; ".join(filter_complex_parts)
    inputs.extend(["-filter_complex", filter_complex_str])
    
    inputs.extend(["-map", v_final])
    if a_final:
        inputs.extend(["-map", a_final])
        
    # Output limits
    inputs.extend(["-t", f"{output_duration:.3f}"])
    
    # Anti-duplicity metadata comment/title/encoder
    if anti_duplicity:
        rand_id = "".join(random.choices(string.ascii_letters + string.digits, k=10))
        inputs.extend([
            "-metadata", f"comment=Automadark_{rand_id}",
            "-metadata", f"title=Reels_{rand_id}",
            "-metadata", f"encoder=lavc_{rand_id}"
        ])
        
    # Codecs & parameters
    out_filename = os.path.basename(output_path)
    inputs.extend([
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-movflags", "+faststart",
        out_filename
    ])
    
    if progress_callback:
        progress_callback(35, "Renderizando vídeo final via FFmpeg...")
        
    # Run FFmpeg process inside CWD to avoid subtitle path issues
    os.makedirs(output_dir, exist_ok=True)
    
    try:
        process = subprocess.Popen(
            inputs,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="ignore",
            cwd=output_dir,
            creationflags=_NO_WINDOW
        )
        
        # Regex to parse progress: time=HH:MM:SS.cs
        time_regex = re.compile(r"time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})")
        
        stderr_lines = []
        while True:
            line = process.stderr.readline()
            if not line:
                break
            stderr_lines.append(line)
                
            match = time_regex.search(line)
            if match and progress_callback:
                hours = int(match.group(1))
                minutes = int(match.group(2))
                seconds = int(match.group(3))
                centiseconds = int(match.group(4))
                curr_sec = hours * 3600 + minutes * 60 + seconds + centiseconds / 100.0
                
                pct = int((curr_sec / max(output_duration, 0.1)) * 100)
                # Keep it at 99% max until it fully exits
                pct = min(pct, 99)
                progress_callback(35 + int(pct * 0.6), f"Processando vídeo... {pct}%")
                
        process.wait()
        
        if process.returncode != 0:
            err_output = "".join(stderr_lines)
            raise RuntimeError(f"FFmpeg failed with exit code {process.returncode}. Error details:\n{err_output}")
            
    finally:
        # Cleanup temporary SRT file
        if temp_srt_path and os.path.exists(temp_srt_path):
            try:
                os.remove(temp_srt_path)
            except OSError:
                pass
                
    # 6. Generate thumbnail if requested
    if generate_thumb:
        if progress_callback:
            progress_callback(96, "Gerando thumbnail...")
        try:
            generate_thumbnail(output_path, thumbnail_timestamp)
        except Exception as e:
            print(f"Warning: Thumbnail generation failed: {e}")
            
    if progress_callback:
        progress_callback(100, "Edição de vídeo concluída com sucesso!")
        
    return output_path


# ─── Editor Studio Composition ───

def compose_editor_video(
    input_path: str,
    output_path: str,
    template_path: str = None,
    # Bounding box of the content region in the SOURCE video (pixels)
    bbox_x: int = 0,
    bbox_y: int = 0,
    bbox_w: int = None,
    bbox_h: int = None,
    # The transparent "hole" rectangle inside the template (pixels in template coords)
    hole_x: int = 0,
    hole_y: int = 0,
    hole_w: int = None,
    hole_h: int = None,
    template_w: int = 1080,
    template_h: int = 1920,
    # Transform options
    mirrored: bool = False,
    video_scale: float = 1.0,   # 1.0 = 100%
    trim_start: float = 0.0,
    trim_end: float = None,
    # Anti-duplicity
    anti_duplicity: bool = False,
    # Text overlay
    text_enabled: bool = False,
    text_content: str = "",
    text_pos_x_pct: float = 50.0,
    text_pos_y_pct: float = 85.0,
    text_size: int = 16,
    text_color: str = "#ffffff",
    text_bold: bool = True,
    text_shadow: bool = True,
    text_shadow_color: str = "#000000",
    text_shadow_opacity: int = 80,
    text_shadow_blur: int = 7,
    text_shadow_distance: int = 6,
    text_shadow_angle: int = 45,
    text_bg_color: str = "#000000",
    text_bg_opacity: int = 60,
    text_font_family: str = "Arial",
    text_align: str = "center",
    text_stroke_enabled: bool = False,
    text_stroke_color: str = "#000000",
    text_stroke_width: int = 3,
    text_line_spacing: int = 0,
    text_width_pct: int = 80,
    # Watermark image overlay
    watermark_path: str = None,
    watermark_opacity: float = 1.0,
    watermark_pos_x_pct: float = 50.0,
    watermark_pos_y_pct: float = 50.0,
    watermark_scale_pct: float = 25.0,
    progress_callback=None,
) -> str:
    """
    Compose a video for the editor studio: crops the source video to the specified
    bbox, scales it to fit inside the template hole, overlays the template PNG,
    and applies text/watermark overlays — all via native FFmpeg.

    Returns output_path when complete.
    """
    ffmpeg_exe = get_ffmpeg_exe()

    if progress_callback:
        progress_callback(5, "Analisando vídeo...")

    info = get_video_info(input_path)
    native_w = info["width"]
    native_h = info["height"]
    orig_duration = info["duration"]

    # Resolve defaults
    if bbox_w is None or bbox_w <= 0:
        bbox_w = native_w
    if bbox_h is None or bbox_h <= 0:
        bbox_h = native_h

    has_template = template_path and os.path.exists(template_path)

    # Resolve hole defaults = full template canvas
    if not has_template or hole_w is None or hole_w <= 0:
        hole_x, hole_y, hole_w, hole_h = 0, 0, template_w, template_h

    # Trim
    start_t = max(0.0, trim_start or 0.0)
    end_t = min(orig_duration, trim_end) if (trim_end and trim_end > start_t) else orig_duration
    duration = end_t - start_t

    # ── Build FFmpeg inputs ─────────────────────────────────────────────────
    cmd = [ffmpeg_exe, "-y"]

    # Input 0: source video (seeked to trim start)
    if start_t > 0:
        cmd.extend(["-ss", f"{start_t:.3f}"])
    cmd.extend(["-i", input_path])

    # Input 1: template image (if present)
    template_idx = -1
    watermark_idx = -1
    next_idx = 1

    if has_template:
        cmd.extend(["-loop", "1", "-i", template_path])
        template_idx = next_idx
        next_idx += 1

    has_watermark = watermark_path and os.path.exists(watermark_path)
    if has_watermark:
        cmd.extend(["-loop", "1", "-i", watermark_path])
        watermark_idx = next_idx
        next_idx += 1

    # ── Build filter_complex ────────────────────────────────────────────────
    parts = []

    # Step 1: Crop source video to bbox region
    # FFmpeg crop: crop=w:h:x:y
    bx = max(0, bbox_x)
    by = max(0, bbox_y)
    # Ensure even starting coordinates for YUV 4:2:0 alignment
    bx = bx - (bx % 2)
    by = by - (by % 2)
    bw = min(bbox_w, native_w - bx)
    bh = min(bbox_h, native_h - by)
    # Ensure even dimensions for libx264
    bw = bw - (bw % 2)
    bh = bh - (bh % 2)

    parts.append(f"[0:v]crop={bw}:{bh}:{bx}:{by}[v_cropped]")
    v_src = "[v_cropped]"

    # Step 2: Mirror if requested
    if mirrored:
        parts.append(f"{v_src}hflip[v_flipped]")
        v_src = "[v_flipped]"

    # Step 3: Scale cropped region to fit inside template hole
    # Scale proportionally relative to the template hole width vs crop box width (matching frontend CSS width: 100%)
    scale = hole_w / bbox_w if (has_template and hole_w and bbox_w) else (template_w / native_w)
    scaled_w = int(bw * scale * video_scale)
    scaled_h = int(bh * scale * video_scale)

    # Ensure even dimensions for libx264
    scaled_w = scaled_w - (scaled_w % 2) or 2
    scaled_h = scaled_h - (scaled_h % 2) or 2

    parts.append(f"{v_src}scale={scaled_w}:{scaled_h}[v_scaled]")
    v_src = "[v_scaled]"

    if has_template:
        # Step 4a: Create transparent zone canvas (hole size)
        hole_w_e = hole_w - (hole_w % 2) or 2
        hole_h_e = hole_h - (hole_h % 2) or 2
        parts.append(f"color=c=black@0:s={hole_w_e}x{hole_h_e}[v_zone]")

        # Step 4b: Overlay scaled video onto zone canvas (top-aligned inside hole)
        offset_x = (hole_w_e - scaled_w) // 2
        offset_y = 0
        parts.append(f"[v_zone]{v_src}overlay={offset_x}:{offset_y}:shortest=1[v_fitted]")

        # Step 4c: Overlay the zone onto the template canvas at hole position
        tw_e = template_w - (template_w % 2) or 2
        th_e = template_h - (template_h % 2) or 2
        parts.append(f"[{template_idx}:v]scale={tw_e}:{th_e}[v_tmpl]")
        parts.append(f"[v_tmpl][v_fitted]overlay={hole_x}:{hole_y}:shortest=1[v_composed]")
        v_src = "[v_composed]"
    else:
        # No template: just place on black canvas of template size
        tw_e = template_w - (template_w % 2) or 2
        th_e = template_h - (template_h % 2) or 2
        parts.append(f"color=c=black:s={tw_e}x{th_e}[v_bg]")
        offset_x = (tw_e - scaled_w) // 2
        offset_y = (th_e - scaled_h) // 2
        parts.append(f"[v_bg]{v_src}overlay={offset_x}:{offset_y}:shortest=1[v_composed]")
        v_src = "[v_composed]"

    # Step 5: Anti-duplicity subtle eq tweak
    if anti_duplicity:
        b_val = random.uniform(-0.015, 0.015)
        c_val = random.uniform(0.98, 1.02)
        s_val = random.uniform(0.98, 1.02)
        parts.append(f"{v_src}eq=brightness={b_val:.4f}:contrast={c_val:.4f}:saturation={s_val:.4f}[v_tweaked]")
        v_src = "[v_tweaked]"

    # Step 6: Text overlay using drawtext
    if text_enabled and text_content.strip():
        tx = int(text_pos_x_pct / 100 * template_w)
        ty = int(text_pos_y_pct / 100 * template_h)

        # Convert web hex color to FFmpeg format
        def hex_to_ff(h: str) -> str:
            h = h.lstrip("#")
            if len(h) == 6:
                return f"0x{h}"
            return "white"

        fc = hex_to_ff(text_color)
        # Calculate scale factor relative to reference editor preview width (308.5714px)
        # where text_size (e.g. 16, 24, 32) represents font size on a ~308.57px preview box (3.5x for 1080p).
        scale_factor = template_w / 308.5714
        font_size = max(4, int(round(text_size * scale_factor)))
        
        box_width = int(text_width_pct / 100.0 * template_w)
        wrapped_text = wrap_text_for_box(text_content, box_width, font_size)
        escaped = escape_drawtext_text(wrapped_text)
        
        # Resolve font file path (always use valid TTF file to ensure FFmpeg renders high-res vector text)
        font_path = resolve_font_file(text_font_family, text_bold)
        
        escaped_font_path = font_path.replace("\\", "/").replace(":", "\\:") if font_path else ""
        font_style_str = f"fontfile='{escaped_font_path}'" if escaped_font_path else ""
        
        # Background box
        bg_filter = ""
        if text_bg_color:
            bg_hex = text_bg_color.lstrip("#")
            bg_alpha = text_bg_opacity / 100.0
            bg_ff = f"0x{bg_hex}@{bg_alpha:.2f}" if len(bg_hex) == 6 else f"black@{bg_alpha:.2f}"
            scaled_boxborderw = max(1, int(round(8 * scale_factor / 3.5)))
            bg_filter = f":box=1:boxcolor={bg_ff}:boxborderw={scaled_boxborderw}"

        shadow_str = ""
        if text_shadow:
            import math
            angle_rad = math.radians(text_shadow_angle)
            sx = int(math.cos(angle_rad) * text_shadow_distance * scale_factor)
            sy = int(math.sin(angle_rad) * text_shadow_distance * scale_factor)
            sh_hex = text_shadow_color.lstrip("#")
            sh_alpha = text_shadow_opacity / 100.0
            sh_ff = f"0x{sh_hex}@{sh_alpha:.2f}" if len(sh_hex) == 6 else f"black@{sh_alpha:.2f}"
            shadow_str = f":shadowcolor={sh_ff}:shadowx={sx}:shadowy={sy}"

        # Border (Stroke)
        border_filter = ""
        if text_stroke_enabled and text_stroke_color and text_stroke_width > 0:
            stroke_ff = hex_to_ff(text_stroke_color)
            scaled_stroke_width = max(1, int(round(text_stroke_width * scale_factor)))
            border_filter = f":borderw={scaled_stroke_width}:bordercolor={stroke_ff}"

        # Align
        if text_align == "left":
            x_expr = f"{tx}"
        elif text_align == "right":
            x_expr = f"{tx}-tw"
        else:
            x_expr = f"{tx}-tw/2"

        scaled_line_spacing = int(round(text_line_spacing * scale_factor))
        line_spacing_str = f":line_spacing={scaled_line_spacing}"

        draw = (
            f"drawtext={font_style_str}:text='{escaped}'"
            f":fontsize={font_size}:fontcolor={fc}"
            f":x={x_expr}:y={ty}-th/2"
            f"{bg_filter}{shadow_str}{border_filter}{line_spacing_str}"
        )
        parts.append(f"{v_src}{draw}[v_text]")
        v_src = "[v_text]"

    # Step 7: Watermark image overlay
    if has_watermark:
        wm_scale = watermark_scale_pct / 100.0
        wm_w = int(template_w * wm_scale)
        wm_w = wm_w - (wm_w % 2) or 2
        wm_x = int(watermark_pos_x_pct / 100 * template_w - wm_w / 2)
        wm_y_center_pct = watermark_pos_y_pct / 100

        parts.append(f"[{watermark_idx}:v]scale={wm_w}:-2,format=rgba,colorchannelmixer=aa={watermark_opacity:.2f}[v_wm]")
        # Use main_h and overlay_h as expressions for FFmpeg overlay filter
        wm_y_expr = f"(main_h*{wm_y_center_pct:.4f}-overlay_h/2)"
        parts.append(f"{v_src}[v_wm]overlay={wm_x}:{wm_y_expr}:shortest=1[v_watermarked]")
        v_src = "[v_watermarked]"

    v_final = v_src

    # ── Audio chain ─────────────────────────────────────────────────────────
    a_final = None
    if info["has_audio"]:
        parts.append("[0:a]anull[a_final]")
        a_final = "[a_final]"

    # ── Anti-dup metadata ───────────────────────────────────────────────────
    meta_args = []
    if anti_duplicity:
        rand_id = "".join(random.choices(string.ascii_letters + string.digits, k=10))
        meta_args = [
            "-metadata", f"comment=Automadark_{rand_id}",
            "-metadata", f"title=Reels_{rand_id}",
            "-metadata", f"encoder=lavc_{rand_id}",
        ]

    # ── Assemble full command ────────────────────────────────────────────────
    filter_str = "; ".join(parts)
    cmd.extend(["-filter_complex", filter_str])
    cmd.extend(["-map", v_final])
    if a_final:
        cmd.extend(["-map", a_final])

    cmd.extend(["-t", f"{duration:.3f}"])
    cmd.extend(meta_args)

    out_dir = os.path.dirname(output_path)
    out_filename = os.path.basename(output_path)

    cmd.extend([
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        out_filename,
    ])

    if progress_callback:
        progress_callback(20, "Compondo vídeo com FFmpeg...")

    os.makedirs(out_dir, exist_ok=True)

    time_regex = re.compile(r"time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})")

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        encoding="utf-8",
        errors="ignore",
        cwd=out_dir,
        creationflags=_NO_WINDOW,
    )

    stderr_lines = []
    while True:
        line = proc.stderr.readline()
        if not line:
            break
        stderr_lines.append(line)
        m = time_regex.search(line)
        if m and progress_callback:
            h, mi, s, cs = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
            curr = h * 3600 + mi * 60 + s + cs / 100.0
            pct = min(99, int(curr / max(duration, 0.1) * 100))
            progress_callback(20 + int(pct * 0.75), f"Processando... {pct}%")

    proc.wait()

    if proc.returncode != 0:
        err = "".join(stderr_lines)
        raise RuntimeError(f"FFmpeg falhou (código {proc.returncode}):\n{err}")

    if progress_callback:
        progress_callback(100, "Composição concluída!")

    return output_path

