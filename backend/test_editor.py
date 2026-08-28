"""
Automated tests for backend_editor.py native FFmpeg implementation.
"""
import os
import sys

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import backend_editor as editor

def test_editor():
    # Find a test video
    downloads_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../downloads")
    test_video = None
    
    if os.path.exists(downloads_dir):
        for file in os.listdir(downloads_dir):
            if file.endswith(".mp4") and os.path.isfile(os.path.join(downloads_dir, file)):
                test_video = os.path.join(downloads_dir, file)
                break
                
    if not test_video:
        print("[FAIL] No test video (.mp4) found in downloads directory.")
        sys.exit(1)
        
    print(f"[INFO] Using test video: {test_video}")
    
    # 1. Test get_video_info
    print("\n--- Testing get_video_info ---")
    info = editor.get_video_info(test_video)
    print(f"Info retrieved: {info}")
    assert info["duration"] > 0, "Duration should be positive"
    assert info["width"] > 0, "Width should be positive"
    assert info["height"] > 0, "Height should be positive"
    print("[PASS] get_video_info works perfectly.")
    
    # 2. Test detect_video_content_bounds
    print("\n--- Testing detect_video_content_bounds ---")
    bounds = editor.detect_video_content_bounds(test_video)
    print(f"Content bounds detected (top, bottom, left, right): {bounds}")
    assert len(bounds) == 4, "Should return 4-tuple"
    print("[PASS] detect_video_content_bounds works perfectly.")

    
    # 3. Test generate_thumbnail
    print("\n--- Testing generate_thumbnail ---")
    thumb_out = os.path.join(downloads_dir, "test_thumb.jpg")
    if os.path.exists(thumb_out):
        os.remove(thumb_out)
        
    res_thumb = editor.generate_thumbnail(
        video_path=test_video,
        timestamp_sec=2.0,
        text_overlay="TESTE DE THUMB",
        output_path=thumb_out
    )
    print(f"Thumbnail path: {res_thumb}")
    assert os.path.exists(thumb_out), "Thumbnail file should be created"
    print("[PASS] generate_thumbnail works perfectly.")
    os.remove(thumb_out)
    
    # 4. Test edit_video (Basic edit)
    print("\n--- Testing edit_video (Basic preview edit with banners) ---")
    output_video = os.path.join(downloads_dir, "test_edited_preview.mp4")
    if os.path.exists(output_video):
        try:
            os.remove(output_video)
        except OSError:
            pass
            
    def progress_cb(pct, msg):
        print(f"Progress: {pct}% - {msg}")
        
    srt_content = "1\n00:00:00,500 --> 00:00:02,500\nLegenda de Teste do FFmpeg!"
    
    res_video = editor.edit_video(
        input_path=test_video,
        output_path=output_video,
        crop_9_16=True,
        mirror=True,
        speed=1.1,
        volume=0.8,
        top_text="TEXTO SUPERIOR",
        bottom_text="TEXTO INFERIOR",
        text_color="yellow",
        bg_color="rgba(0, 0, 0, 150)",
        watermark_text="@automadark",
        anti_duplicity=True,
        burn_subs=True,
        srt_content=srt_content,
        subtitle_style="bold",
        progress_callback=progress_cb,
        preview_duration=3.0  # Limit to 3s for fast test
    )
    
    print(f"Output video path: {res_video}")
    assert os.path.exists(output_video), "Output video file should be created"
    
    # Verify metadata of edited video
    edited_info = editor.get_video_info(output_video)
    print(f"Edited video info: {edited_info}")
    assert abs(edited_info["duration"] - 3.0) < 0.5, f"Duration should be ~3 seconds, got {edited_info['duration']}"
    assert edited_info["width"] == 1080, f"Width should be 1080, got {edited_info['width']}"
    assert edited_info["height"] == 1920, f"Height should be 1920, got {edited_info['height']}"
    
    print("[PASS] edit_video works perfectly.")
    
    # Cleanup test output
    try:
        os.remove(output_video)
    except OSError:
        pass
        
    print("\n[SUCCESS] All backend_editor tests passed successfully!")

if __name__ == "__main__":
    test_editor()
