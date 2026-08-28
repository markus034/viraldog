import sys
import os
import shutil

print("sys.executable:", sys.executable)
print("sys.prefix:", sys.prefix)

try:
    import imageio_ffmpeg
    print("imageio_ffmpeg exe:", imageio_ffmpeg.get_ffmpeg_exe())
except Exception as e:
    print("imageio_ffmpeg error:", e)

# Test resolving ffmpeg in dist
dist_internal = r"C:\Users\marku\PROJETOS\VIRALDOG\backend\dist\main\_internal"
candidates = [
    os.path.join(dist_internal, "imageio_ffmpeg", "binaries", "ffmpeg-win-x86_64-v7.1.exe"),
    os.path.join(dist_internal, "ffmpeg.exe"),
    shutil.which("ffmpeg")
]
for c in candidates:
    print("Candidate:", c, "Exists:", os.path.exists(c) if c else False)
