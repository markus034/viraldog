import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Crop, Trash2, Save, AlertCircle, RefreshCw, CheckCircle2, FlipHorizontal, PanelTop } from 'lucide-react';
import { VideoJob, TemplateConfig, TextOverlayConfig, ImageOverlayConfig } from '../types';

const transformText = (text: string, mode?: string) => {
  if (!text) return '';
  switch (mode) {
    case 'sentence':
      return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    case 'lower':
      return text.toLowerCase();
    case 'upper':
      return text.toUpperCase();
    case 'title':
      return text.replace(/\b\w/g, (char) => char.toUpperCase());
    default:
      return text;
  }
};

interface VideoCardProps {
  key?: string;
  job: VideoJob;
  template: TemplateConfig;
  onCalibrate: (job: VideoJob) => void;
  onRemove: (id: string) => void;
  onToggleMirror: (id: string) => void;
  onToggleKeepTitle: (id: string) => void;
  onDownload: (job: VideoJob) => void;
  antiDuplicityEnabled: boolean;
  textOverlay?: TextOverlayConfig;
  imageOverlay?: ImageOverlayConfig;
  keepTitle?: { enabled: boolean; heightPercent: number };
  onUpdateTextOverlay?: (config: Partial<TextOverlayConfig>) => void;
  onUpdateImageOverlay?: (config: Partial<ImageOverlayConfig>) => void;
}

export default function VideoCard({ job, template, onCalibrate, onRemove, onToggleMirror, onToggleKeepTitle, onDownload, antiDuplicityEnabled, textOverlay, imageOverlay, keepTitle, onUpdateTextOverlay, onUpdateImageOverlay }: VideoCardProps) {
  const [selectedElement, setSelectedElement] = useState<'none' | 'text' | 'image'>('none');
  const [isPlaying, setIsPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && containerRef.current.contains(e.target as Node)) {
        return;
      }
      setSelectedElement('none');
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Drag handler for text overlay box
  const handleTextMouseDown = (e: React.MouseEvent) => {
    if (!onUpdateTextOverlay || !textOverlay) return;
    // Don't drag if clicking a resize handle
    if ((e.target as HTMLElement).closest('.resize-handle')) return;

    e.stopPropagation();
    e.preventDefault();
    setSelectedElement('text');

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = textOverlay.positionX ?? 50;
    const startPosY = textOverlay.positionY ?? 85;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
      const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100;
      const newX = Math.round(Math.max(0, Math.min(100, startPosX + deltaX)));
      const newY = Math.round(Math.max(0, Math.min(100, startPosY + deltaY)));
      onUpdateTextOverlay({ positionX: newX, positionY: newY });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Resize handler for text overlay box sides/corners
  const handleResizeMouseDown = (e: React.MouseEvent, isRight: boolean) => {
    if (!onUpdateTextOverlay || !textOverlay) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedElement('text');

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startWidth = textOverlay.widthPercent ?? 80;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
      // Symmetric resizing from center: double deltaX
      const deltaWidth = isRight ? deltaX * 2 : -deltaX * 2;
      const newWidth = Math.round(Math.max(15, Math.min(100, startWidth + deltaWidth)));
      onUpdateTextOverlay({ widthPercent: newWidth });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Corner resize handler for text overlay box (scales font size and width proportionally)
  const handleCornerResizeMouseDown = (e: React.MouseEvent, isRight: boolean) => {
    if (!onUpdateTextOverlay || !textOverlay) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedElement('text');

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startWidth = textOverlay.widthPercent ?? 80;
    const startFontSize = textOverlay.size ?? 16;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
      // Symmetric resizing from center: double deltaX
      const deltaWidth = isRight ? deltaX * 2 : -deltaX * 2;
      const newWidth = Math.round(Math.max(15, Math.min(100, startWidth + deltaWidth)));
      const scale = newWidth / startWidth;
      const newFontSize = Math.max(4, Math.min(120, Math.round(startFontSize * scale)));
      onUpdateTextOverlay({ widthPercent: newWidth, size: newFontSize });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Drag handler for image overlay box
  const handleImageMouseDown = (e: React.MouseEvent) => {
    if (!onUpdateImageOverlay || !imageOverlay) return;
    // Don't drag if clicking a resize handle
    if ((e.target as HTMLElement).closest('.resize-handle')) return;

    e.stopPropagation();
    e.preventDefault();
    setSelectedElement('image');

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPosX = imageOverlay.positionX ?? 50;
    const startPosY = imageOverlay.positionY ?? 50;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
      const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100;
      const newX = Math.round(Math.max(0, Math.min(100, startPosX + deltaX)));
      const newY = Math.round(Math.max(0, Math.min(100, startPosY + deltaY)));
      onUpdateImageOverlay({ positionX: newX, positionY: newY });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Resize handler for image overlay box
  const handleImageResizeMouseDown = (e: React.MouseEvent, isRight: boolean) => {
    if (!onUpdateImageOverlay || !imageOverlay) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedElement('image');

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startScale = imageOverlay.scale ?? 20;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
      // Symmetric resizing from center: double deltaX
      const deltaScale = isRight ? deltaX * 2 : -deltaX * 2;
      const newScale = Math.round(Math.max(5, Math.min(100, startScale + deltaScale)));
      onUpdateImageOverlay({ scale: newScale });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Determine active crop bounding box (manual beats detected, falls back to full)
  let activeBbox = job.manualBbox ?? job.detectedBbox;
  // ponytail: job.keepTitle takes priority; falls back to global keepTitle.enabled
  const keepTitleEnabled = job.keepTitle ?? keepTitle?.enabled ?? false;
  if (keepTitleEnabled && activeBbox) {
    const extension = Math.round(activeBbox.height * ((keepTitle?.heightPercent ?? 25) / 100));
    const newY = Math.max(0, activeBbox.y - extension);
    const heightDiff = activeBbox.y - newY;
    activeBbox = {
      x: activeBbox.x,
      y: newY,
      width: activeBbox.width,
      height: activeBbox.height + heightDiff
    };
  }

  // Visual calculation for composition rendering inside the template hole
  const tx = template.hole?.x ?? 0;
  const ty = template.hole?.y ?? 0;
  const tw = template.hole?.width ?? 1080;
  const th = template.hole?.height ?? 1920;

  let holeStyle: React.CSSProperties = {};
  let videoInHoleStyle: React.CSSProperties = {};

  if (activeBbox && template.hole) {
    // Proportional scale based on original video vs the template canvas dimensions
    const scale = template.width / job.videoWidth;
    const vScaleFactor = (job.videoScale ?? 100) / 100;

    const cropWidthOnTemplate = activeBbox.width * scale * vScaleFactor;
    const cropHeightOnTemplate = activeBbox.height * scale * vScaleFactor;

    // Top-aligned relative to the transparent hole
    const offsetLeft_rel_to_hole = (tw - cropWidthOnTemplate) / 2;
    const offsetTop_rel_to_hole = 0;

    holeStyle = {
      left: `${((tx + offsetLeft_rel_to_hole) / template.width) * 100}%`,
      top: `${((ty + offsetTop_rel_to_hole) / template.height) * 100}%`,
      width: `${(cropWidthOnTemplate / template.width) * 100}%`,
      height: `${(cropHeightOnTemplate / template.height) * 100}%`,
    };

    videoInHoleStyle = {
      width: `${(job.videoWidth / activeBbox.width) * 100}%`,
      height: `${(job.videoHeight / activeBbox.height) * 100}%`,
      left: `${(-activeBbox.x / activeBbox.width) * 100}%`,
      top: `${(-activeBbox.y / activeBbox.height) * 100}%`,
    };
  } else if (activeBbox) {
    const vScalePercent = job.videoScale ?? 100;
    holeStyle = {
      left: `${(50 - (50 * (vScalePercent / 100)))}%`,
      top: `${(50 - (50 * (vScalePercent / 100)))}%`,
      width: `${vScalePercent}%`,
      height: `${vScalePercent}%`,
    };

    videoInHoleStyle = {
      width: `${(job.videoWidth / activeBbox.width) * 100}%`,
      height: `${(job.videoHeight / activeBbox.height) * 100}%`,
      left: `${(-activeBbox.x / activeBbox.width) * 100}%`,
      top: `${(-activeBbox.y / activeBbox.height) * 100}%`,
    };
  }

  if (antiDuplicityEnabled && (job.status === 'concluído' || job.status === 'salvando' || job.status === 'salvo')) {
    videoInHoleStyle = {
      ...videoInHoleStyle,
      filter: 'brightness(1.002) contrast(0.998) saturate(1.002) hue-rotate(0.5deg)',
    };
  }

  const renderStatus = () => {
    switch (job.status) {
      case 'detectando':
        return (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-20">
            <RefreshCw className="w-6 h-6 text-[#0071E3] animate-spin" />
            <p className="text-[9px] font-mono text-[#0071E3] uppercase tracking-widest animate-pulse font-semibold">Detectando Margem...</p>
            {/* Scanner line animation */}
            <div className="absolute left-0 right-0 h-0.5 bg-[#0071E3]/80 shadow-[0_0_10px_rgba(0,113,227,0.8)] top-0 animate-bounce" style={{ animationDuration: '2s' }} />
          </div>
        );
      case 'renderizando':
        return (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-20">
            <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
            <p className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest font-semibold animate-pulse">Renderizando... {job.progress}%</p>
            <div className="w-3/4 bg-slate-700 h-1 rounded-full overflow-hidden mt-1">
              <div className="bg-emerald-400 h-full rounded-full transition-all duration-300" style={{ width: `${job.progress}%` }} />
            </div>
          </div>
        );
      case 'compondo':
        return (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-20">
            <RefreshCw className="w-6 h-6 text-[#0071E3] animate-spin" />
            <p className="text-[9px] font-mono text-[#0071E3] uppercase tracking-widest font-semibold animate-pulse">Compondo Template...</p>
          </div>
        );
      case 'falhou':
        return (
          <div className="absolute inset-0 bg-red-950/90 backdrop-blur-sm flex flex-col items-center justify-center gap-2 p-4 text-center z-20">
            <AlertCircle className="w-6 h-6 text-red-400" />
            <p className="text-[9px] font-mono text-red-400 uppercase tracking-widest font-bold">Falhou</p>
            <p className="text-[9px] text-red-300 leading-tight line-clamp-2">{job.details}</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="apple-card rounded-2xl overflow-hidden flex flex-col group">

      {/* Video Preview Frame */}
      <div className="relative aspect-[9/16] w-full bg-slate-950 overflow-hidden flex-shrink-0 [container-type:inline-size]">

        {/* Render overlay depending on status */}
        {renderStatus()}

        {/* If concluded, pending, or saving, we show the composed structure (template + cropped video or cropped thumbnail) */}
        {job.status !== 'detectando' && job.status !== 'falhou' ? (
          <div
            ref={containerRef}
            onClick={() => setIsPlaying(!isPlaying)}
            className="relative w-full h-full cursor-pointer group/playing"
            title={isPlaying ? "Clique para pausar o preview" : "Clique para dar play no preview"}
          >
            {/* Template layer underneath */}
            {template.objectUrl && (
              <img
                src={template.objectUrl}
                alt="Template"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0"
              />
            )}

            {/* Cropped content layer inside template hole */}
            <div className="absolute overflow-hidden pointer-events-none z-10" style={{ ...holeStyle, transform: job.mirrored ? 'scaleX(-1)' : undefined }}>
              {isPlaying ? (
                <video
                  src={job.objectUrl}
                  loop
                  muted
                  playsInline
                  autoPlay
                  className="absolute max-w-none max-h-none origin-top-left"
                  style={videoInHoleStyle}
                />
              ) : (
                <img
                  src={job.thumbnailUrl || '/assets/placeholder-thumb.jpg'}
                  alt={job.name}
                  className="absolute max-w-none max-h-none origin-top-left"
                  style={videoInHoleStyle}
                />
              )}
              {antiDuplicityEnabled && (
                <div
                  className="absolute inset-0 pointer-events-none z-20 mix-blend-overlay opacity-[0.015]"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                  }}
                />
              )}
            </div>

            {/* If NOT playing, show play button in the center */}
            {!isPlaying && (
              <div className="absolute inset-0 bg-black/15 group-hover/playing:bg-black/35 flex items-center justify-center transition-all z-20">
                <div className="p-3 bg-[#0071E3] hover:bg-[#0077ED] rounded-full text-white scale-90 group-hover/playing:scale-100 transition-all duration-300 shadow-lg">
                  <Play className="w-5 h-5 fill-white text-white translate-x-0.5" />
                </div>
              </div>
            )}

            {/* Hover overlay indicator to pause when playing */}
            {isPlaying && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/playing:opacity-100 flex items-center justify-center transition-opacity z-20">
                <div className="p-3 bg-slate-900/80 rounded-full text-white border border-white/10 accent-glow">
                  <Pause className="w-5 h-5 animate-pulse" />
                </div>
              </div>
            )}

            {/* Check overlay */}
            <div className="absolute top-2 right-2 bg-[#0071E3] text-white p-1.5 rounded-full z-15 shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
          </div>
        ) : (
          /* Otherwise show static thumbnail of pending video */
          <>
            <img
              src={job.thumbnailUrl || '/assets/placeholder-thumb.jpg'}
              alt={job.name}
              className="w-full h-full object-cover opacity-80"
              style={{ transform: job.mirrored ? 'scaleX(-1)' : undefined }}
            />
            {job.status === 'na fila' && (
              <span className="absolute top-2 left-2 bg-black/70 border border-white/10 text-[8px] font-mono text-slate-300 px-1.5 py-0.5 rounded-lg tracking-wider uppercase">
                Na Fila
              </span>
            )}
          </>
        )}

        {/* Dynamic Text Overlay */}
        {textOverlay?.enabled && textOverlay.text && (
          <div
            onMouseDown={handleTextMouseDown}
            className="absolute z-30 pointer-events-auto select-none interactive-overlay"
            style={{
              left: `${textOverlay.positionX ?? 50}%`,
              top: `${textOverlay.positionY ?? 85}%`,
              transform: 'translate(-50%, -50%)',
              width: `${textOverlay.widthPercent ?? 80}%`,
            }}
          >
            {/* Bounding box with blue border and corner/side handles */}
            <div className={`relative p-1 min-h-[30px] flex items-center justify-center border ${
              selectedElement === 'text' ? 'border-cyan-400 bg-black/5 hover:bg-black/10 cursor-move' : 'border-transparent'
            }`}>
              
              {/* Corner Handles */}
              {selectedElement === 'text' && (
                <>
                  <div onMouseDown={(e) => handleCornerResizeMouseDown(e, false)} className="resize-handle absolute top-0 left-0 w-2.5 h-2.5 bg-white border border-cyan-400 rounded-full -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize z-40" />
                  <div onMouseDown={(e) => handleCornerResizeMouseDown(e, true)} className="resize-handle absolute top-0 right-0 w-2.5 h-2.5 bg-white border border-cyan-400 rounded-full translate-x-1/2 -translate-y-1/2 cursor-nesw-resize z-40" />
                  <div onMouseDown={(e) => handleCornerResizeMouseDown(e, false)} className="resize-handle absolute bottom-0 left-0 w-2.5 h-2.5 bg-white border border-cyan-400 rounded-full -translate-x-1/2 translate-y-1/2 cursor-nesw-resize z-40" />
                  <div onMouseDown={(e) => handleCornerResizeMouseDown(e, true)} className="resize-handle absolute bottom-0 right-0 w-2.5 h-2.5 bg-white border border-cyan-400 rounded-full translate-x-1/2 translate-y-1/2 cursor-nwse-resize z-40" />

                  {/* Side Handles (Middle Left/Right) */}
                  <div onMouseDown={(e) => handleResizeMouseDown(e, false)} className="resize-handle absolute top-1/2 left-0 w-1.5 h-3 bg-white border border-cyan-400 rounded -translate-x-1/2 -translate-y-1/2 cursor-ew-resize z-40" />
                  <div onMouseDown={(e) => handleResizeMouseDown(e, true)} className="resize-handle absolute top-1/2 right-0 w-1.5 h-3 bg-white border border-cyan-400 rounded translate-x-1/2 -translate-y-1/2 cursor-ew-resize z-40" />
                </>
              )}

              <div
                className="w-full break-words leading-tight"
                style={{
                  color: textOverlay.color,
                  opacity: (textOverlay.opacity ?? 100) / 100,
                  fontWeight: textOverlay.bold ? 'bold' : 'normal',
                  fontSize: `${(textOverlay.size || 16) / 308.5714 * 100}cqw`,
                  backgroundColor: textOverlay.bgColor
                    ? `${textOverlay.bgColor}${Math.round(((textOverlay.bgOpacity ?? 60) / 100) * 255).toString(16).padStart(2, '0')}`
                    : 'transparent',
                  textShadow: (() => {
                    if (!textOverlay.useShadow) return 'none';
                    const angleRad = ((textOverlay.shadowAngle ?? 45) * Math.PI) / 180;
                    const shadowX = Math.cos(angleRad) * (textOverlay.shadowDistance ?? 6) / 308.5714 * 100;
                    const shadowY = Math.sin(angleRad) * (textOverlay.shadowDistance ?? 6) / 308.5714 * 100;
                    const shadowBlur = (textOverlay.shadowBlur ?? 7) / 308.5714 * 100;
                    const opacityHex = Math.round(((textOverlay.shadowOpacity ?? 80) / 100) * 255).toString(16).padStart(2, '0');
                    const shadowColorHex = textOverlay.shadowColor || '#000000';
                    return `${shadowX}cqw ${shadowY}cqw ${shadowBlur}cqw ${shadowColorHex}${opacityHex}`;
                  })(),
                  textAlign: textOverlay.align ?? 'center',
                  fontFamily: textOverlay.fontFamily || 'Arial',
                  letterSpacing: `${(textOverlay.letterSpacing ?? 0) / 308.5714 * 100}cqw`,
                  lineHeight: `${((textOverlay.size || 16) * 1.2 + (textOverlay.lineSpacing ?? 0) * 0.5) / 308.5714 * 100}cqw`,
                  WebkitTextStroke: textOverlay.strokeEnabled && textOverlay.strokeWidth
                    ? `${(textOverlay.strokeWidth / 308.5714) * 100}cqw ${textOverlay.strokeColor || '#000000'}`
                    : '0px transparent',
                  paintOrder: 'stroke fill',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {transformText(textOverlay.text, textOverlay.caseMode)}
              </div>
            </div>
          </div>
        )}
        {/* Dynamic Image Overlay */}
        {imageOverlay?.enabled && imageOverlay.imageUrl && (
          <div
            onMouseDown={handleImageMouseDown}
            className={`absolute z-30 pointer-events-auto flex items-center justify-center interactive-overlay border ${
              selectedElement === 'image' ? 'border-cyan-400 bg-black/5 hover:bg-black/10 cursor-move' : 'border-transparent'
            }`}
            style={{
              left: `${imageOverlay.positionX ?? 50}%`,
              top: `${imageOverlay.positionY ?? 50}%`,
              transform: 'translate(-50%, -50%)',
              width: `${imageOverlay.scale ?? 20}%`,
              maxWidth: '95%',
              opacity: (imageOverlay.opacity ?? 100) / 100,
            }}
          >
            {/* Image Resize Handles (Corners and Sides) */}
            {selectedElement === 'image' && (
              <>
                {/* Corner Handles */}
                <div onMouseDown={(e) => handleImageResizeMouseDown(e, false)} className="resize-handle absolute top-0 left-0 w-2 h-2 bg-white border border-cyan-400 rounded-full -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize z-40" />
                <div onMouseDown={(e) => handleImageResizeMouseDown(e, true)} className="resize-handle absolute top-0 right-0 w-2 h-2 bg-white border border-cyan-400 rounded-full translate-x-1/2 -translate-y-1/2 cursor-nesw-resize z-40" />
                <div onMouseDown={(e) => handleImageResizeMouseDown(e, false)} className="resize-handle absolute bottom-0 left-0 w-2 h-2 bg-white border border-cyan-400 rounded-full -translate-x-1/2 translate-y-1/2 cursor-nesw-resize z-40" />
                <div onMouseDown={(e) => handleImageResizeMouseDown(e, true)} className="resize-handle absolute bottom-0 right-0 w-2 h-2 bg-white border border-cyan-400 rounded-full translate-x-1/2 translate-y-1/2 cursor-nwse-resize z-40" />

                {/* Side Handles */}
                <div onMouseDown={(e) => handleImageResizeMouseDown(e, false)} className="resize-handle absolute top-1/2 left-0 w-1 h-2.5 bg-white border border-cyan-400 rounded -translate-x-1/2 -translate-y-1/2 cursor-ew-resize z-40" />
                <div onMouseDown={(e) => handleImageResizeMouseDown(e, true)} className="resize-handle absolute top-1/2 right-0 w-1 h-2.5 bg-white border border-cyan-400 rounded translate-x-1/2 -translate-y-1/2 cursor-ew-resize z-40" />
              </>
            )}

            <img
              src={imageOverlay.imageUrl}
              alt="Watermark Overlay"
              className="w-full h-auto object-contain select-none pointer-events-none"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </div>

      {/* Info and Actions Footer */}
      <div className="p-2.5 flex flex-col gap-1.5 bg-white border-t border-black/5">
        <div className="flex flex-col gap-0.5">
          <p className="text-[11px] font-semibold text-[#1D1D1F] truncate group-hover:text-[#0071E3] transition-colors" title={job.name}>
            {job.name}
          </p>
          <p className="text-[9px] font-mono text-[#86868B]">
            Duração: {job.duration.toFixed(1)}s • {job.videoWidth}x{job.videoHeight}px
          </p>
        </div>

        {/* Crop indicators */}
        <div className="bg-[#F5F5F7] border border-black/5 p-1.5 rounded-lg flex items-center justify-between gap-1">
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] uppercase font-mono tracking-widest text-[#86868B] font-bold">Região Ativa</span>
            <span className="text-[9px] font-mono font-bold text-[#1D1D1F]">
              {activeBbox ? `${activeBbox.width}x${activeBbox.height} (${job.mode === 'auto' ? 'Auto' : 'Calib.'})` : 'Calculando...'}
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => onToggleKeepTitle(job.id)}
              className={`p-1 rounded-md border cursor-pointer transition-all ${job.keepTitle
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/20'
                  : 'bg-white border-slate-200 hover:border-emerald-500/30 hover:bg-slate-50 text-[#86868B] hover:text-emerald-600'
                }`}
              title={job.keepTitle ? 'Desativar: manter título acima do recorte' : 'Ativar: manter título acima do recorte'}
            >
              <PanelTop className="w-3 h-3" />
            </button>
            <button
              onClick={() => onToggleMirror(job.id)}
              className={`p-1 rounded-md border cursor-pointer transition-all ${job.mirrored
                  ? 'bg-[#0071E3] border-[#0071E3] text-white hover:bg-[#0077ED]'
                  : 'bg-white border-slate-200 hover:border-[#0071E3]/50 hover:bg-slate-50 text-[#86868B] hover:text-[#0071E3]'
                }`}
              title={job.mirrored ? 'Remover espelhamento' : 'Espelhar vídeo horizontalmente'}
            >
              <FlipHorizontal className="w-3 h-3" />
            </button>
            <button
              onClick={() => onCalibrate(job)}
              className="p-1 rounded-md bg-white border border-slate-200 hover:border-[#0071E3]/50 hover:bg-slate-50 text-[#86868B] hover:text-[#0071E3] cursor-pointer transition-all"
              title="Ajustar calibração manual"
            >
              <Crop className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card Operations */}
        <div className="flex items-center gap-1 mt-0.5 border-t border-black/5 pt-1.5">
          {job.status === 'concluído' || job.status === 'na fila' ? (
            <button
              onClick={() => onDownload(job)}
              className="flex-grow flex items-center justify-center gap-1 py-1.5 rounded-md bg-[#0071E3] hover:bg-[#0077ED] text-[9px] text-white font-bold transition-all shadow-sm cursor-pointer"
            >
              <Save className="w-3 h-3" />
              Salvar Vídeo
            </button>
          ) : job.status === 'salvo' ? (
            <button
              onClick={() => onDownload(job)}
              className="flex-grow flex items-center justify-center gap-1 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-[9px] text-white font-bold transition-all shadow-sm cursor-pointer"
              title="Já salvo — clique para salvar novamente"
            >
              <CheckCircle2 className="w-3 h-3" />
              Salvo
            </button>
          ) : job.status === 'salvando' ? (
            <div className="flex-grow flex flex-col gap-1 py-1.5 px-2 bg-[#F5F5F7] rounded-md border border-black/5">
              <div className="flex justify-between items-center text-[9px] font-mono text-[#0071E3] font-bold">
                <span>Salvando...</span>
                <span>{job.progress || 0}%</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden relative shadow-inner">
                <div 
                  className="bg-[#0071E3] h-full rounded-full transition-all duration-150 relative"
                  style={{ width: `${job.progress || 0}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex-grow text-[9px] font-mono text-[#86868B] py-1.5 px-2 bg-[#F5F5F7] rounded-md border border-black/5">
              {job.details || 'Aguardando...'}
            </div>
          )}

          <button
            onClick={() => onRemove(job.id)}
            className="p-1 rounded-md bg-white border border-slate-200 hover:border-red-500/50 hover:bg-red-50 text-[#86868B] hover:text-red-500 cursor-pointer transition-all"
            title="Remover vídeo"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

    </div>
  );
}
