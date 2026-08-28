import os
import subprocess
import cv2
import numpy as np
import json

def detect_content_bbox(video_path, num_samples=20, variance_threshold=15, margin_px=5):
    """
    Detects the active video rectangle (content bounding box) by sampling frames
    and measuring temporal pixel variance.
    Returns: (x, y, w, h, confidence)
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")
    
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    if total_frames <= 0 or width <= 0 or height <= 0:
        cap.release()
        return (0, 0, width, height, 0.0)
    
    # Select evenly distributed frame indices
    indices = np.linspace(total_frames * 0.05, total_frames * 0.95, num_samples, dtype=int)
    frames = []
    
    for idx in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if ret:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            # Downsample to speed up variance calculation and reduce noise
            small = cv2.resize(gray, (180, 320))
            frames.append(small)
            
    cap.release()
    
    if len(frames) < 5:
        # Fallback to full screen if we couldn't read enough frames
        return (0, 0, width, height, 0.0)
        
    # Calculate temporal variance of pixels
    stack = np.stack(frames, axis=0)
    variance_map = np.var(stack, axis=0)
    
    # Normalize variance to 0-255 for thresholding
    max_var = np.max(variance_map)
    if max_var == 0:
        return (0, 0, width, height, 0.0)
        
    norm_variance = (variance_map / max_var * 255).astype(np.uint8)
    
    # Threshold to find moving regions
    _, thresh = cv2.threshold(norm_variance, variance_threshold, 255, cv2.THRESH_BINARY)
    
    # Clean up small noise with morphology
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    
    # Find contours
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return (0, 0, width, height, 0.0)
        
    # Get the bounding box containing all major moving contours
    all_points = []
    for cnt in contours:
        # Ignore extremely small noise
        if cv2.contourArea(cnt) > 20:
            all_points.append(cnt)
            
    if not all_points:
        return (0, 0, width, height, 0.0)
        
    concat = np.concatenate(all_points)
    x_small, y_small, w_small, h_small = cv2.boundingRect(concat)
    
    # Scale back to original resolution
    scale_x = width / 180.0
    scale_y = height / 320.0
    
    x = max(0, int(x_small * scale_x) - margin_px)
    y = max(0, int(y_small * scale_y) - margin_px)
    w = min(width - x, int(w_small * scale_x) + (margin_px * 2))
    h = min(height - y, int(h_small * scale_y) + (margin_px * 2))
    
    # Calculate a confidence score based on variance density inside the box
    confidence = float(np.mean(thresh[y_small:y_small+h_small, x_small:x_small+w_small]) / 255.0)
    
    return (x, y, w, h, confidence)


def detect_template_hole(template_path):
    """
    Detects the transparent hole (where alpha == 0) in a PNG template.
    Returns: (x, y, w, h) or None if no transparent area exists.
    """
    img = cv2.imread(template_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Could not open template: {template_path}")
        
    if img.shape[2] < 4:
        # No alpha channel
        return None
        
    alpha = img[:, :, 3]
    # Find pixels where alpha is transparent (less than 10 threshold)
    transparent_mask = (alpha < 10).astype(np.uint8) * 255
    
    contours, _ = cv2.findContours(transparent_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
        
    # Get the bounding box of the largest transparent contour
    largest_cnt = max(contours, key=cv2.contourArea)
    if cv2.contourArea(largest_cnt) < 100:
        return None
        
    x, y, w, h = cv2.boundingRect(largest_cnt)
    return (x, y, w, h)


def compose_video(video_path, template_path, output_path, crop_bbox, hole_bbox):
    """
    Crops the original video based on crop_bbox,
    scales it to cover hole_bbox, and overlays the template PNG on top.
    
    crop_bbox: (x, y, w, h) in original video coords
    hole_bbox: (tx, ty, tw, th) in template PNG coords
    """
    vx, vy, vw, vh = crop_bbox
    tx, ty, tw, th = hole_bbox
    
    # Read template resolution
    template_img = cv2.imread(template_path)
    if template_img is None:
        raise ValueError("Template image not found")
    tem_h, tem_w, _ = template_img.shape
    
    # We will use FFmpeg to do this fast and in one command using filter complexes:
    # 1. [0:v] crop to vw:vh:vx:vy
    # 2. scale to fill tw:th in aspect ratio (cover mode)
    # 3. pad or overlay over a black background of template size, then overlay template PNG on top.
    
    # Scale in cover mode:
    # Calculate aspect ratios
    video_ratio = vw / vh
    hole_ratio = tw / th
    
    if video_ratio > hole_ratio:
        # Video is wider than hole. Scale height to match th, crop width.
        scale_filter = f"scale=-1:{th}"
        crop_after_scale = f"crop={tw}:{th}"
    else:
        # Video is narrower than hole. Scale width to match tw, crop height.
        scale_filter = f"scale={tw}:-1"
        crop_after_scale = f"crop={tw}:{th}"

    # Build complex filter
    # - [0:v] crop: crop original to bounding box
    # - scale: scale to cover dimensions
    # - crop: crop centered scaled video to fit hole exactly (tw x th)
    # - [1:v] scale: scale template to standard size if needed, or overlay directly
    # - overlay: overlay video on a black background at (tx, ty), then overlay the template on top
    
    filter_complex = (
        f"[0:v]crop={vw}:{vh}:{vx}:{vy},{scale_filter},{crop_after_scale}[cropped_video]; "
        f"color=s={tem_w}x{tem_h}:c=black[bg]; "
        f"[bg][cropped_video]overlay={tx}:{ty}[video_in_hole]; "
        f"[video_in_hole][1:v]overlay=0:0[out]"
    )
    
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", template_path,
        "-filter_complex", filter_complex,
        "-map", "[out]",
        "-map", "0:a?", # Map audio if exists, otherwise ignore
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-c:a", "aac",
        output_path
    ]
    
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg compilation failed:\n{result.stderr}")
