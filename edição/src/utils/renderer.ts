import { VideoJob, TemplateConfig, TextOverlayConfig, ImageOverlayConfig } from '../types';

/**
 * Renders and records a compiled video with template and overlays in the browser.
 */
export async function renderAndRecordVideo(
  job: VideoJob,
  template: TemplateConfig,
  textOverlay?: TextOverlayConfig,
  imageOverlay?: ImageOverlayConfig,
  antiDuplicityEnabled?: boolean,
  onProgress?: (percent: number) => void,
  keepTitle?: { enabled: boolean; heightPercent: number }
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    // 1. Set up a hidden video element
    const video = document.createElement('video');
    video.src = job.objectUrl;
    video.muted = false; // Must not be strictly muted to extract audio, but we control output
    video.volume = 0.001; // Silent volume but audio context can still capture it
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    // 2. Pre-load template and watermark images
    const templateImg = new Image();
    if (template.objectUrl) {
      templateImg.src = template.objectUrl;
      templateImg.crossOrigin = 'anonymous';
    }

    const watermarkImg = new Image();
    if (imageOverlay?.enabled && imageOverlay.imageUrl) {
      watermarkImg.src = imageOverlay.imageUrl;
      watermarkImg.crossOrigin = 'anonymous';
    }

    // Wait for all assets and video metadata to load
    let assetsLoaded = 0;
    const totalAssets = 1 + (template.objectUrl ? 1 : 0) + (imageOverlay?.enabled && imageOverlay.imageUrl ? 1 : 0);

    const checkReady = () => {
      assetsLoaded++;
      if (assetsLoaded === totalAssets) {
        startRecording();
      }
    };

    video.onloadedmetadata = checkReady;
    video.onerror = () => reject(new Error('Falha ao carregar o vídeo para renderização.'));

    if (template.objectUrl) {
      templateImg.onload = checkReady;
      templateImg.onerror = checkReady; // proceed anyway
    }
    if (imageOverlay?.enabled && imageOverlay.imageUrl) {
      watermarkImg.onload = checkReady;
      watermarkImg.onerror = checkReady; // proceed anyway
    }

    function startRecording() {
      try {
        // Set up the high resolution canvas
        const canvas = document.createElement('canvas');
        canvas.width = template.width || 1080;
        canvas.height = template.height || 1920;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Não foi possível obter o contexto 2D do Canvas.'));
          return;
        }

        // Capture canvas stream (30 fps)
        const canvasStream = canvas.captureStream(30);

        // Extract audio using AudioContext to bundle with the canvas stream
        let audioContext: AudioContext | null = null;
        let audioSource: MediaElementAudioSourceNode | null = null;
        let audioDest: MediaStreamAudioDestinationNode | null = null;

        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          audioContext = new AudioContextClass();
          audioSource = audioContext.createMediaElementSource(video);
          audioDest = audioContext.createMediaStreamDestination();
          
          audioSource.connect(audioDest);
          // Do NOT connect to audioContext.destination to keep the process completely silent!
          
          const audioTracks = audioDest.stream.getAudioTracks();
          if (audioTracks.length > 0) {
            canvasStream.addTrack(audioTracks[0]);
          }
        } catch (audioErr) {
          console.warn('Audio capture failed (this is expected for silent videos or CORS-protected sources):', audioErr);
        }

        // Determine best MIME type for the recorder
        const supportedTypes = [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
          'video/mp4'
        ];
        let mimeType = '';
        for (const type of supportedTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            mimeType = type;
            break;
          }
        }

        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(canvasStream, mimeType ? { mimeType } : undefined);

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunks.push(e.data);
          }
        };

        recorder.onstop = () => {
          // Cleanup
          active = false;
          video.pause();
          if (audioContext) {
            audioContext.close();
          }
          const finalBlob = new Blob(chunks, { type: mimeType || 'video/webm' });
          resolve(finalBlob);
        };

        let active = true;

        const drawFrame = () => {
          if (!active) return;

          // 1. Clear frame
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // 2. Draw cropped & fitted video frame
          let activeBbox = job.manualBbox ?? job.detectedBbox;
          if (keepTitle?.enabled && activeBbox) {
            const extension = Math.round(activeBbox.height * (keepTitle.heightPercent / 100));
            const newY = Math.max(0, activeBbox.y - extension);
            const heightDiff = activeBbox.y - newY;
            activeBbox = {
              x: activeBbox.x,
              y: newY,
              width: activeBbox.width,
              height: activeBbox.height + heightDiff
            };
          }
          const sx = activeBbox ? activeBbox.x : 0;
          const sy = activeBbox ? activeBbox.y : 0;
          const sw = activeBbox ? activeBbox.width : job.videoWidth;
          const sh = activeBbox ? activeBbox.height : job.videoHeight;

          const tx = template.hole?.x ?? 0;
          const ty = template.hole?.y ?? 0;
          const tw = template.hole?.width ?? template.width;
          const th = template.hole?.height ?? template.height;

          const scale = template.width / job.videoWidth;
          const vScaleFactor = (job.videoScale ?? 100) / 100;
          const cropWidthOnTemplate = sw * scale * vScaleFactor;
          const cropHeightOnTemplate = sh * scale * vScaleFactor;

          const offsetLeft_rel_to_hole = (tw - cropWidthOnTemplate) / 2;
          const offsetTop_rel_to_hole = 0;

          const dx = tx + offsetLeft_rel_to_hole;
          const dy = ty + offsetTop_rel_to_hole;
          const dw = cropWidthOnTemplate;
          const dh = cropHeightOnTemplate;

          ctx.save();
          
          // Apply mirroring
          if (job.mirrored) {
            ctx.translate(dx + dw / 2, dy + dh / 2);
            ctx.scale(-1, 1);
            ctx.translate(-(dx + dw / 2), -(dy + dh / 2));
          }

          // Apply anti-duplicity pixel filters
          if (antiDuplicityEnabled) {
            ctx.filter = 'brightness(1.002) contrast(0.998) saturate(1.002) hue-rotate(0.5deg)';
          }

          try {
            ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
          } catch (e) {
            // Ignore frame load glitch
          }

          ctx.filter = 'none';
          ctx.restore();

          // 3. Draw template overlay
          if (templateImg.complete && templateImg.naturalWidth > 0) {
            ctx.drawImage(templateImg, 0, 0, canvas.width, canvas.height);
          }

          // 4. Draw dynamic text overlay
          if (textOverlay?.enabled && textOverlay.text) {
            const textX = (textOverlay.positionX ?? 50) / 100 * canvas.width;
            const textY = (textOverlay.positionY ?? 85) / 100 * canvas.height;
            
            ctx.save();
            ctx.font = `${textOverlay.bold ? 'bold ' : ''}${textOverlay.size}px Inter, system-ui, sans-serif`;
            ctx.textAlign = textOverlay.align ?? 'center';
            ctx.textBaseline = 'middle';
            
            const textMetrics = ctx.measureText(textOverlay.text);
            const textWidth = textMetrics.width;
            const textHeight = textOverlay.size;
            
            if (textOverlay.bgColor) {
              const alphaHex = Math.round(((textOverlay.bgOpacity ?? 60) / 100) * 255).toString(16).padStart(2, '0');
              ctx.fillStyle = `${textOverlay.bgColor}${alphaHex}`;
              
              const paddingX = 12;
              const paddingY = 6;
              let bx = textX - textWidth / 2 - paddingX;
              if (textOverlay.align === 'left') {
                bx = textX - paddingX;
              } else if (textOverlay.align === 'right') {
                bx = textX - textWidth - paddingX;
              }
              const by = textY - textHeight / 2 - paddingY;
              const bw = textWidth + paddingX * 2;
              const bh = textHeight + paddingY * 2;
              
              ctx.beginPath();
              if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(bx, by, bw, bh, 6);
              } else {
                ctx.rect(bx, by, bw, bh);
              }
              ctx.fill();
            }
            
            if (textOverlay.useShadow) {
              ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
              ctx.shadowBlur = 4;
              ctx.shadowOffsetX = 1;
              ctx.shadowOffsetY = 1;
            }
            
            ctx.fillStyle = textOverlay.color;
            ctx.fillText(textOverlay.text, textX, textY);
            ctx.restore();
          }

          // 5. Draw dynamic image watermark overlay
          if (imageOverlay?.enabled && imageOverlay.imageUrl && watermarkImg.complete && watermarkImg.naturalWidth > 0) {
            ctx.save();
            const wmScale = (imageOverlay.scale ?? 20) / 100;
            const wmWidth = canvas.width * wmScale;
            const wmHeight = wmWidth * (watermarkImg.height / watermarkImg.width);
            const wmX = (imageOverlay.positionX ?? 50) / 100 * canvas.width - wmWidth / 2;
            const wmY = (imageOverlay.positionY ?? 50) / 100 * canvas.height - wmHeight / 2;
            
            ctx.globalAlpha = (imageOverlay.opacity ?? 100) / 100;
            ctx.drawImage(watermarkImg, wmX, wmY, wmWidth, wmHeight);
            ctx.restore();
          }

          // 6. Draw subtle pixel noise pattern if anti-duplicity active
          if (antiDuplicityEnabled) {
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';
            ctx.globalAlpha = 0.015;
            
            // Random static block
            const noiseWidth = 128;
            const noiseHeight = 128;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = noiseWidth;
            tempCanvas.height = noiseHeight;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
              const noiseData = tempCtx.createImageData(noiseWidth, noiseHeight);
              const d = noiseData.data;
              for (let i = 0; i < d.length; i += 4) {
                const val = Math.floor(Math.random() * 255);
                d[i] = val;
                d[i+1] = val;
                d[i+2] = val;
                d[i+3] = 255;
              }
              tempCtx.putImageData(noiseData, 0, 0);
              const pattern = ctx.createPattern(tempCanvas, 'repeat');
              if (pattern) {
                ctx.fillStyle = pattern;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
              }
            }
            ctx.restore();
          }

          // Report progress
          const pct = Math.min(99, Math.round((video.currentTime / job.duration) * 100));
          onProgress?.(pct);
        };

        // Render loop driver
        const driveLoop = () => {
          if (!active) return;
          drawFrame();

          if (video.ended || video.currentTime >= job.duration) {
            onProgress?.(100);
            recorder.stop();
          } else {
            if ('requestVideoFrameCallback' in video) {
              (video as any).requestVideoFrameCallback(driveLoop);
            } else {
              requestAnimationFrame(driveLoop);
            }
          }
        };

        // Start video and recorder
        video.currentTime = 0;
        video.play()
          .then(() => {
            recorder.start();
            if ('requestVideoFrameCallback' in video) {
              (video as any).requestVideoFrameCallback(driveLoop);
            } else {
              requestAnimationFrame(driveLoop);
            }
          })
          .catch((playErr) => {
            reject(new Error('Incapaz de inicializar a reprodução de vídeo para gravação: ' + playErr.message));
          });

      } catch (err: any) {
        reject(err);
      }
    }
  });
}
