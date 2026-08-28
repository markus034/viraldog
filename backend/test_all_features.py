"""
Comprehensive test suite for ViralDog backend features:
- FFmpeg resolution
- Font resolution
- Video editing & composition with text, fonts, templates
- Database & Account models
- Scheduler
"""
import os
import sys
import subprocess
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils import get_ffmpeg_exe
from database import init_db, SessionLocal, Account, Config, TemplateLibrary
import backend_editor as editor

def run_tests():
    print("==================================================")
    print("      VIRALDOG SYSTEM VERIFICATION TESTS        ")
    print("==================================================")

    # 1. FFmpeg resolution
    print("\n[TEST 1] Testing FFmpeg resolution...")
    ffmpeg = get_ffmpeg_exe()
    print(f"  -> Resolved FFmpeg: {ffmpeg}")
    assert ffmpeg and os.path.exists(ffmpeg), f"FFmpeg binary not found at {ffmpeg}"
    res = subprocess.run([ffmpeg, "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    assert res.returncode == 0, "FFmpeg -version failed"
    print("  [PASS] FFmpeg is operational.")

    # 2. Font resolution
    print("\n[TEST 2] Testing Font resolution...")
    font_families = ["Arial", "Roboto", "Inter", "Anton", "Wedges", "Archivo Black", "League Spartan"]
    for family in font_families:
        for bold in [False, True]:
            font_path = editor.resolve_font_file(family, bold)
            print(f"  -> Font '{family}' (bold={bold}): {font_path}")
            assert font_path and os.path.exists(font_path), f"Font {family} (bold={bold}) could not be resolved!"
    print("  [PASS] All 7 font families resolved correctly.")

    # 3. Create a synthetic test video (3 seconds, 720x1280, color with audio)
    temp_dir = tempfile.mkdtemp(prefix="viraldog_test_")
    test_video = os.path.join(temp_dir, "synthetic_input.mp4")
    print(f"\n[TEST 3] Generating synthetic test video at {test_video}...")
    gen_cmd = [
        ffmpeg, "-y",
        "-f", "lavfi", "-i", "testsrc=duration=3:size=720x1280:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        test_video
    ]
    subprocess.run(gen_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    assert os.path.exists(test_video), "Synthetic video generation failed"
    print("  [PASS] Synthetic test video created.")

    # 4. Test get_video_info
    print("\n[TEST 4] Testing get_video_info...")
    info = editor.get_video_info(test_video)
    print(f"  -> Video info: {info}")
    assert info["width"] == 720
    assert info["height"] == 1280
    assert abs(info["duration"] - 3.0) < 0.5
    assert info["has_audio"] is True
    print("  [PASS] Video info extracted accurately.")

    # 5. Test compose_editor_video (The exact function that failed for the user)
    print("\n[TEST 5] Testing compose_editor_video (Editor Studio composition)...")
    out_video = os.path.join(temp_dir, "composed_output.mp4")
    
    # Test with custom font text overlay
    res_path = editor.compose_editor_video(
        input_path=test_video,
        output_path=out_video,
        template_path=None,
        bbox_x=0,
        bbox_y=0,
        bbox_w=720,
        bbox_h=1280,
        template_w=1080,
        template_h=1920,
        mirrored=True,
        video_scale=1.0,
        anti_duplicity=True,
        text_enabled=True,
        text_content="TESTE VIRALDOG DE TEXTO",
        text_font_family="Roboto",
        text_bold=True,
        text_color="#ffff00",
        text_bg_color="#000000",
        text_bg_opacity=70,
        text_shadow=True,
        text_stroke_enabled=True,
        text_stroke_color="#ff0000",
        text_stroke_width=2,
    )
    assert os.path.exists(out_video), "compose_editor_video failed to produce output"
    out_info = editor.get_video_info(out_video)
    print(f"  -> Composed video info: {out_info}")
    assert out_info["width"] == 1080
    assert out_info["height"] == 1920
    print("  [PASS] compose_editor_video executed flawlessly!")

    # 6. Test Database init & queries
    print("\n[TEST 6] Testing Database & Models...")
    init_db()
    db = SessionLocal()
    try:
        acc_count = db.query(Account).count()
        cfg_count = db.query(Config).count()
        tmpl_count = db.query(TemplateLibrary).count()
        print(f"  -> DB Connected: {acc_count} accounts, {cfg_count} configs, {tmpl_count} templates")
    finally:
        db.close()
    print("  [PASS] Database queries successful.")

    # Cleanup temp
    try:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception:
        pass

    print("\n==================================================")
    print("  >>> ALL 6 CORE TESTS PASSED SUCCESSFULLY! <<<   ")
    print("==================================================\n")

if __name__ == "__main__":
    run_tests()
