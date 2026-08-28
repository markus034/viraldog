import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Upload, FileImage, ShieldCheck, HelpCircle, RefreshCw, X, Sliders } from 'lucide-react';
import { TemplateConfig } from '../types';
import { detectTemplateHole } from '../utils/detector';
import TemplateHubModal, { saveTemplate } from './TemplateHubModal';

interface TemplateCardProps {
  config: TemplateConfig;
  onChange: (newConfig: TemplateConfig) => void;
}

export default function TemplateCard({ config, onChange }: TemplateCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [isTemplateHubOpen, setIsTemplateHubOpen] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [isManualAdjustOpen, setIsManualAdjustOpen] = useState(false);
  const [manualHole, setManualHole] = useState<{ x: number, y: number, width: number, height: number }>({ x: 0, y: 0, width: 1080, height: 1920 });

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [interaction, setInteraction] = useState<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    initialHole: { x: number; y: number; width: number; height: number };
    handle?: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w';
  } | null>(null);

  const beginAdjustInteraction = (e: React.MouseEvent, mode: 'move' | 'resize', handle?: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w') => {
    e.preventDefault();
    e.stopPropagation();
    setInteraction({
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initialHole: { ...manualHole },
      handle,
    });
  };

  useEffect(() => {
    if (!interaction) return;

    const handleMouseMove = (e: MouseEvent) => {
      const bounds = previewContainerRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const dx = ((e.clientX - interaction.startX) * (config.width || 1080)) / bounds.width;
      const dy = ((e.clientY - interaction.startY) * (config.height || 1920)) / bounds.height;

      if (interaction.mode === 'move') {
        const nextX = Math.max(0, Math.min((config.width || 1080) - interaction.initialHole.width, interaction.initialHole.x + dx));
        const nextY = Math.max(0, Math.min((config.height || 1920) - interaction.initialHole.height, interaction.initialHole.y + dy));
        setManualHole({
          ...interaction.initialHole,
          x: Math.round(nextX),
          y: Math.round(nextY),
        });
      } else if (interaction.mode === 'resize') {
        const wLimit = config.width || 1080;
        const hLimit = config.height || 1920;

        if (interaction.handle === 'se') {
          const nextWidth = Math.max(50, Math.min(wLimit - interaction.initialHole.x, interaction.initialHole.width + dx));
          const nextHeight = Math.max(50, Math.min(hLimit - interaction.initialHole.y, interaction.initialHole.height + dy));
          setManualHole({
            ...interaction.initialHole,
            width: Math.round(nextWidth),
            height: Math.round(nextHeight),
          });
        } else if (interaction.handle === 'nw') {
          const nextX = Math.max(0, Math.min(interaction.initialHole.x + interaction.initialHole.width - 50, interaction.initialHole.x + dx));
          const nextWidth = interaction.initialHole.width - (nextX - interaction.initialHole.x);
          const nextY = Math.max(0, Math.min(interaction.initialHole.y + interaction.initialHole.height - 50, interaction.initialHole.y + dy));
          const nextHeight = interaction.initialHole.height - (nextY - interaction.initialHole.y);
          setManualHole({
            x: Math.round(nextX),
            y: Math.round(nextY),
            width: Math.round(nextWidth),
            height: Math.round(nextHeight),
          });
        } else if (interaction.handle === 'ne') {
          const nextWidth = Math.max(50, Math.min(wLimit - interaction.initialHole.x, interaction.initialHole.width + dx));
          const nextY = Math.max(0, Math.min(interaction.initialHole.y + interaction.initialHole.height - 50, interaction.initialHole.y + dy));
          const nextHeight = interaction.initialHole.height - (nextY - interaction.initialHole.y);
          setManualHole({
            ...interaction.initialHole,
            width: Math.round(nextWidth),
            y: Math.round(nextY),
            height: Math.round(nextHeight),
          });
        } else if (interaction.handle === 'sw') {
          const nextX = Math.max(0, Math.min(interaction.initialHole.x + interaction.initialHole.width - 50, interaction.initialHole.x + dx));
          const nextWidth = interaction.initialHole.width - (nextX - interaction.initialHole.x);
          const nextHeight = Math.max(50, Math.min(hLimit - interaction.initialHole.y, interaction.initialHole.height + dy));
          setManualHole({
            ...interaction.initialHole,
            x: Math.round(nextX),
            width: Math.round(nextWidth),
            height: Math.round(nextHeight),
          });
        } else if (interaction.handle === 'n') {
          const nextY = Math.max(0, Math.min(interaction.initialHole.y + interaction.initialHole.height - 50, interaction.initialHole.y + dy));
          const nextHeight = interaction.initialHole.height - (nextY - interaction.initialHole.y);
          setManualHole({
            ...interaction.initialHole,
            y: Math.round(nextY),
            height: Math.round(nextHeight),
          });
        } else if (interaction.handle === 's') {
          const nextHeight = Math.max(50, Math.min(hLimit - interaction.initialHole.y, interaction.initialHole.height + dy));
          setManualHole({
            ...interaction.initialHole,
            height: Math.round(nextHeight),
          });
        } else if (interaction.handle === 'e') {
          const nextWidth = Math.max(50, Math.min(wLimit - interaction.initialHole.x, interaction.initialHole.width + dx));
          setManualHole({
            ...interaction.initialHole,
            width: Math.round(nextWidth),
          });
        } else if (interaction.handle === 'w') {
          const nextX = Math.max(0, Math.min(interaction.initialHole.x + interaction.initialHole.width - 50, interaction.initialHole.x + dx));
          const nextWidth = interaction.initialHole.width - (nextX - interaction.initialHole.x);
          setManualHole({
            ...interaction.initialHole,
            x: Math.round(nextX),
            width: Math.round(nextWidth),
          });
        }
      }
    };

    const handleMouseUp = () => {
      setInteraction(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [interaction, config.width, config.height]);

  const openManualAdjust = () => {
    if (!config.objectUrl) return;
    const currentHole = config.hole || {
      x: Math.round(config.width * 0.1),
      y: Math.round(config.height * 0.1),
      width: Math.round(config.width * 0.8),
      height: Math.round(config.height * 0.8)
    };
    setManualHole(currentHole);
    setIsManualAdjustOpen(true);
  };

  const handleSaveManualHole = () => {
    onChange({
      ...config,
      hole: manualHole,
    });
    setIsManualAdjustOpen(false);
  };

  const handleFile = async (file: File) => {
    if (!file.type.includes('image/')) {
      return;
    }

    setAnalyzing(true);
    const objectUrl = URL.createObjectURL(file);
    try {
      const { hole, width, height, hasAlpha } = await detectTemplateHole(objectUrl);
      const nextConfig = {
        file,
        objectUrl,
        width,
        height,
        hole,
        hasAlpha,
      };
      onChange(nextConfig);
      try {
        await saveTemplate(file, file.name.replace(/\.[^/.]+$/, ''), 'uploaded', hole);
        setLibraryError('');
      } catch (saveError) {
        setLibraryError(saveError instanceof Error ? saveError.message : 'O template foi aplicado, mas não pôde ser salvo na biblioteca.');
      }
    } catch (e) {
      console.error(e);
      onChange({
        file,
        objectUrl,
        width: 1080,
        height: 1920,
        hole: { x: 108, y: 192, width: 864, height: 1536 },
        hasAlpha: false,
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const hasTemplate = !!config.objectUrl && config.file?.name !== 'default_mobile_frame.png';

  return (
    <div id="template-card-container" className="apple-card rounded-2xl p-6 flex flex-col gap-4 text-[#1D1D1F]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileImage id="template-icon" className="w-4.5 h-4.5 text-[#0071E3]" />
          <h3 className="font-semibold text-xs tracking-[0.15em] text-[#86868B] uppercase">1. Template Overlay</h3>
        </div>
        {hasTemplate && (
          <button
            type="button"
            onClick={openManualAdjust}
            title="Ajustar Área do Template"
            className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full font-mono flex items-center gap-1 hover:scale-105 active:scale-95 transition-all cursor-pointer ${
              config.hasAlpha ? 'bg-[#0071E3]/10 text-[#0071E3] border border-[#0071E3]/20 hover:bg-[#0071E3]/20' : 'bg-amber-500/10 text-amber-600 border border-amber-500/20 hover:bg-amber-500/20'
            }`}
          >
            {config.hasAlpha ? <ShieldCheck className="w-3 h-3" /> : <HelpCircle className="w-3 h-3" />}
            {config.hasAlpha ? 'Alpha Detectado' : 'Ajuste Manual'}
          </button>
        )}
      </div>

      {!hasTemplate ? (
        <div
          id="template-dropzone"
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => setIsTemplateHubOpen(true)}
          className="border border-dashed border-slate-200 hover:border-[#0071E3]/50 bg-[#F5F5F7] hover:bg-slate-50 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 group min-h-[120px]"
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {analyzing ? (
            <div className="flex flex-col items-center gap-1.5 text-center">
              <RefreshCw className="w-6 h-6 text-[#0071E3] animate-spin" />
              <p className="text-[10px] text-[#86868B]">Analisando canais alpha...</p>
            </div>
          ) : (
            <>
              <div className="p-3 bg-white rounded-xl shadow-xs border border-black/5 group-hover:scale-105 transition-transform duration-300">
                <Upload className="w-5 h-5 text-[#86868B] group-hover:text-[#0071E3]" />
              </div>
              <div className="text-center">
                <p className="text-xs font-bold text-[#1D1D1F]">Adicionar Template</p>
              </div>
            </>
          )}
        </div>
      ) : (
        <div id="template-info" className="flex flex-col items-center">
          <div className="relative w-full h-52 bg-[#F5F5F7] rounded-xl border border-black/5 flex items-center justify-center overflow-hidden p-3 shadow-inner group">
            {/* Background com padrão sutil de alpha */}
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:8px_8px]" />
            
            {/* Container proporcional ao aspect-ratio da imagem do template */}
            <div
              className="relative h-full rounded-lg overflow-hidden shadow-md z-10 flex-shrink-0"
              style={{ aspectRatio: `${config.width || 1080} / ${config.height || 1920}` }}
            >
              <img src={config.objectUrl} alt="Template" className="w-full h-full object-cover pointer-events-none" />
              {config.hole && (
                <div
                  className="absolute border-2 border-[#0071E3] bg-[#0071E3]/20 pointer-events-none z-20"
                  style={{
                    left: `${(config.hole.x / (config.width || 1080)) * 100}%`,
                    top: `${(config.hole.y / (config.height || 1920)) * 100}%`,
                    width: `${(config.hole.width / (config.width || 1080)) * 100}%`,
                    height: `${(config.hole.height / (config.height || 1920)) * 100}%`,
                  }}
                />
              )}
            </div>

            {/* Hover Action Overlay */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2 z-30">
              <button
                type="button"
                onClick={() => setIsTemplateHubOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-white text-[#0071E3] text-xs font-bold shadow-md hover:scale-105 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Substituir
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange({
                    file: new File([], 'default_mobile_frame.png', { type: 'image/png' }),
                    objectUrl: '',
                    width: 1080,
                    height: 1920,
                    hole: null,
                    hasAlpha: false,
                  });
                }}
                className="p-2 rounded-xl bg-white/90 text-rose-600 hover:bg-white text-xs font-bold shadow-md hover:scale-105 transition-all cursor-pointer flex items-center justify-center"
                title="Remover Template"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      )}

      {libraryError ? <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-[10px] text-amber-700">{libraryError}</p> : null}

      <TemplateHubModal
        open={isTemplateHubOpen}
        onClose={() => setIsTemplateHubOpen(false)}
        onUploadClick={() => fileInputRef.current?.click()}
        onApply={onChange}
      />

      {isManualAdjustOpen && config.objectUrl && createPortal(
        <div id="manual-adjust-modal" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm select-none">
          <div className="bg-white rounded-2xl max-w-[380px] w-full p-4 sm:p-5 shadow-2xl flex flex-col gap-3 overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#0071E3]" />
                <h3 className="font-semibold text-sm text-[#1D1D1F]">Ajustar Slot do Template</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsManualAdjustOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Visual Preview Area */}
            <div className="flex flex-col items-center gap-2 overflow-hidden w-full">
              <div 
                ref={previewContainerRef}
                className="relative bg-slate-950 rounded-xl overflow-hidden border border-black/10 shadow-inner flex items-center justify-center h-[48vh] max-h-[420px] min-h-[260px] w-auto max-w-full select-none touch-none mx-auto"
                style={{
                  aspectRatio: `${config.width || 1080} / ${config.height || 1920}`,
                }}
              >
                {/* Background com padrão sutil de alpha */}
                <div className="absolute inset-0 bg-[radial-gradient(#334155_1.5px,transparent_1.5px)] [background-size:12px_12px] opacity-40 pointer-events-none" />

                <img 
                  src={config.objectUrl} 
                  alt="Template Preview" 
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none" 
                />

                {/* Draggable & Resizable Slot Box */}
                <div
                  onMouseDown={(e) => beginAdjustInteraction(e, 'move')}
                  className="absolute border-2 border-[#0071E3] bg-[#0071E3]/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] cursor-move select-none"
                  style={{
                    left: `${(manualHole.x / (config.width || 1080)) * 100}%`,
                    top: `${(manualHole.y / (config.height || 1920)) * 100}%`,
                    width: `${(manualHole.width / (config.width || 1080)) * 100}%`,
                    height: `${(manualHole.height / (config.height || 1920)) * 100}%`,
                  }}
                >
                  {/* Corner Handles */}
                  <div
                    onMouseDown={(e) => beginAdjustInteraction(e, 'resize', 'nw')}
                    className="absolute top-0 left-0 w-3 h-3 bg-white border-2 border-[#0071E3] rounded-full -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize z-40 shadow-sm"
                  />
                  <div
                    onMouseDown={(e) => beginAdjustInteraction(e, 'resize', 'ne')}
                    className="absolute top-0 right-0 w-3 h-3 bg-white border-2 border-[#0071E3] rounded-full translate-x-1/2 -translate-y-1/2 cursor-nesw-resize z-40 shadow-sm"
                  />
                  <div
                    onMouseDown={(e) => beginAdjustInteraction(e, 'resize', 'sw')}
                    className="absolute bottom-0 left-0 w-3 h-3 bg-white border-2 border-[#0071E3] rounded-full -translate-x-1/2 translate-y-1/2 cursor-nesw-resize z-40 shadow-sm"
                  />
                  <div
                    onMouseDown={(e) => beginAdjustInteraction(e, 'resize', 'se')}
                    className="absolute bottom-0 right-0 w-3 h-3 bg-white border-2 border-[#0071E3] rounded-full translate-x-1/2 translate-y-1/2 cursor-nwse-resize z-40 shadow-sm"
                  />

                  {/* Side Handles */}
                  <div
                    onMouseDown={(e) => beginAdjustInteraction(e, 'resize', 'n')}
                    className="absolute top-0 left-1/2 w-2 h-2 bg-white border-2 border-[#0071E3] rounded-sm -translate-x-1/2 -translate-y-1/2 cursor-ns-resize z-40 shadow-sm"
                  />
                  <div
                    onMouseDown={(e) => beginAdjustInteraction(e, 'resize', 's')}
                    className="absolute bottom-0 left-1/2 w-2 h-2 bg-white border-2 border-[#0071E3] rounded-sm -translate-x-1/2 translate-y-1/2 cursor-ns-resize z-40 shadow-sm"
                  />
                  <div
                    onMouseDown={(e) => beginAdjustInteraction(e, 'resize', 'e')}
                    className="absolute top-1/2 right-0 w-2 h-2 bg-white border-2 border-[#0071E3] rounded-sm translate-x-1/2 -translate-y-1/2 cursor-ew-resize z-40 shadow-sm"
                  />
                  <div
                    onMouseDown={(e) => beginAdjustInteraction(e, 'resize', 'w')}
                    className="absolute top-1/2 left-0 w-2 h-2 bg-white border-2 border-[#0071E3] rounded-sm -translate-x-1/2 -translate-y-1/2 cursor-ew-resize z-40 shadow-sm"
                  />
                </div>
              </div>

              {/* Resolution & Dimensions Info */}
              <div className="flex items-center justify-between w-full px-1 pt-1 text-[10px] text-slate-500 font-mono">
                <span>Imagem: {config.width || 1080}×{config.height || 1920}px</span>
                <span className="text-[#0071E3] font-semibold">Slot: {manualHole.width}×{manualHole.height}px</span>
              </div>

              <p className="text-[9px] text-[#86868B] text-center">
                Arraste o retângulo para mover. Use os cantos para redimensionar.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2.5 mt-1 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsManualAdjustOpen(false)}
                className="flex-1 py-2 px-3 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveManualHole}
                className="flex-1 py-2 px-3 text-xs font-semibold rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white shadow-sm transition-colors cursor-pointer"
              >
                Confirmar
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
