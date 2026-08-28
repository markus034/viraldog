import { BoundingBox } from '../types';

/**
 * Detects the transparent hole in a PNG template by scanning the alpha channel.
 */
export function detectTemplateHole(imageUrl: string): Promise<{
  hole: BoundingBox | null;
  width: number;
  height: number;
  hasAlpha: boolean;
}> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ hole: null, width, height, hasAlpha: false });
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      let minX = width;
      let maxX = 0;
      let minY = height;
      let maxY = 0;
      let alphaCount = 0;

      // Scan pixels
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const alpha = data[idx + 3];

          if (alpha < 100) {
            alphaCount++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      const totalPixels = width * height;
      const hasAlpha = alphaCount > totalPixels * 0.01; // At least 1% transparent

      if (hasAlpha && maxX >= minX && maxY >= minY) {
        resolve({
          hole: {
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
          },
          width,
          height,
          hasAlpha: true,
        });
      } else {
        // Fallback: assume central 1:2 vertical area as hole for template
        resolve({
          hole: {
            x: Math.round(width * 0.1),
            y: Math.round(height * 0.1),
            width: Math.round(width * 0.8),
            height: Math.round(height * 0.8),
          },
          width,
          height,
          hasAlpha: false,
        });
      }
    };
    img.src = imageUrl;
  });
}

/**
 * Samples a video at multiple frames and calculates pixel-level temporal variance
 * to isolate the active vertical video container from static frames/overlays.
 */
export function analyzeVideoVariance(
  videoUrl: string,
  numSamples = 12
): Promise<{
  bbox: BoundingBox;
  confidence: number;
  duration: number;
  width: number;
  height: number;
  thumbnailUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration;
        const width = video.videoWidth;
        const height = video.videoHeight;

        // Downsample for super-fast processing (100x200 keeps pixel count low and matches ratio)
        const scaleW = 100;
        const scaleH = 200;

        const canvas = document.createElement('canvas');
        canvas.width = scaleW;
        canvas.height = scaleH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Could not get canvas context');
        }

        // Generate timestamps evenly spaced in the middle 90% of the video
        const start = duration * 0.05;
        const end = duration * 0.95;
        const step = (end - start) / (numSamples - 1);
        const times: number[] = [];
        for (let i = 0; i < numSamples; i++) {
          times.push(start + i * step);
        }

        const framesData: Uint8ClampedArray[] = [];
        let thumbnailDataUrl = '';

        // Seek frame by frame helper
        for (let i = 0; i < times.length; i++) {
          await new Promise<void>((resolveSeek) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              // Draw
              ctx.drawImage(video, 0, 0, scaleW, scaleH);
              // Extract grayscale values
              const imgData = ctx.getImageData(0, 0, scaleW, scaleH);
              framesData.push(imgData.data);

              // Capture thumbnail around the 2nd sample
              if (i === Math.floor(numSamples / 3)) {
                // ponytail: 180x320 is plenty for a small preview card, 4x fewer pixels to encode
                const thumbCanvas = document.createElement('canvas');
                thumbCanvas.width = 180;
                thumbCanvas.height = 320;
                const thumbCtx = thumbCanvas.getContext('2d');
                if (thumbCtx) {
                  thumbCtx.drawImage(video, 0, 0, 180, 320);
                  thumbnailDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.8);
                }
              }
              resolveSeek();
            };
            video.addEventListener('seeked', onSeeked);
            if (typeof video.fastSeek === 'function') {
              video.fastSeek(times[i]);
            } else {
              video.currentTime = times[i];
            }
          });
        }

        if (framesData.length < 3) {
          throw new Error('Not enough frames loaded');
        }

        // Calculate variance per downsampled pixel
        const varianceMap = new Float32Array(scaleW * scaleH);
        let maxVar = 0;

        for (let y = 0; y < scaleH; y++) {
          for (let x = 0; x < scaleW; x++) {
            const idx = (y * scaleW + x) * 4;

            // Gather values over time
            let sum = 0;
            let sumSq = 0;
            for (let f = 0; f < framesData.length; f++) {
              // Grayscale approximation
              const r = framesData[f][idx];
              const g = framesData[f][idx + 1];
              const b = framesData[f][idx + 2];
              const gray = 0.299 * r + 0.587 * g + 0.114 * b;
              sum += gray;
              sumSq += gray * gray;
            }

            const mean = sum / framesData.length;
            const meanSq = sumSq / framesData.length;
            const variance = meanSq - (mean * mean);
            varianceMap[y * scaleW + x] = variance;
            if (variance > maxVar) maxVar = variance;
          }
        }

        // Detect borders of active region
        let minX = scaleW;
        let maxX = 0;
        let minY = scaleH;
        let maxY = 0;

        // Binarize variance map at a threshold of 10% of max variance (min 50)
        const threshold = Math.max(50, maxVar * 0.1);
        let activePixelCount = 0;

        for (let y = 0; y < scaleH; y++) {
          for (let x = 0; x < scaleW; x++) {
            const v = varianceMap[y * scaleW + x];
            if (v > threshold) {
              activePixelCount++;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        // Scale back bounding box coordinates to original size
        const ratioX = width / scaleW;
        const ratioY = height / scaleH;

        let bbox: BoundingBox;
        let confidence = 0.9;

        if (activePixelCount > 50 && maxX > minX && maxY > minY) {
          // Inset de 5 pixels para dentro em cada borda para eliminar 100% das frestas/bordas pretas
          const rawX = Math.round(minX * ratioX);
          const rawY = Math.round(minY * ratioY);
          const rawW = Math.round((maxX - minX + 1) * ratioX);
          const rawH = Math.round((maxY - minY + 1) * ratioY);

          const inset = 5;
          const finalX = Math.min(width - 50, rawX + inset);
          const finalY = Math.min(height - 50, rawY + inset);
          const finalW = Math.max(50, Math.min(width - finalX, rawW - inset * 2));
          const finalH = Math.max(50, Math.min(height - finalY, rawH - inset * 2));

          bbox = { x: finalX, y: finalY, width: finalW, height: finalH };
          confidence = Math.min(0.98, activePixelCount / (scaleW * scaleH * 0.8));
        } else {
          // Fallback to full screen if no motion found
          bbox = { x: 0, y: 0, width, height };
          confidence = 0.1;
        }

        // If thumbnail wasn't captured, use first frame
        if (!thumbnailDataUrl) {
          thumbnailDataUrl = canvas.toDataURL('image/jpeg');
        }

        resolve({
          bbox,
          confidence,
          duration,
          width,
          height,
          thumbnailUrl: thumbnailDataUrl,
        });
      } catch (err) {
        reject(err);
      }
    };

    video.onerror = (e) => reject(e);
    video.src = videoUrl;
  });
}
