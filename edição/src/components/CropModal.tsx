import React, { useState, useEffect, useRef } from 'react';
import { X, Save, AlertTriangle, Play, Pause, RotateCcw, FlipHorizontal, Volume2, VolumeX } from 'lucide-react';
import { VideoJob, TemplateConfig, BoundingBox } from '../types';

interface CropModalProps {
  job: VideoJob;
  template: TemplateConfig;
  onClose: () => void;
  onSave: (bbox: BoundingBox, mirrored: boolean, videoScale: number, trimStart: number, trimEnd: number) => void;
  musicOverlay?: {
    enabled: boolean;
    fileName: string;
    objectUrl: string | null;
    startTime: number;
    duration: number;
  };
  onMusicStartTimeChange?: (time: number) => void;
}

export default function CropModal({ job, template, onClose, onSave, musicOverlay, onMusicStartTimeChange }: CropModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMirrored, setIsMirrored] = useState(job.mirrored ?? false);
  const [videoScale, setVideoScale] = useState<number>(job.videoScale ?? 100);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(job.duration || 0);

  const [trimStart, setTrimStart] = useState<number>(job.trimStart ?? 0);
  const [trimEnd, setTrimEnd] = useState<number>(job.trimEnd ?? (job.duration || 10));

  const [timelineRef, setTimelineRef] = useState<HTMLDivElement | null>(null);
  const [isDraggingStart, setIsDraggingStart] = useState(false);
  const [isDraggingEnd, setIsDraggingEnd] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  // Automatically mute original video if music track is active
  useEffect(() => {
    if (musicOverlay?.enabled) {
      setIsMuted(true);
    }
  }, [musicOverlay?.enabled]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
    if (bgmRef.current) {
      bgmRef.current.muted = isMuted;
    }
  }, [isMuted, isPlaying]);

  // Sync background music play/pause
  useEffect(() => {
    if (bgmRef.current && videoRef.current) {
      if (isPlaying && musicOverlay?.enabled && musicOverlay?.objectUrl) {
        const videoProgress = videoRef.current.currentTime - trimStart;
        const targetBgmTime = (musicOverlay.startTime || 0) + Math.max(0, videoProgress);
        bgmRef.current.currentTime = targetBgmTime % (musicOverlay.duration || 180);
        bgmRef.current.play().catch(() => {});
      } else {
        bgmRef.current.pause();
      }
    }
  }, [isPlaying, musicOverlay?.enabled, musicOverlay?.objectUrl]);

  // Sync background music on seek/timeupdate
  useEffect(() => {
    if (bgmRef.current && videoRef.current && isPlaying && musicOverlay?.enabled && musicOverlay?.objectUrl) {
      const videoProgress = currentTime - trimStart;
      const targetBgmTime = (musicOverlay.startTime || 0) + Math.max(0, videoProgress);
      const currentBgmTime = bgmRef.current.currentTime;
      const calculatedTarget = targetBgmTime % (musicOverlay.duration || 180);
      if (Math.abs(currentBgmTime - calculatedTarget) > 0.3) {
        bgmRef.current.currentTime = calculatedTarget;
      }
    }
  }, [currentTime, trimStart, musicOverlay?.enabled, musicOverlay?.objectUrl, isPlaying]);

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>, isStart: boolean) => {
    e.preventDefault();
    setIsPlaying(false);
    if (isStart) {
      setIsDraggingStart(true);
    } else {
      setIsDraggingEnd(true);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingStart && !isDraggingEnd && !isDraggingPlayhead) return;
      if (!timelineRef || !duration) return;

      const rect = timelineRef.getBoundingClientRect();
      const clientX = e.clientX;
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newTime = fraction * duration;

      if (isDraggingStart) {
        const val = Math.max(0, Math.min(trimEnd - 0.1, parseFloat(newTime.toFixed(2))));
        setTrimStart(val);
        if (videoRef.current) {
          videoRef.current.currentTime = val;
          setCurrentTime(val);
        }
      } else if (isDraggingEnd) {
        const val = Math.max(trimStart + 0.1, Math.min(duration, parseFloat(newTime.toFixed(2))));
        setTrimEnd(val);
        if (videoRef.current) {
          videoRef.current.currentTime = val;
          setCurrentTime(val);
        }
      } else if (isDraggingPlayhead) {
        const val = Math.max(trimStart, Math.min(trimEnd, parseFloat(newTime.toFixed(2))));
        if (videoRef.current) {
          videoRef.current.currentTime = val;
          setCurrentTime(val);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDraggingStart(false);
      setIsDraggingEnd(false);
      setIsDraggingPlayhead(false);
    };

    if (isDraggingStart || isDraggingEnd || isDraggingPlayhead) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingStart, isDraggingEnd, isDraggingPlayhead, duration, trimStart, trimEnd, timelineRef]);

  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingStart && !isDraggingEnd && !isDraggingPlayhead) return;
      if (!timelineRef || !duration) return;

      const rect = timelineRef.getBoundingClientRect();
      const clientX = e.touches[0].clientX;
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newTime = fraction * duration;

      if (isDraggingStart) {
        const val = Math.max(0, Math.min(trimEnd - 0.1, parseFloat(newTime.toFixed(2))));
        setTrimStart(val);
        if (videoRef.current) {
          videoRef.current.currentTime = val;
          setCurrentTime(val);
        }
      } else if (isDraggingEnd) {
        const val = Math.max(trimStart + 0.1, Math.min(duration, parseFloat(newTime.toFixed(2))));
        setTrimEnd(val);
        if (videoRef.current) {
          videoRef.current.currentTime = val;
          setCurrentTime(val);
        }
      } else if (isDraggingPlayhead) {
        const val = Math.max(trimStart, Math.min(trimEnd, parseFloat(newTime.toFixed(2))));
        if (videoRef.current) {
          videoRef.current.currentTime = val;
          setCurrentTime(val);
        }
      }
    };

    const handleTouchEnd = () => {
      setIsDraggingStart(false);
      setIsDraggingEnd(false);
      setIsDraggingPlayhead(false);
    };

    if (isDraggingStart || isDraggingEnd || isDraggingPlayhead) {
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDraggingStart, isDraggingEnd, isDraggingPlayhead, duration, trimStart, trimEnd, timelineRef]);

  const [videoWidth, setVideoWidth] = useState(job.videoWidth || 1080);
  const [videoHeight, setVideoHeight] = useState(job.videoHeight || 1920);

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setCurrentTime(e.currentTarget.currentTime);
  };

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const dur = video.duration;
    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    setDuration(dur);
    
    if (vWidth && vHeight) {
      setVideoWidth(vWidth);
      setVideoHeight(vHeight);
      
      setCrop((prev) => {
        if (!job.manualBbox && !job.detectedBbox && (prev.width === 1080 || prev.width === 0 || prev.height === 1920 || prev.height === 0)) {
          return { x: 0, y: 0, width: vWidth, height: vHeight };
        }
        return prev;
      });
    }
  };

  const handleSeek = (value: number) => {
    setCurrentTime(value);
    if (videoRef.current) {
      videoRef.current.currentTime = value;
    }
  };

  // Initialize crop coordinates from manual/detected crop, fallback to full resolution
  const [crop, setCrop] = useState<BoundingBox>(() => {
    if (job.manualBbox) return { ...job.manualBbox };
    if (job.detectedBbox) return { ...job.detectedBbox };
    return { x: 0, y: 0, width: job.videoWidth || 1080, height: job.videoHeight || 1920 };
  });

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (videoRef.current && videoRef.current.duration) {
      setDuration(videoRef.current.duration);
    }
  }, [videoRef.current]);

  const handleSliderChange = (key: keyof BoundingBox, value: number) => {
    setCrop((prev) => {
      const updated = { ...prev, [key]: value };

      // Keep within bounds
      if (key === 'x') {
        updated.x = Math.max(0, Math.min(videoWidth - prev.width, value));
      } else if (key === 'y') {
        updated.y = Math.max(0, Math.min(videoHeight - prev.height, value));
      } else if (key === 'width') {
        updated.width = Math.max(10, Math.min(videoWidth - prev.x, value));
      } else if (key === 'height') {
        updated.height = Math.max(10, Math.min(videoHeight - prev.y, value));
      }
      return updated;
    });
  };

  const resetToAuto = () => {
    if (job.detectedBbox) {
      setCrop({ ...job.detectedBbox });
    } else {
      setCrop({ x: 0, y: 0, width: videoWidth, height: videoHeight });
    }
  };

  useEffect(() => {
    if (videoRef.current) {
      if (currentTime > trimEnd) {
        videoRef.current.currentTime = trimStart;
        setCurrentTime(trimStart);
      }
      if (currentTime < trimStart) {
        videoRef.current.currentTime = trimStart;
        setCurrentTime(trimStart);
      }
    }
  }, [currentTime, trimStart, trimEnd]);

  const saveCalibration = () => {
    onSave(crop, isMirrored, videoScale, trimStart, trimEnd);
  };

  // Safe calculated crop values to prevent divisions by zero
  const safeCropWidth = Math.max(1, crop.width);
  const safeCropHeight = Math.max(1, crop.height);
  const safeVideoWidth = Math.max(1, videoWidth);
  const safeVideoHeight = Math.max(1, videoHeight);

  // Calculate percentages for the visual overlay box
  const overlayLeft = `${(crop.x / safeVideoWidth) * 100}%`;
  const overlayTop = `${(crop.y / safeVideoHeight) * 100}%`;
  const overlayWidth = `${(safeCropWidth / safeVideoWidth) * 100}%`;
  const overlayHeight = `${(safeCropHeight / safeVideoHeight) * 100}%`;

  // Live composite render calculations for preview card
  // We want the crop to maintain its proportional size relative to the template hole
  const tx = template.hole?.x ?? 0;
  const ty = template.hole?.y ?? 0;
  const tw = template.hole?.width ?? 1080;
  const th = template.hole?.height ?? 1920;

  // Baseline scale based on original video vs the template canvas dimensions
  const scale = template.width / safeVideoWidth;

  const cropWidthOnTemplate = safeCropWidth * scale * (videoScale / 100);
  const cropHeightOnTemplate = safeCropHeight * scale * (videoScale / 100);

  // Top-aligned relative to the transparent hole
  const offsetLeft_rel_to_hole = (tw - cropWidthOnTemplate) / 2;
  const offsetTop_rel_to_hole = 0;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all duration-300">
      <div className="bg-white border border-black/5 shadow-[0_20px_50px_rgba(0,0,0,0.15)] rounded-2xl w-full max-w-5xl h-[90vh] md:h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-black/5 px-6 py-4 flex-shrink-0 bg-white">
          <div>
            <h2 className="font-semibold text-xs tracking-[0.2em] uppercase text-[#86868B]">
              Calibração Visual de Recorte
            </h2>
            <p className="text-[11px] text-[#1D1D1F] mt-1 truncate max-w-[400px] font-semibold">
              Vídeo: {job.name} ({videoWidth}x{videoHeight}px)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#F5F5F7] hover:bg-slate-200 border border-black/5 text-[#86868B] hover:text-[#1D1D1F] cursor-pointer transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content - Scrollable if needed */}
        <div className="flex-grow overflow-y-auto p-6 flex flex-col lg:flex-row gap-6 bg-white">
          
          {/* Column 1: Source Crop Adjustment */}
          <div className="flex-1 flex flex-col gap-4">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#86868B]">
              Ajuste de Margem (Vídeo Original)
            </h3>
            
            {/* Visual Crop Box over Video Thumbnail */}
            <div
              ref={containerRef}
              className="relative aspect-[9/16] h-[380px] flex-shrink-0 self-center bg-black rounded-2xl border border-black/10 overflow-hidden flex items-center justify-center select-none"
            >
              <img
                src={job.thumbnailUrl}
                alt="Source Frame"
                className={`w-full h-full object-contain pointer-events-none opacity-45 ${isMirrored ? 'scale-x-[-1]' : ''}`}
              />
              
              {/* Highlighted Crop Area Box */}
              <div
                className="absolute border-2 border-[#0071E3] shadow-[0_0_15px_rgba(0,113,227,0.3)] bg-[#0071E3]/10 pointer-events-none"
                style={{
                  left: overlayLeft,
                  top: overlayTop,
                  width: overlayWidth,
                  height: overlayHeight,
                }}
              >
                <span className="absolute top-1 left-1 bg-black/80 text-[#0071E3] border border-white/10 text-[9px] px-1.5 py-0.5 rounded-md font-mono font-bold">
                  RECORTE
                </span>
              </div>
            </div>

            {/* Precision Adjustment Sliders */}
            <div className="bg-[#F5F5F7] p-4 rounded-xl border border-black/5 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 text-[#1D1D1F]">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono tracking-wider text-[#86868B] flex justify-between">
                    <span>Posição X</span>
                    <span className="text-[#0071E3] font-bold">{crop.x}px</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, videoWidth - crop.width)}
                    value={crop.x}
                    onChange={(e) => handleSliderChange('x', parseInt(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono tracking-wider text-[#86868B] flex justify-between">
                    <span>Posição Y</span>
                    <span className="text-[#0071E3] font-bold">{crop.y}px</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, videoHeight - crop.height)}
                    value={crop.y}
                    onChange={(e) => handleSliderChange('y', parseInt(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono tracking-wider text-[#86868B] flex justify-between">
                    <span>Largura</span>
                    <span className="text-[#0071E3] font-bold">{crop.width}px</span>
                  </label>
                  <input
                    type="range"
                    min="50"
                    max={videoWidth - crop.x}
                    value={crop.width}
                    onChange={(e) => handleSliderChange('width', parseInt(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase font-mono tracking-wider text-[#86868B] flex justify-between">
                    <span>Altura</span>
                    <span className="text-[#0071E3] font-bold">{crop.height}px</span>
                  </label>
                  <input
                    type="range"
                    min="50"
                    max={videoHeight - crop.y}
                    value={crop.height}
                    onChange={(e) => handleSliderChange('height', parseInt(e.target.value))}
                    className="w-full cursor-pointer"
                  />
                </div>
                
                {/* Zoom / Escala do Vídeo */}
                <div className="col-span-2 flex flex-col gap-1 border-t border-black/5 pt-2.5 mt-1">
                  <label className="text-[10px] uppercase font-mono tracking-wider text-[#86868B] flex justify-between">
                    <span>Tamanho / Zoom do Vídeo</span>
                    <span className="text-[#0071E3] font-bold">{videoScale}%</span>
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    value={videoScale}
                    onChange={(e) => setVideoScale(parseInt(e.target.value))}
                    className="w-full cursor-pointer accent-[#0071E3]"
                  />
                </div>
              </div>
              <div className="flex justify-between items-center border-t border-black/5 pt-3 mt-1 gap-2 flex-wrap">
                <span className="text-[10px] text-[#86868B] font-mono">
                  Aspecto: {(crop.width / crop.height).toFixed(2)} (Meta: {(tw/th).toFixed(2)})
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsMirrored(!isMirrored)}
                    className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg border text-[10px] cursor-pointer transition-all font-semibold font-mono shadow-sm ${
                      isMirrored
                        ? 'bg-[#0071E3] border-[#0071E3] text-white hover:bg-[#0077ED]'
                        : 'bg-white border-slate-200 hover:border-[#0071E3]/50 text-[#86868B]'
                    }`}
                    title={isMirrored ? 'Remover espelhamento' : 'Espelhar vídeo horizontalmente'}
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    {isMirrored ? 'ESPELHADO' : 'ESPELHAR'}
                  </button>
                  <button
                    onClick={resetToAuto}
                    className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-white border border-slate-200 hover:border-[#0071E3]/50 text-[10px] text-[#0071E3] hover:text-[#0077ED] cursor-pointer transition-all font-semibold font-mono shadow-sm"
                  >
                    <RotateCcw className="w-3 h-3" />
                    RESTAURAR DETECÇÃO
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Composed Output Preview */}
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#86868B]">
                Corte e Visualização
              </h3>
            </div>

            {/* Live Cropped Overlay Screen container */}
            <div className="relative aspect-[9/16] h-[380px] flex-shrink-0 self-center bg-black rounded-2xl border border-black/10 overflow-hidden flex items-center justify-center select-none shadow-md">
              
              {/* 1. Template overlay underneath */}
              {template.objectUrl ? (
                <img
                  src={template.objectUrl}
                  alt="Template overlay"
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0"
                />
              ) : (
                // Safe transparent template border simulator
                <div className="absolute inset-0 border-8 border-slate-900 pointer-events-none z-0 flex items-center justify-center">
                  <div className="border border-dashed border-[#0071E3]/40 w-full h-full rounded" />
                </div>
              )}

              {/* 2. Cropped video container on top matching the hole exactly */}
              {template.hole ? (
                <div
                  className="absolute overflow-hidden pointer-events-none z-10"
                  style={{
                    left: `${((tx + offsetLeft_rel_to_hole) / template.width) * 100}%`,
                    top: `${((ty + offsetTop_rel_to_hole) / template.height) * 100}%`,
                    width: `${(cropWidthOnTemplate / template.width) * 100}%`,
                    height: `${(cropHeightOnTemplate / template.height) * 100}%`,
                  }}
                >
                  <video
                    ref={videoRef}
                    src={job.objectUrl}
                    loop
                    muted={isMuted}
                    playsInline
                    autoPlay={isPlaying}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    className={`absolute max-w-none max-h-none ${isMirrored ? 'origin-center scale-x-[-1]' : 'origin-top-left'}`}
                    style={{
                      width: `${(safeVideoWidth / safeCropWidth) * 100}%`,
                      height: `${(safeVideoHeight / safeCropHeight) * 100}%`,
                      left: `${(-crop.x / safeCropWidth) * 100}%`,
                      top: `${(-crop.y / safeCropHeight) * 100}%`,
                    }}
                  />
                </div>
              ) : (
                // Fallback if no hole config: center/crop to full frame on top of template
                <div
                  className="absolute overflow-hidden pointer-events-none z-10"
                  style={{
                    left: `${(50 - (50 * (videoScale / 100)))}%`,
                    top: `${(50 - (50 * (videoScale / 100)))}%`,
                    width: `${videoScale}%`,
                    height: `${videoScale}%`,
                  }}
                >
                  <video
                    ref={videoRef}
                    src={job.objectUrl}
                    loop
                    muted={isMuted}
                    playsInline
                    autoPlay={isPlaying}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    className={`absolute max-w-none max-h-none ${isMirrored ? 'origin-center scale-x-[-1]' : 'origin-top-left'}`}
                    style={{
                      width: `${(safeVideoWidth / safeCropWidth) * 100}%`,
                      height: `${(safeVideoHeight / safeCropHeight) * 100}%`,
                      left: `${(-crop.x / safeCropWidth) * 100}%`,
                      top: `${(-crop.y / safeCropHeight) * 100}%`,
                    }}
                  />
                </div>
              )}



              {/* Status info overlays */}
              <span className="absolute bottom-2 right-2 bg-black/80 border border-white/10 text-[10px] text-[#0071E3] px-2 py-0.5 rounded-md font-mono font-medium z-20">
                Resultado Final (Simulado)
              </span>

              {/* Background Music Audio Element */}
              {musicOverlay?.enabled && musicOverlay?.objectUrl && (
                <audio
                  ref={bgmRef}
                  src={musicOverlay.objectUrl}
                  loop
                  muted={isMuted}
                />
              )}
            </div>

            {/* Timeline / Controle de Reprodução */}
            <div className="bg-white p-4 rounded-xl border border-black/5 flex flex-col gap-3">
              {/* Seção do Vídeo */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[10px] font-bold text-[#0071E3] tracking-wider uppercase">
                  <span>CORTE DO VÍDEO (INÍCIO)</span>
                  <span>FIM</span>
                </div>

                {/* Dual Range Track container */}
                <div
                  ref={setTimelineRef}
                  className="relative h-10 bg-[#E5E9F0] rounded-md border border-black/5 flex items-center overflow-visible cursor-pointer select-none"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsPlaying(false);
                    setIsDraggingPlayhead(true);
                    
                    if (timelineRef && duration) {
                      const rect = timelineRef.getBoundingClientRect();
                      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      const newTime = fraction * duration;
                      const val = Math.max(trimStart, Math.min(trimEnd, parseFloat(newTime.toFixed(2))));
                      if (videoRef.current) {
                        videoRef.current.currentTime = val;
                        setCurrentTime(val);
                      }
                    }
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    setIsPlaying(false);
                    setIsDraggingPlayhead(true);
                    
                    if (timelineRef && duration) {
                      const rect = timelineRef.getBoundingClientRect();
                      const fraction = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
                      const newTime = fraction * duration;
                      const val = Math.max(trimStart, Math.min(trimEnd, parseFloat(newTime.toFixed(2))));
                      if (videoRef.current) {
                        videoRef.current.currentTime = val;
                        setCurrentTime(val);
                      }
                    }
                  }}
                >
                  {/* Selected/Trimmed area highlight in light blue */}
                  <div
                    className="absolute h-full bg-[#0071E3]/15 border-y-2 border-[#0071E3]/25"
                    style={{
                      left: `${(trimStart / (duration || 1)) * 100}%`,
                      width: `${((trimEnd - trimStart) / (duration || 1)) * 100}%`
                    }}
                  />

                  {/* Current Playback Line Indicator with Draggable Handle */}
                  <div
                    className="absolute top-0 bottom-0 z-30 cursor-ew-resize flex flex-col items-center"
                    style={{
                      left: `${(currentTime / (duration || 1)) * 100}%`,
                      transform: 'translateX(-50%)',
                      width: '16px' // Larger interaction target
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsPlaying(false);
                      setIsDraggingPlayhead(true);
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsPlaying(false);
                      setIsDraggingPlayhead(true);
                    }}
                  >
                    {/* The visual red line */}
                    <div className="h-full w-0.5 bg-red-500 relative" />
                    {/* Small dragging pill at the top */}
                    <div className="absolute -top-1 w-2.5 h-2.5 bg-red-500 rounded-full shadow border border-white" />
                  </div>

                  {/* Left Handle (Trim Start) */}
                  <div
                    onMouseDown={(e) => { e.stopPropagation(); handleTimelineMouseDown(e, true); }}
                    onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); setIsPlaying(false); setIsDraggingStart(true); }}
                    className="absolute top-0 bottom-0 w-3 bg-[#0071E3] hover:bg-[#0077ED] active:scale-95 transition-all shadow-md cursor-ew-resize flex items-center justify-center z-20 rounded-l"
                    style={{
                      left: `${(trimStart / (duration || 1)) * 100}%`,
                      transform: 'translateX(-50%)'
                    }}
                  >
                    <div className="w-1 h-4 bg-white/60 rounded-full" />
                  </div>

                  {/* Right Handle (Trim End) */}
                  <div
                    onMouseDown={(e) => { e.stopPropagation(); handleTimelineMouseDown(e, false); }}
                    onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); setIsPlaying(false); setIsDraggingEnd(true); }}
                    className="absolute top-0 bottom-0 w-3 bg-[#0071E3] hover:bg-[#0077ED] active:scale-95 transition-all shadow-md cursor-ew-resize flex items-center justify-center z-20 rounded-r"
                    style={{
                      left: `${(trimEnd / (duration || 1)) * 100}%`,
                      transform: 'translateX(-50%)'
                    }}
                  >
                    <div className="w-1 h-4 bg-white/60 rounded-full" />
                  </div>
                </div>
              </div>



              {/* Bottom controls: circular blue play button, audio/mute button, input fields "De" & "Até", duration label */}
              <div className="flex items-center justify-between mt-3 gap-4">
                {/* Play & Audio controls */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Circular Play/Pause Button */}
                  <button
                    type="button"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-11 h-11 rounded-full bg-[#0071E3] hover:bg-[#0077ED] text-white flex items-center justify-center shadow-md active:scale-95 hover:scale-105 transition-all cursor-pointer flex-shrink-0"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    )}
                  </button>

                  {/* Audio / Mute Button */}
                  <button
                    type="button"
                    onClick={() => setIsMuted(!isMuted)}
                    className={`w-11 h-11 rounded-full border flex items-center justify-center shadow-md active:scale-95 hover:scale-105 transition-all cursor-pointer flex-shrink-0 ${
                      isMuted
                        ? 'bg-slate-100 hover:bg-slate-200 border-black/5 text-[#86868B]'
                        : 'bg-[#0071E3]/10 hover:bg-[#0071E3]/25 border-[#0071E3]/20 text-[#0071E3]'
                    }`}
                    title={isMuted ? "Ativar Áudio" : "Mudar para Mudo"}
                  >
                    {isMuted ? (
                      <VolumeX className="w-5 h-5" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* Input fields for De and Até with Portuguese decimal formatting */}
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#86868B] font-medium font-mono uppercase text-[10px]">De:</span>
                    <input
                      type="text"
                      value={trimStart.toFixed(2).replace('.', ',')}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value.replace(',', '.'));
                        if (!isNaN(val)) {
                          const clamped = Math.max(0, Math.min(trimEnd - 0.1, val));
                          setTrimStart(clamped);
                          if (videoRef.current) {
                            videoRef.current.currentTime = clamped;
                            setCurrentTime(clamped);
                          }
                        }
                      }}
                      className="w-16 px-2 py-1.5 rounded-lg border border-black/10 bg-[#F5F5F7] text-[#1D1D1F] font-mono text-center font-bold focus:outline-none focus:ring-1 focus:ring-[#0071E3]"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[#86868B] font-medium font-mono uppercase text-[10px]">Até:</span>
                    <input
                      type="text"
                      value={trimEnd.toFixed(2).replace('.', ',')}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value.replace(',', '.'));
                        if (!isNaN(val)) {
                          const clamped = Math.max(trimStart + 0.1, Math.min(duration, val));
                          setTrimEnd(clamped);
                        }
                      }}
                      className="w-16 px-2 py-1.5 rounded-lg border border-black/10 bg-[#F5F5F7] text-[#1D1D1F] font-mono text-center font-bold focus:outline-none focus:ring-1 focus:ring-[#0071E3]"
                    />
                  </div>
                </div>

                {/* Duration Label */}
                <div className="text-right flex-shrink-0">
                  <span className="text-[#86868B] text-[10px] font-mono uppercase mr-1">Dur:</span>
                  <span className="text-[#1D1D1F] font-bold font-mono text-xs">{(trimEnd - trimStart).toFixed(1)}s</span>
                </div>
              </div>
            </div>



          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-black/5 px-6 py-4 bg-[#F5F5F7] flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="py-2 px-4 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs text-[#1D1D1F] font-semibold cursor-pointer transition-all shadow-sm"
          >
            Cancelar
          </button>
          <button
            onClick={saveCalibration}
            className="flex items-center gap-1.5 py-2 px-5 rounded-lg bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-bold tracking-widest uppercase cursor-pointer transition-all accent-glow"
          >
            <Save className="w-4 h-4" />
            Salvar Recorte
          </button>
        </div>

      </div>
    </div>
  );
}
