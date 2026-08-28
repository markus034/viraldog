import React, { useState } from 'react';
import { Play, Pause, Crop, Trash2, Download, AlertCircle, RefreshCw, CheckCircle2, FlipHorizontal } from 'lucide-react';
import { VideoJob, TemplateConfig, TextOverlayConfig, ImageOverlayConfig } from '../types';

interface VideoCardProps {
  key?: string;
  job: VideoJob;
  template: TemplateConfig;
  onCalibrate: (job: VideoJob) => void;
  onRemove: (id: string) => void;
  onToggleMirror: (id: string) => void;
  onDownload: (job: VideoJob) => void;
  antiDuplicityEnabled: boolean;
  textOverlay?: TextOverlayConfig;
  imageOverlay?: ImageOverlayConfig;
  keepTitle?: { enabled: boolean; heightPercent: number };
}

export default function VideoCard({ job, template, onCalibrate, onRemove, onToggleMirror, onDownload, antiDuplicityEnabled, textOverlay, imageOverlay, keepTitle }: VideoCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  // Determine active crop bounding box (manual beats detected, falls back to full)
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

  if (antiDuplicityEnabled && (job.status === 'concluído' || job.status === 'salvando')) {
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
      <div className="relative aspect-[9/16] w-full bg-slate-950 overflow-hidden flex-shrink-0">
        
        {/* Render overlay depending on status */}
        {renderStatus()}
 
        {/* If concluded or saving, we show the composed structure (template + cropped video or cropped thumbnail) */}
        {job.status === 'concluído' || job.status === 'salvando' ? (
          <div 
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
            <div className="absolute overflow-hidden pointer-events-none z-10" style={holeStyle}>
              {isPlaying ? (
                <video
                  src={job.objectUrl}
                  loop
                  muted
                  playsInline
                  autoPlay
                  className={`absolute max-w-none max-h-none ${job.mirrored ? 'origin-center scale-x-[-1]' : 'origin-top-left'}`}
                  style={videoInHoleStyle}
                />
              ) : (
                <img
                  src={job.thumbnailUrl || '/assets/placeholder-thumb.jpg'}
                  alt={job.name}
                  className={`absolute max-w-none max-h-none ${job.mirrored ? 'origin-center scale-x-[-1]' : 'origin-top-left'}`}
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
              className={`w-full h-full object-cover opacity-80`}
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
            className="absolute z-30 pointer-events-none"
            style={{
              left: `${textOverlay.positionX ?? 50}%`,
              top: `${textOverlay.positionY ?? 85}%`,
              transform: `translate(${
                textOverlay.align === 'left' ? '0' : textOverlay.align === 'right' ? '-100%' : '-50%'
              }, -50%)`,
              width: 'max-content',
              maxWidth: '92%',
            }}
          >
            <div 
              className="px-2.5 py-1 rounded-md break-words leading-tight transition-all"
              style={{
                color: textOverlay.color,
                fontWeight: textOverlay.bold ? 'bold' : 'normal',
                fontSize: `${textOverlay.size}px`,
                backgroundColor: textOverlay.bgColor 
                  ? `${textOverlay.bgColor}${Math.round(((textOverlay.bgOpacity ?? 60) / 100) * 255).toString(16).padStart(2, '0')}` 
                  : 'transparent',
                textShadow: textOverlay.useShadow ? '1px 1px 2px rgba(0,0,0,0.8)' : 'none',
                textAlign: textOverlay.align ?? 'center',
              }}
            >
              {textOverlay.text}
            </div>
          </div>
        )}

        {/* Dynamic Image Overlay */}
        {imageOverlay?.enabled && imageOverlay.imageUrl && (
          <div 
            className="absolute z-30 pointer-events-none"
            style={{
              left: `${imageOverlay.positionX ?? 50}%`,
              top: `${imageOverlay.positionY ?? 50}%`,
              transform: 'translate(-50%, -50%)',
              width: `${imageOverlay.scale ?? 20}%`,
              maxWidth: '95%',
              opacity: (imageOverlay.opacity ?? 100) / 100,
            }}
          >
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
      <div className="p-4 flex flex-col gap-2.5 bg-white border-t border-black/5">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-semibold text-[#1D1D1F] truncate group-hover:text-[#0071E3] transition-colors" title={job.name}>
            {job.name}
          </p>
          <p className="text-[9px] font-mono text-[#86868B]">
            Duração: {job.duration.toFixed(1)}s • {job.videoWidth}x{job.videoHeight}px
          </p>
        </div>
 
        {/* Crop indicators */}
        <div className="bg-[#F5F5F7] border border-black/5 p-2 rounded-lg flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] uppercase font-mono tracking-widest text-[#86868B] font-bold">Região Ativa</span>
            <span className="text-[9px] font-mono font-bold text-[#1D1D1F]">
              {activeBbox ? `${activeBbox.width}x${activeBbox.height} (${job.mode === 'auto' ? 'Auto' : 'Calib.'})` : 'Calculando...'}
            </span>
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => onToggleMirror(job.id)}
              className={`p-1.5 rounded-md border cursor-pointer transition-all ${
                job.mirrored
                  ? 'bg-[#0071E3] border-[#0071E3] text-white hover:bg-[#0077ED]'
                  : 'bg-white border-slate-200 hover:border-[#0071E3]/50 hover:bg-slate-50 text-[#86868B] hover:text-[#0071E3]'
              }`}
              title={job.mirrored ? 'Remover espelhamento' : 'Espelhar vídeo horizontalmente'}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onCalibrate(job)}
              className="p-1.5 rounded-md bg-white border border-slate-200 hover:border-[#0071E3]/50 hover:bg-slate-50 text-[#86868B] hover:text-[#0071E3] cursor-pointer transition-all"
              title="Ajustar calibração manual"
            >
              <Crop className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
 
        {/* Card Operations */}
        <div className="flex items-center gap-1.5 mt-1 border-t border-black/5 pt-2">
          {job.status === 'concluído' ? (
            <button
              onClick={() => onDownload(job)}
              className="flex-grow flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-[#0071E3] hover:bg-[#0077ED] text-[10px] text-white font-bold transition-all shadow-sm cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar Vídeo
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
            className="p-1.5 rounded-md bg-white border border-slate-200 hover:border-red-500/50 hover:bg-red-50 text-[#86868B] hover:text-red-500 cursor-pointer transition-all"
            title="Remover vídeo"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
 
    </div>
  );
}
