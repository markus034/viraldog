import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, FileImage, ShieldCheck, HelpCircle, RefreshCw, X, Sliders } from 'lucide-react';
import { TemplateConfig } from '../types';
import { detectTemplateHole } from '../utils/detector';

interface TemplateCardProps {
  config: TemplateConfig;
  onChange: (newConfig: TemplateConfig) => void;
}

export default function TemplateCard({ config, onChange }: TemplateCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [isManualAdjustOpen, setIsManualAdjustOpen] = useState(false);
  const [manualHole, setManualHole] = useState<{ x: number, y: number, width: number, height: number }>({ x: 0, y: 0, width: 1080, height: 1920 });

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
      alert('Por favor, envie um arquivo de imagem (PNG recomendado).');
      return;
    }

    setAnalyzing(true);
    const objectUrl = URL.createObjectURL(file);
    try {
      const { hole, width, height, hasAlpha } = await detectTemplateHole(objectUrl);
      onChange({
        file,
        objectUrl,
        width,
        height,
        hole,
        hasAlpha,
      });
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

  return (
    <div id="template-card-container" className="apple-card rounded-2xl p-6 flex flex-col gap-4 text-[#1D1D1F]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileImage id="template-icon" className="w-4.5 h-4.5 text-[#0071E3]" />
          <h3 className="font-semibold text-xs tracking-[0.15em] text-[#86868B] uppercase">1. Template Overlay</h3>
        </div>
        {config.objectUrl && (
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

      {!config.objectUrl ? (
        <div
          id="template-dropzone"
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border border-dashed border-slate-200 hover:border-[#0071E3]/50 bg-[#F5F5F7] hover:bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all duration-300 group min-h-[110px]"
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
              <div className="p-2 bg-white rounded-lg shadow-sm border border-black/5 group-hover:scale-105 transition-transform duration-300">
                <Upload className="w-4 h-4 text-[#86868B] group-hover:text-[#0071E3]" />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-[#1D1D1F]">Adicionar Template</p>
              </div>
            </>
          )}
        </div>
      ) : (
        <div id="template-info" className="flex flex-col gap-3">
          <div className="flex items-center gap-3 bg-[#F5F5F7] p-3 rounded-xl border border-black/5">
            <div className="relative w-12 h-20 bg-black rounded-lg border border-black/5 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-inner">
              <img src={config.objectUrl} alt="Template" className="w-full h-full object-contain" />
              {config.hole && (
                <div
                  className="absolute border border-[#0071E3] bg-[#0071E3]/10 pointer-events-none"
                  style={{
                    left: `${(config.hole.x / config.width) * 100}%`,
                    top: `${(config.hole.y / config.height) * 100}%`,
                    width: `${(config.hole.width / config.width) * 100}%`,
                    height: `${(config.hole.height / config.height) * 100}%`,
                  }}
                />
              )}
            </div>
            <div className="flex-grow min-w-0">
              <p className="text-xs font-semibold text-[#1D1D1F] truncate">{config.file?.name}</p>
              <p className="text-[10px] text-[#86868B] font-mono mt-0.5">
                Resolução: {config.width}x{config.height}px
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              id="change-template-btn"
              onClick={() => fileInputRef.current?.click()}
              className="flex-grow flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs text-[#0071E3] font-semibold hover:text-[#0077ED] transition-all cursor-pointer shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Substituir Template
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        </div>
      )}

      {isManualAdjustOpen && config.objectUrl && createPortal(
        <div id="manual-adjust-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col md:flex-row gap-6 max-h-[90vh] overflow-y-auto">
            
            {/* Visual Preview Area */}
            <div className="flex-grow flex flex-col items-center gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#86868B] mb-1">Visualização do Slot</h4>
              <div 
                className="relative bg-slate-900 rounded-xl overflow-hidden border border-black/10 shadow-inner flex items-center justify-center max-h-[320px] sm:max-h-[400px] h-[320px] sm:h-[400px]"
                style={{ aspectRatio: `${config.width || 1080} / ${config.height || 1920}` }}
              >
                <img src={config.objectUrl} alt="Template Preview" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
                <div
                  className="absolute border-2 border-[#0071E3] bg-[#0071E3]/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] transition-all duration-75"
                  style={{
                    left: `${(manualHole.x / (config.width || 1080)) * 100}%`,
                    top: `${(manualHole.y / (config.height || 1920)) * 100}%`,
                    width: `${(manualHole.width / (config.width || 1080)) * 100}%`,
                    height: `${(manualHole.height / (config.height || 1920)) * 100}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-[#86868B] font-mono text-center">
                Área destacada representa o canal transparente
              </p>
            </div>

            {/* Adjust Control Sliders */}
            <div className="w-full md:w-80 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#0071E3]" />
                    <h3 className="font-semibold text-sm text-[#1D1D1F]">Coordenadas do Slot</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsManualAdjustOpen(false)}
                    className="p-1.5 rounded-full hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Posição X */}
                  <div className="bg-[#F5F5F7] p-3 rounded-xl border border-black/5">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-600">Posição X</span>
                      <span className="font-mono font-bold text-[#0071E3]">{manualHole.x}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={Math.max(0, (config.width || 1080) - 50)}
                      value={manualHole.x}
                      onChange={(e) => {
                        const x = parseInt(e.target.value);
                        setManualHole(prev => ({
                          ...prev,
                          x,
                          width: Math.min(prev.width, (config.width || 1080) - x)
                        }));
                      }}
                      className="w-full cursor-pointer accent-[#0071E3]"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                      <span>0px</span>
                      <span>{config.width || 1080}px</span>
                    </div>
                  </div>

                  {/* Posição Y */}
                  <div className="bg-[#F5F5F7] p-3 rounded-xl border border-black/5">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-600">Posição Y</span>
                      <span className="font-mono font-bold text-[#0071E3]">{manualHole.y}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={Math.max(0, (config.height || 1920) - 50)}
                      value={manualHole.y}
                      onChange={(e) => {
                        const y = parseInt(e.target.value);
                        setManualHole(prev => ({
                          ...prev,
                          y,
                          height: Math.min(prev.height, (config.height || 1920) - y)
                        }));
                      }}
                      className="w-full cursor-pointer accent-[#0071E3]"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                      <span>0px</span>
                      <span>{config.height || 1920}px</span>
                    </div>
                  </div>

                  {/* Largura */}
                  <div className="bg-[#F5F5F7] p-3 rounded-xl border border-black/5">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-600">Largura (Width)</span>
                      <span className="font-mono font-bold text-[#0071E3]">{manualHole.width}px</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max={(config.width || 1080) - manualHole.x}
                      value={manualHole.width}
                      onChange={(e) => {
                        const w = parseInt(e.target.value);
                        setManualHole(prev => ({ ...prev, width: w }));
                      }}
                      className="w-full cursor-pointer accent-[#0071E3]"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                      <span>50px</span>
                      <span>{(config.width || 1080) - manualHole.x}px</span>
                    </div>
                  </div>

                  {/* Altura */}
                  <div className="bg-[#F5F5F7] p-3 rounded-xl border border-black/5">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-semibold text-slate-600">Altura (Height)</span>
                      <span className="font-mono font-bold text-[#0071E3]">{manualHole.height}px</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max={(config.height || 1920) - manualHole.y}
                      value={manualHole.height}
                      onChange={(e) => {
                        const h = parseInt(e.target.value);
                        setManualHole(prev => ({ ...prev, height: h }));
                      }}
                      className="w-full cursor-pointer accent-[#0071E3]"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                      <span>50px</span>
                      <span>{(config.height || 1920) - manualHole.y}px</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 mt-6 pt-4 border-t border-slate-100">
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

          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
