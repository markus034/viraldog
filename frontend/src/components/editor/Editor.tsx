import React, { useState, useEffect, useRef } from 'react';
import { Film, Settings, RefreshCw, FlipHorizontal, Type, Image as ImageIcon, Music, Save, PanelTop, AlignLeft, AlignCenter, AlignRight, ChevronDown, RotateCcw, MoreHorizontal, Trash2 } from 'lucide-react';
import { API_BASE_URL } from '../../config';
import { VideoJob, TemplateConfig, BoundingBox, TextOverlayConfig, ImageOverlayConfig } from './types';
import TemplateCard from './components/TemplateCard';
import VideoDropzone from './components/VideoDropzone';
import VideoGrid from './components/VideoGrid';
import CropModal from './components/CropModal';
import CustomSelect from '../CustomSelect';
import { ColorPickerPopover } from './components/ColorPickerPopover';
import './editor.css';

const FONT_OPTIONS = [
  { label: 'Arial', value: 'Arial', fontFamily: 'Arial' },
  { label: 'Inter', value: 'Inter', fontFamily: 'Inter' },
  { label: 'Roboto', value: 'Roboto', fontFamily: 'Roboto' },
  { label: 'Anton', value: 'Anton', fontFamily: 'Anton' },
  { label: 'Wedges', value: 'Wedges', fontFamily: 'Wedges' },
  { label: 'Archivo Black', value: 'Archivo Black', fontFamily: 'Archivo Black' },
  { label: 'League Spartan', value: 'League Spartan', fontFamily: 'League Spartan' },
];

const FONT_SIZE_OPTIONS = Array.from({ length: 117 }, (_, i) => i + 4).map((sz) => ({
  value: sz,
  label: String(sz),
}));

export const transformText = (text: string, mode?: string) => {
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

interface EditorProps {
  triggerToast: (message: string, type?: string) => void;
}

export default function Editor({ triggerToast }: EditorProps) {
  const [template, setTemplate] = useState<TemplateConfig>({
    file: null,
    objectUrl: null,
    width: 0,
    height: 0,
    hole: null,
    hasAlpha: false,
  });

  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [calibratingJob, setCalibratingJob] = useState<VideoJob | null>(null);

  const [antiDuplicity, setAntiDuplicity] = useState({
    enabled: true,
    wipeMetadata: true,
    invisibleFilters: true,
    inaudibleAudioNoise: true,
    intensity: 60,
  });

  const [textOverlay, setTextOverlay] = useState<TextOverlayConfig>({
    enabled: false,
    text: '',
    position: 'bottom',
    positionX: 50,
    positionY: 85,
    align: 'center',
    size: 16,
    color: '#ffffff',
    bgColor: '',
    bgOpacity: 60,
    useShadow: false,
    shadowColor: '#000000',
    shadowOpacity: 80,
    shadowBlur: 7,
    shadowDistance: 6,
    shadowAngle: 45,
    bold: false,
    fontFamily: 'Arial',
    strokeEnabled: false,
    strokeColor: '#000000',
    strokeWidth: 3,
    caseMode: 'normal',
    letterSpacing: 0,
    lineSpacing: 0,
    widthPercent: 80,
  });

  const [caseDropdownOpen, setCaseDropdownOpen] = useState(false);
  const [spacingDropdownOpen, setSpacingDropdownOpen] = useState(false);
  const [alignDropdownOpen, setAlignDropdownOpen] = useState(false);
  const [activePicker, setActivePicker] = useState<'none' | 'fill' | 'stroke' | 'bg'>('none');
  const [activeSlider, setActiveSlider] = useState<'none' | 'strokeWidth' | 'bgOpacity'>('none');
  const [activeCustomPicker, setActiveCustomPicker] = useState<'none' | 'fill' | 'stroke' | 'bg' | 'shadow'>('none');

  const [imageOverlay, setImageOverlay] = useState<ImageOverlayConfig>({
    enabled: false,
    imageUrl: null,
    opacity: 100,
    positionX: 50,
    positionY: 50,
    scale: 25,
  });
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);

  const [musicOverlay, setMusicOverlay] = useState({
    enabled: false,
    fileName: '',
    objectUrl: null as string | null,
    startTime: 0,
    duration: 180,
  });

  const [keepTitle, setKeepTitle] = useState({
    enabled: false,
    heightPercent: 25,
  });

  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);

  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

  const togglePreviewAudio = () => {
    if (!previewAudioRef.current) return;
    if (isPreviewPlaying) {
      previewAudioRef.current.pause();
    } else {
      previewAudioRef.current.currentTime = musicOverlay.startTime;
      previewAudioRef.current.play().catch((err) => console.log('Error playing preview:', err));
    }
  };

  useEffect(() => {
    if (!musicOverlay.enabled || !musicOverlay.objectUrl) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        setIsPreviewPlaying(false);
      }
    }
  }, [musicOverlay.enabled, musicOverlay.objectUrl]);

  const handleWatermarkImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageOverlay(prev => ({ ...prev, imageUrl: url }));
      setWatermarkFile(file);
    }
  };

  const handleMusicFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const audioObj = new Audio(url);
      audioObj.addEventListener('loadedmetadata', () => {
        setMusicOverlay({
          enabled: true,
          fileName: file.name,
          objectUrl: url,
          duration: audioObj.duration || 180,
          startTime: 0,
        });
      });
    }
  };

  // Programmatically generate a premium dark template cutout on initial load
  useEffect(() => {
    const img = new Image();
    img.src = '/grid_studio.png';
    
    const generateCanvas = (useImage: boolean) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (useImage) {
        ctx.drawImage(img, 0, 0, 1080, 1920);
      } else {
        ctx.fillStyle = '#0f0f11';
        ctx.fillRect(0, 0, 1080, 1920);
      }

      const hX = 140;
      const hY = 240;
      const hW = 800;
      const hH = 1420;

      ctx.clearRect(hX, hY, hW, hH);

      ctx.strokeStyle = '#14b8a6';
      ctx.lineWidth = 6;
      ctx.strokeRect(hX, hY, hW, hH);

      ctx.fillStyle = '#f3f4f6';
      ctx.font = 'bold 38px system-ui, sans-serif';
      ctx.fillText('VIRALDOG GRID STUDIO', 140, 110);

      ctx.fillStyle = '#64748b';
      ctx.font = '22px monospace';
      ctx.fillText('OVERLAY TEMPLATE • BYPASS DETECTOR', 140, 160);

      ctx.fillStyle = '#18181b';
      ctx.fillRect(140, 1720, 800, 120);
      ctx.strokeStyle = '#27272a';
      ctx.strokeRect(140, 1720, 800, 120);

      ctx.fillStyle = '#14b8a6';
      ctx.beginPath();
      ctx.arc(190, 1780, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#e4e4e7';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText('VIRALDOG VIDEO SUITE', 220, 1788);

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], 'default_mobile_frame.png', { type: 'image/png' });
          const objectUrl = URL.createObjectURL(blob);
          setTemplate({
            file,
            objectUrl,
            width: 1080,
            height: 1920,
            hole: { x: hX, y: hY, width: hW, height: hH },
            hasAlpha: true,
          });
        }
      }, 'image/png');
    };

    img.onload = () => generateCanvas(true);
    img.onerror = () => generateCanvas(false);
  }, []);

  const handleJobsAdded = (addedJobs: VideoJob[]) => {
    setJobs((prev) => {
      const result = [...prev];
      // Fields that the user can modify and should never be overwritten by analysis updates
      const userFields = ['mirrored', 'videoScale', 'manualBbox', 'trimStart', 'trimEnd', 'keepTitle'] as const;
      
      for (const incoming of addedJobs) {
        const existingIdx = result.findIndex((j) => j.id === incoming.id);
        if (existingIdx >= 0) {
          const existing = result[existingIdx];
          const merged = { ...existing, ...incoming };
          // Preserve user-modified fields from existing state
          for (const field of userFields) {
            if (existing[field] !== undefined) {
              (merged as any)[field] = existing[field];
            }
          }
          result[existingIdx] = merged;
        } else {
          result.push(incoming);
        }
      }
      return result;
    });
  };

  const handleRemoveJob = (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const handleCalibrate = (job: VideoJob) => {
    setCalibratingJob(job);
  };

  const handleSaveCalibration = (bbox: BoundingBox, mirrored: boolean, videoScale: number, trimStart: number, trimEnd: number) => {
    if (calibratingJob) {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === calibratingJob.id
            ? {
                ...j,
                manualBbox: bbox,
                mode: 'manual',
                mirrored: mirrored,
                videoScale: videoScale,
                trimStart: trimStart,
                trimEnd: trimEnd,
                details: 'Calibração manual aplicada.',
              }
            : j
        )
      );
      setCalibratingJob(null);
    }
  };

  const handleToggleMirror = (id: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, mirrored: !j.mirrored } : j))
    );
  };

  const handleToggleKeepTitle = (id: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, keepTitle: !j.keepTitle } : j))
    );
  };


  // ---------------------------------------------------------------------------
  // handleSave: saves a single video via backend FFmpeg composition
  // ---------------------------------------------------------------------------
  const handleSave = async (job: VideoJob) => {
    try {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, status: 'salvando', progress: 5, details: 'Enviando arquivos...' }
            : j
        )
      );

      // Deceleration curve simulated progress (5% to 95%) while backend works
      let currentProgress = 5;
      const interval = setInterval(() => {
        currentProgress += (95 - currentProgress) * 0.12;
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? { ...j, progress: Math.round(currentProgress), details: 'Processando vídeo no servidor via FFmpeg...' }
              : j
          )
        );
      }, 700);

      const activeBbox = job.manualBbox ?? job.detectedBbox;
      const keepTitleEnabled = job.keepTitle ?? keepTitle.enabled;
      let finalBboxY = activeBbox?.y ?? 0;
      let finalBboxH = activeBbox?.height ?? job.videoHeight;

      if (keepTitleEnabled && activeBbox) {
        const extension = Math.round(activeBbox.height * (keepTitle.heightPercent / 100));
        finalBboxY = Math.max(0, activeBbox.y - extension);
        const heightDiff = activeBbox.y - finalBboxY;
        finalBboxH = activeBbox.height + heightDiff;
      }

      // Generate a nice output file name using sequence counter
      const tName = template.file?.name || 'template.png';
      const autoBase = generateNextVideoName(tName);
      const ext = job.file.name ? job.file.name.substring(job.file.name.lastIndexOf('.')) || '.mp4' : '.mp4';
      const finalFilename = autoBase + ext;

      const compParams = {
        bbox_x: activeBbox?.x ?? 0,
        bbox_y: finalBboxY,
        bbox_w: activeBbox?.width ?? job.videoWidth,
        bbox_h: finalBboxH,
        hole_x: template.hole?.x ?? 0,
        hole_y: template.hole?.y ?? 0,
        hole_w: template.hole?.width ?? template.width,
        hole_h: template.hole?.height ?? template.height,
        template_w: template.width || 1080,
        template_h: template.height || 1920,
        mirrored: !!job.mirrored,
        video_scale: job.videoScale ?? 100,
        trim_start: job.trimStart ?? 0.0,
        trim_end: job.trimEnd ?? job.duration,
        anti_duplicity: !!antiDuplicity.enabled,
        text_enabled: !!textOverlay.enabled,
        text_content: transformText(textOverlay.text, textOverlay.caseMode) || "",
        text_pos_x_pct: textOverlay.positionX ?? 50.0,
        text_pos_y_pct: textOverlay.positionY ?? 85.0,
        text_size: textOverlay.size ?? 16,
        text_color: textOverlay.color || "#ffffff",
        text_bold: !!textOverlay.bold,
        text_shadow: !!textOverlay.useShadow,
        text_shadow_color: textOverlay.shadowColor || '#000000',
        text_shadow_opacity: textOverlay.shadowOpacity ?? 80,
        text_shadow_blur: textOverlay.shadowBlur ?? 7,
        text_shadow_distance: textOverlay.shadowDistance ?? 6,
        text_shadow_angle: textOverlay.shadowAngle ?? 45,
        text_bg_color: textOverlay.bgColor || null,
        text_bg_opacity: textOverlay.bgOpacity ?? 60,
        text_font_family: textOverlay.fontFamily || 'Arial',
        text_align: textOverlay.align || 'center',
        text_stroke_enabled: !!textOverlay.strokeEnabled,
        text_stroke_color: textOverlay.strokeColor || "#000000",
        text_stroke_width: textOverlay.strokeWidth ?? 3,
        text_line_spacing: textOverlay.lineSpacing ?? 0,
        text_width_pct: textOverlay.widthPercent ?? 80,
        watermark_opacity: imageOverlay.opacity ?? 100,
        watermark_pos_x_pct: imageOverlay.positionX ?? 50,
        watermark_pos_y_pct: imageOverlay.positionY ?? 50,
        watermark_scale_pct: imageOverlay.scale ?? 25,
        filename: finalFilename,
        template_name: tName,
      };

      const formData = new FormData();
      formData.append('video', job.file);
      if (template.file) {
        formData.append('template', template.file);
      }
      if (imageOverlay.enabled && watermarkFile) {
        formData.append('watermark', watermarkFile);
      }
      formData.append('params', JSON.stringify(compParams));

      const res = await fetch(`${API_BASE_URL}/api/editor/compose-and-save`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(interval);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Erro desconhecido' }));
        throw new Error(err.detail || 'Falha na renderização do servidor.');
      }

      const result = await res.json();

      triggerToast(`Vídeo salvo com sucesso: ${result.filename}`, 'success');

      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, status: 'salvo', name: result.filename || finalFilename, progress: 100, details: `Salvo em: ${result.folder}` }
            : j
        )
      );
    } catch (err: any) {
      triggerToast('Erro: ' + err.message, 'error');
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, status: 'falhou', progress: 0, details: `Erro ao salvar: ${err.message}` }
            : j
        )
      );
      throw err;
    }
  };

  // ---------------------------------------------------------------------------
  // handleSaveAll: saves all ready videos sequentially
  // ---------------------------------------------------------------------------
  const handleSaveAll = async () => {
    const candidates = jobs.filter((j) => j.status !== 'detectando' && j.status !== 'falhou');
    if (candidates.length === 0) {
      triggerToast('Nenhum vídeo disponível para salvar.', 'error');
      return;
    }

    triggerToast(`Iniciando processamento em lote de ${candidates.length} vídeo(s)...`, 'info');

    for (const job of candidates) {
      try {
        await handleSave(job);
      } catch (err) {
        console.error(`Falha ao processar job ${job.name}:`, err);
      }
    }

    triggerToast('Lote processado por completo!', 'success');
  };

  const generateNextVideoName = (templateFileName: string): string => {
    let baseName = templateFileName
      ? templateFileName.replace(/\.[^/.]+$/, "")
      : "template";
    
    baseName = baseName.trim();

    try {
      const stored = localStorage.getItem('auto_dark_template_sequences');
      const sequences = stored ? JSON.parse(stored) : {};
      
      const lastNum = sequences[baseName] || 0;
      const nextNum = lastNum + 1;
      
      sequences[baseName] = nextNum;
      localStorage.setItem('auto_dark_template_sequences', JSON.stringify(sequences));
      
      const formattedNum = String(nextNum).padStart(3, '0');
      return `${baseName}${formattedNum}`;
    } catch (e) {
      console.error('Failed to read/write template sequence in localStorage:', e);
      return `${baseName}001`;
    }
  };

  const totalJobs = jobs.length;
  const completedJobs = jobs.filter((j) => j.status === 'concluído' || j.status === 'salvo' || j.status === 'na fila').length;
  const renderizandoJobs = jobs.filter((j) => j.status === 'salvando').length;

  return (
    <div className="editor-container bg-[#F5F5F7] text-[#1D1D1F] flex flex-col font-sans selection:bg-[#0071E3]/10 selection:text-[#0071E3]">
      
      {/* Main Studio Console Layout */}
      <main className="flex-grow p-3 sm:p-4 w-full flex flex-col xl:flex-row gap-4 sm:gap-6">
        
        {/* Left Column: Calibration & Setup Controls */}
        <div className="w-full xl:w-72 flex flex-col gap-4 sm:gap-5 flex-shrink-0">
          
          {/* Template Card Component */}
          <TemplateCard config={template} onChange={setTemplate} />

          {/* Video Dropzone Component */}
          <VideoDropzone jobs={jobs} onJobsAdded={handleJobsAdded} onAutoRender={() => {}} />

          {/* Opção de Adicionar Texto nos Vídeos */}
          <div className="apple-card rounded-2xl p-6 flex flex-col gap-4 text-[#1D1D1F]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-[#0071E3]" />
                <h3 className="font-semibold text-xs tracking-[0.15em] text-[#86868B] uppercase">
                  Adicionar Texto
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTextOverlay((prev) => ({ ...prev, enabled: !prev.enabled }));
                }}
                className={`px-2 py-1 rounded-full text-[8px] font-bold tracking-wider font-mono uppercase transition-all duration-300 cursor-pointer ${
                  textOverlay.enabled
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-[#86868B]/10 text-[#86868B] hover:bg-[#86868B]/20'
                }`}
              >
                {textOverlay.enabled ? 'ATIVADO' : 'DESATIVADO'}
              </button>
            </div>

            {textOverlay.enabled ? (
              <div className="flex flex-col gap-3.5 text-xs">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="overlay-text-input" className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">
                    Texto do Vídeo
                  </label>
                  <div className="flex flex-col rounded-xl border border-slate-200 shadow-sm bg-white relative z-10">
                    <textarea
                      id="overlay-text-input"
                      value={textOverlay.text}
                      onChange={(e) => setTextOverlay((prev) => ({ ...prev, text: e.target.value }))}
                      placeholder="Digite seu texto, cupom ou @usuário..."
                      className="w-full h-20 px-3 py-2 bg-white text-slate-850 border-0 text-xs outline-none resize-none focus:ring-0 placeholder-slate-400 font-medium rounded-t-xl"
                    />
                    <div className="flex gap-2 p-2 bg-slate-50 border-t border-slate-200 w-full items-center rounded-b-xl relative z-10">
                      {/* Font Dropdown */}
                      <div className="relative flex-grow min-w-[120px]">
                        <CustomSelect
                          options={FONT_OPTIONS}
                          value={textOverlay.fontFamily || 'Arial'}
                          onChange={(val) => setTextOverlay((prev) => ({ ...prev, fontFamily: val }))}
                          size="sm"
                        />
                      </div>

                      {/* Size Dropdown */}
                      <div className="w-20 shrink-0">
                        <CustomSelect
                          options={FONT_SIZE_OPTIONS}
                          value={textOverlay.size}
                          onChange={(val) => setTextOverlay((prev) => ({ ...prev, size: Number(val) }))}
                          size="sm"
                          align="right"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Formatting Toolbar Row (N, Alignment, Case, Spacing) */}
                <div className="flex gap-2 mt-3 pt-3 border-t border-black/5 items-center">
                  {/* Negrito Button */}
                  <button
                    type="button"
                    onClick={() => setTextOverlay((prev) => ({ ...prev, bold: !prev.bold }))}
                    className={`w-[32px] h-[29px] rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer transition-all border ${
                      textOverlay.bold
                        ? 'bg-[#0071E3] text-white border-[#0071E3]'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                    title="Negrito"
                  >
                    N
                  </button>

                  {/* Alinhamento Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setAlignDropdownOpen(!alignDropdownOpen);
                        setCaseDropdownOpen(false);
                        setSpacingDropdownOpen(false);
                      }}
                      className={`w-[32px] h-[29px] rounded-lg flex items-center justify-center cursor-pointer transition-all border ${
                        alignDropdownOpen
                          ? 'bg-[#0071E3] text-white border-[#0071E3]'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                      title="Mudar Alinhamento"
                    >
                      {(() => {
                        const activeAlign = textOverlay.align || 'center';
                        if (activeAlign === 'left') return <AlignLeft className="w-3.5 h-3.5" />;
                        if (activeAlign === 'right') return <AlignRight className="w-3.5 h-3.5" />;
                        return <AlignCenter className="w-3.5 h-3.5" />;
                      })()}
                    </button>

                    {alignDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setAlignDropdownOpen(false)} />
                        <div className="absolute left-0 top-10 bg-white/95 backdrop-blur-xl text-[#1D1D1F] rounded-2xl shadow-2xl border border-[#E8E8EA] p-1.5 w-36 z-50 flex flex-col text-xs gap-0.5 animate-in fade-in zoom-in-95 duration-150">
                          {[
                            { value: 'left', icon: AlignLeft, label: 'Esquerda' },
                            { value: 'center', icon: AlignCenter, label: 'Centro' },
                            { value: 'right', icon: AlignRight, label: 'Direita' }
                          ].map((opt) => {
                            const Icon = opt.icon;
                            const active = (textOverlay.align || 'center') === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  setTextOverlay((prev) => ({ ...prev, align: opt.value as any }));
                                  setAlignDropdownOpen(false);
                                }}
                                className={`px-3 py-2 text-left rounded-xl transition-all cursor-pointer flex items-center gap-2.5 font-medium ${
                                  active
                                    ? 'text-[#0071E3] font-bold bg-[#F5F5F7]'
                                    : 'text-[#1D1D1F] hover:text-[#0071E3] hover:bg-[#F5F5F7]'
                                }`}
                              >
                                <Icon className="w-4 h-4 shrink-0" />
                                <span>{opt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Capitalização Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setCaseDropdownOpen(!caseDropdownOpen);
                        setAlignDropdownOpen(false);
                        setSpacingDropdownOpen(false);
                      }}
                      className={`w-[32px] h-[29px] rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer transition-all border ${
                        caseDropdownOpen
                          ? 'bg-[#0071E3] text-white border-[#0071E3]'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                      title="Mudar Capitalização"
                    >
                      Aa
                    </button>

                    {caseDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setCaseDropdownOpen(false)} />
                        <div className="absolute left-0 top-10 bg-white/95 backdrop-blur-xl text-[#1D1D1F] rounded-2xl shadow-2xl border border-[#E8E8EA] py-2 px-1 w-48 z-50 flex flex-col text-xs gap-0.5 animate-in fade-in zoom-in-95 duration-150">
                          <span className="px-3 py-1 text-[9px] font-bold text-[#86868B] uppercase tracking-wider border-b border-[#E8E8EA] mb-1">
                            CHANGE CASE
                          </span>
                          {[
                            { value: 'sentence', label: 'Capitalização da frase' },
                            { value: 'lower', label: 'Letras minúsculas' },
                            { value: 'upper', label: 'Maiúsculas' },
                            { value: 'title', label: 'Capitalização de título' },
                            { value: 'normal', label: 'Original' }
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                  setTextOverlay((prev) => ({ ...prev, caseMode: opt.value as any }));
                                  setCaseDropdownOpen(false);
                              }}
                              className={`px-3 py-1.5 text-left rounded-xl transition-all cursor-pointer font-medium ${
                                (textOverlay.caseMode || 'normal') === opt.value
                                  ? 'text-[#0071E3] font-bold bg-[#F5F5F7]'
                                  : 'text-[#1D1D1F] hover:text-[#0071E3] hover:bg-[#F5F5F7]'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Espaçamento Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setSpacingDropdownOpen(!spacingDropdownOpen);
                        setAlignDropdownOpen(false);
                        setCaseDropdownOpen(false);
                      }}
                      className={`w-[32px] h-[29px] rounded-lg flex items-center justify-center cursor-pointer transition-all border ${
                        spacingDropdownOpen
                          ? 'bg-[#0071E3] text-white border-[#0071E3]'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                      title="Ajustar Espaçamento"
                    >
                      <svg stroke="currentColor" fill="none" strokeWidth="2.5" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 8h12M4 12h12M4 16h12M20 6v12M17 9l3-3 3 3M17 15l3 3 3-3" />
                      </svg>
                    </button>

                    {spacingDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setSpacingDropdownOpen(false)} />
                        <div className="absolute left-[-100px] top-10 bg-white/95 backdrop-blur-xl text-[#1D1D1F] rounded-2xl shadow-2xl border border-[#E8E8EA] p-3.5 w-56 z-50 flex flex-col gap-3.5 text-xs animate-in fade-in zoom-in-95 duration-150">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between items-center text-xs font-semibold text-[#1D1D1F]">
                              <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Caractere</span>
                              <span className="bg-white px-2 py-0.5 rounded-md border border-[#E8E8EA] text-[#0071E3] font-mono text-[11px] font-bold shadow-2xs min-w-[28px] text-center">{textOverlay.letterSpacing ?? 0}</span>
                            </div>
                            <input
                              type="range"
                              min="-5"
                              max="20"
                              value={textOverlay.letterSpacing ?? 0}
                              onChange={(e) => setTextOverlay((prev) => ({ ...prev, letterSpacing: parseInt(e.target.value) }))}
                              className="w-full cursor-pointer accent-[#0071E3] h-1.5 bg-[#E8E8EA] rounded-lg appearance-none transition-all"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between items-center text-xs font-semibold text-[#1D1D1F]">
                              <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Linha</span>
                              <span className="bg-white px-2 py-0.5 rounded-md border border-[#E8E8EA] text-[#0071E3] font-mono text-[11px] font-bold shadow-2xs min-w-[28px] text-center">{textOverlay.lineSpacing ?? 0}</span>
                            </div>
                            <input
                              type="range"
                              min="-10"
                              max="50"
                              value={textOverlay.lineSpacing ?? 0}
                              onChange={(e) => setTextOverlay((prev) => ({ ...prev, lineSpacing: parseInt(e.target.value) }))}
                              className="w-full cursor-pointer accent-[#0071E3] h-1.5 bg-[#E8E8EA] rounded-lg appearance-none transition-all"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Estilo unified section */}
                <div className="flex flex-col gap-2.5 border-t border-black/5 pt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Estilo</span>
                    <button
                      type="button"
                      onClick={() => {
                        setTextOverlay((prev) => ({
                          ...prev,
                          color: '#ffffff',
                          strokeEnabled: false,
                          strokeColor: '#000000',
                          strokeWidth: 3,
                          bgColor: '',
                          bgOpacity: 60,
                          useShadow: false,
                          bold: false,
                        }));
                        setActivePicker('none');
                        setActiveSlider('none');
                      }}
                      className="text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                      title="Redefinir Estilo"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Texto Row */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs text-slate-600 font-medium">Texto</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActivePicker(activePicker === 'fill' ? 'none' : 'fill');
                            setActiveSlider('none');
                          }}
                          className="w-6 h-6 rounded border border-slate-350 shadow-sm transition-all hover:scale-105 cursor-pointer relative overflow-hidden flex items-center justify-center"
                          style={{ backgroundColor: textOverlay.color }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const isOpening = activeSlider !== 'textOpacity';
                            setActiveSlider(isOpening ? 'textOpacity' : 'none');
                            setActivePicker('none');
                          }}
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                            activeSlider === 'textOpacity'
                              ? 'bg-[#0071E3] text-white shadow-xs'
                              : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7]'
                          }`}
                          title="Ajustar opacidade"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {activePicker === 'fill' && (
                      <div className="flex items-center justify-between p-2.5 bg-[#F5F5F7] rounded-xl border border-[#E8E8EA] shadow-xs mt-1.5">
                        {[
                          { hex: '#ffffff', label: 'Branco' }, { hex: '#fef08a', label: 'Amarelo' },
                          { hex: '#4ade80', label: 'Verde' }, { hex: '#38bdf8', label: 'Azul' },
                          { hex: '#f87171', label: 'Vermelho' }, { hex: '#000000', label: 'Preto' },
                        ].map((c) => (
                          <button
                            key={c.hex}
                            type="button"
                            onClick={() => setTextOverlay((prev) => ({ ...prev, color: c.hex }))}
                            className={`w-6 h-6 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                              textOverlay.color === c.hex ? 'ring-2 ring-[#0071E3] scale-110 border-white shadow-xs' : 'border-black/10 hover:scale-105'
                            }`}
                            style={{ backgroundColor: c.hex }}
                            title={c.label}
                          >
                            {textOverlay.color === c.hex && (
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.hex === '#ffffff' ? '#000000' : '#ffffff' }} />
                            )}
                          </button>
                        ))}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setActiveCustomPicker(activeCustomPicker === 'fill' ? 'none' : 'fill')}
                            className={`w-6 h-6 rounded-full border transition-all cursor-pointer flex items-center justify-center relative overflow-hidden shadow-2xs ${
                              activeCustomPicker === 'fill' ? 'ring-2 ring-[#0071E3] scale-110' : 'border-black/10 hover:scale-110'
                            }`}
                            style={{ background: 'conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red)' }}
                            title="Cor personalizada"
                          />
                          {activeCustomPicker === 'fill' && (
                            <ColorPickerPopover
                              color={textOverlay.color || '#ffffff'}
                              onChange={(newColor) => setTextOverlay((prev) => ({ ...prev, color: newColor }))}
                              onClose={() => setActiveCustomPicker('none')}
                            />
                          )}
                        </div>
                      </div>
                    )}
                    {activeSlider === 'textOpacity' && (
                      <div className="bg-[#F5F5F7] p-3 rounded-xl border border-[#E8E8EA] shadow-xs mt-1.5 flex flex-col gap-2">
                        <div className="flex justify-between items-center text-xs font-semibold text-[#1D1D1F]">
                          <span>Opacidade do Texto</span>
                          <span className="bg-white px-2 py-0.5 rounded-md border border-[#E8E8EA] text-[#0071E3] font-mono text-[11px] font-bold shadow-2xs min-w-[42px] text-center">{textOverlay.opacity ?? 100}%</span>
                        </div>
                        <input
                          type="range" min="0" max="100" value={textOverlay.opacity ?? 100}
                          onChange={(e) => setTextOverlay((prev) => ({ ...prev, opacity: parseInt(e.target.value) }))}
                          className="w-full cursor-pointer accent-[#0071E3] h-1.5 bg-[#E8E8EA] rounded-lg appearance-none transition-all"
                        />
                      </div>
                    )}
                  </div>

                  {/* Borda Row */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs text-slate-600 font-medium">Borda</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const isEnabled = !textOverlay.strokeEnabled;
                            setTextOverlay((prev) => ({ ...prev, strokeEnabled: isEnabled, strokeColor: prev.strokeColor || '#000000' }));
                            setActivePicker(isEnabled ? 'stroke' : 'none');
                            setActiveSlider('none');
                          }}
                          className="w-6 h-6 rounded border border-slate-350 shadow-sm transition-all hover:scale-105 cursor-pointer relative overflow-hidden flex items-center justify-center bg-transparent"
                          style={{ backgroundColor: textOverlay.strokeEnabled ? textOverlay.strokeColor || '#000000' : 'transparent' }}
                        >
                          {!textOverlay.strokeEnabled && (
                            <svg className="w-full h-full stroke-slate-500/85 stroke-[1.5]" viewBox="0 0 24 24" fill="none">
                              <line x1="2" y1="22" x2="22" y2="2" />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const isOpening = activeSlider !== 'strokeWidth';
                            setActiveSlider(isOpening ? 'strokeWidth' : 'none');
                            if (isOpening && !textOverlay.strokeEnabled) {
                              setTextOverlay((prev) => ({ ...prev, strokeEnabled: true, strokeColor: prev.strokeColor || '#000000' }));
                            }
                            setActivePicker('none');
                          }}
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                            activeSlider === 'strokeWidth'
                              ? 'bg-[#0071E3] text-white shadow-xs'
                              : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7]'
                          }`}
                          title="Ajustar espessura"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {activePicker === 'stroke' && textOverlay.strokeEnabled && (
                      <div className="flex items-center justify-between p-2.5 bg-[#F5F5F7] rounded-xl border border-[#E8E8EA] shadow-xs mt-1.5">
                        {[
                          { hex: '#ffffff', label: 'Branco' }, { hex: '#fef08a', label: 'Amarelo' },
                          { hex: '#4ade80', label: 'Verde' }, { hex: '#38bdf8', label: 'Azul' },
                          { hex: '#f87171', label: 'Vermelho' }, { hex: '#000000', label: 'Preto' },
                        ].map((stC) => (
                          <button
                            key={stC.hex}
                            type="button"
                            onClick={() => setTextOverlay((prev) => ({ ...prev, strokeColor: stC.hex }))}
                            className={`w-6 h-6 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                              textOverlay.strokeColor === stC.hex ? 'ring-2 ring-[#0071E3] scale-110 border-white shadow-xs' : 'border-black/10 hover:scale-105'
                            }`}
                            style={{ backgroundColor: stC.hex }}
                            title={stC.label}
                          >
                            {textOverlay.strokeColor === stC.hex && (
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stC.hex === '#ffffff' ? '#000000' : '#ffffff' }} />
                            )}
                          </button>
                        ))}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setActiveCustomPicker(activeCustomPicker === 'stroke' ? 'none' : 'stroke')}
                            className={`w-6 h-6 rounded-full border transition-all cursor-pointer flex items-center justify-center relative overflow-hidden shadow-2xs ${
                              activeCustomPicker === 'stroke' ? 'ring-2 ring-[#0071E3] scale-110' : 'border-black/10 hover:scale-110'
                            }`}
                            style={{ background: 'conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red)' }}
                            title="Cor personalizada"
                          />
                          {activeCustomPicker === 'stroke' && (
                            <ColorPickerPopover
                              color={textOverlay.strokeColor || '#000000'}
                              onChange={(newColor) => setTextOverlay((prev) => ({ ...prev, strokeColor: newColor }))}
                              onClose={() => setActiveCustomPicker('none')}
                            />
                          )}
                        </div>
                      </div>
                    )}
                    {activeSlider === 'strokeWidth' && (
                      <div className="bg-[#F5F5F7] p-3 rounded-xl border border-[#E8E8EA] shadow-xs mt-1.5 flex flex-col gap-2">
                        <div className="flex justify-between items-center text-xs font-semibold text-[#1D1D1F]">
                          <span>Espessura da Borda</span>
                          <span className="bg-white px-2 py-0.5 rounded-md border border-[#E8E8EA] text-[#0071E3] font-mono text-[11px] font-bold shadow-2xs min-w-[36px] text-center">{textOverlay.strokeWidth}px</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          value={textOverlay.strokeWidth}
                          onChange={(e) => setTextOverlay((prev) => ({ ...prev, strokeWidth: parseInt(e.target.value) }))}
                          className="w-full cursor-pointer accent-[#0071E3] h-1.5 bg-[#E8E8EA] rounded-lg appearance-none transition-all"
                        />
                      </div>
                    )}
                  </div>

                  {/* Fundo Row */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs text-slate-600 font-medium">Fundo</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const isEnabled = !textOverlay.bgColor;
                            setTextOverlay((prev) => ({ ...prev, bgColor: isEnabled ? '#000000' : '' }));
                            setActivePicker(isEnabled ? 'bg' : 'none');
                            setActiveSlider('none');
                          }}
                          className="w-6 h-6 rounded border border-slate-350 shadow-sm transition-all hover:scale-105 cursor-pointer relative overflow-hidden flex items-center justify-center bg-transparent"
                          style={{ backgroundColor: textOverlay.bgColor || 'transparent' }}
                        >
                          {!textOverlay.bgColor && (
                            <svg className="w-full h-full stroke-slate-500/85 stroke-[1.5]" viewBox="0 0 24 24" fill="none">
                              <line x1="2" y1="22" x2="22" y2="2" />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const isOpening = activeSlider !== 'bgOpacity';
                            setActiveSlider(isOpening ? 'bgOpacity' : 'none');
                            if (isOpening && !textOverlay.bgColor) {
                              setTextOverlay((prev) => ({ ...prev, bgColor: '#000000', bgOpacity: prev.bgOpacity ?? 60 }));
                            }
                            setActivePicker('none');
                          }}
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                            activeSlider === 'bgOpacity'
                              ? 'bg-[#0071E3] text-white shadow-xs'
                              : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7]'
                          }`}
                          title="Ajustar opacidade"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {activePicker === 'bg' && textOverlay.bgColor && (
                      <div className="flex items-center justify-between p-2.5 bg-[#F5F5F7] rounded-xl border border-[#E8E8EA] shadow-xs mt-1.5">
                        {[
                          { hex: '#ffffff', label: 'Branco' }, { hex: '#fef08a', label: 'Amarelo' },
                          { hex: '#4ade80', label: 'Verde' }, { hex: '#38bdf8', label: 'Azul' },
                          { hex: '#f87171', label: 'Vermelho' }, { hex: '#000000', label: 'Preto' },
                        ].map((bgC) => (
                          <button
                            key={bgC.hex}
                            type="button"
                            onClick={() => setTextOverlay((prev) => ({ ...prev, bgColor: bgC.hex }))}
                            className={`w-6 h-6 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                              textOverlay.bgColor === bgC.hex ? 'ring-2 ring-[#0071E3] scale-110 border-white shadow-xs' : 'border-black/10 hover:scale-105'
                            }`}
                            style={{ backgroundColor: bgC.hex }}
                            title={bgC.label}
                          >
                            {textOverlay.bgColor === bgC.hex && (
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: bgC.hex === '#ffffff' ? '#000000' : '#ffffff' }} />
                            )}
                          </button>
                        ))}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setActiveCustomPicker(activeCustomPicker === 'bg' ? 'none' : 'bg')}
                            className={`w-6 h-6 rounded-full border transition-all cursor-pointer flex items-center justify-center relative overflow-hidden shadow-2xs ${
                              activeCustomPicker === 'bg' ? 'ring-2 ring-[#0071E3] scale-110' : 'border-black/10 hover:scale-110'
                            }`}
                            style={{ background: 'conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red)' }}
                            title="Cor personalizada"
                          />
                          {activeCustomPicker === 'bg' && (
                            <ColorPickerPopover
                              color={textOverlay.bgColor || '#000000'}
                              onChange={(newColor) => setTextOverlay((prev) => ({ ...prev, bgColor: newColor }))}
                              onClose={() => setActiveCustomPicker('none')}
                            />
                          )}
                        </div>
                      </div>
                    )}
                    {activeSlider === 'bgOpacity' && (
                      <div className="bg-[#F5F5F7] p-3 rounded-xl border border-[#E8E8EA] shadow-xs mt-1.5 flex flex-col gap-2">
                        <div className="flex justify-between items-center text-xs font-semibold text-[#1D1D1F]">
                          <span>Opacidade do Fundo</span>
                          <span className="bg-white px-2 py-0.5 rounded-md border border-[#E8E8EA] text-[#0071E3] font-mono text-[11px] font-bold shadow-2xs min-w-[42px] text-center">{textOverlay.bgOpacity}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={textOverlay.bgOpacity}
                          onChange={(e) => setTextOverlay((prev) => ({ ...prev, bgOpacity: parseInt(e.target.value) }))}
                          className="w-full cursor-pointer accent-[#0071E3] h-1.5 bg-[#E8E8EA] rounded-lg appearance-none transition-all"
                        />
                      </div>
                    )}
                  </div>

                  {/* Sombra Row */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs text-slate-600 font-medium">Sombra</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const isEnabled = !textOverlay.useShadow;
                            setTextOverlay((prev) => ({ ...prev, useShadow: isEnabled, shadowColor: prev.shadowColor || '#000000' }));
                            setActivePicker(isEnabled ? 'shadow' : 'none');
                            setActiveSlider('none');
                          }}
                          className="w-6 h-6 rounded border border-slate-350 shadow-sm transition-all hover:scale-105 cursor-pointer relative overflow-hidden flex items-center justify-center bg-transparent"
                          style={{ backgroundColor: textOverlay.useShadow ? textOverlay.shadowColor || '#000000' : 'transparent' }}
                        >
                          {!textOverlay.useShadow && (
                            <svg className="w-full h-full stroke-slate-500/85 stroke-[1.5]" viewBox="0 0 24 24" fill="none">
                              <line x1="2" y1="22" x2="22" y2="2" />
                            </svg>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const isOpening = activeSlider !== 'shadowConfig';
                            setActiveSlider(isOpening ? 'shadowConfig' : 'none');
                            if (isOpening && !textOverlay.useShadow) {
                              setTextOverlay((prev) => ({ ...prev, useShadow: true, shadowColor: prev.shadowColor || '#000000' }));
                            }
                            setActivePicker('none');
                          }}
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                            activeSlider === 'shadowConfig'
                              ? 'bg-[#0071E3] text-white shadow-xs'
                              : 'text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7]'
                          }`}
                          title="Ajustar sombra"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {activePicker === 'shadow' && textOverlay.useShadow && (
                      <div className="flex items-center justify-between p-2.5 bg-[#F5F5F7] rounded-xl border border-[#E8E8EA] shadow-xs mt-1.5">
                        {[
                          { hex: '#ffffff', label: 'Branco' }, { hex: '#fef08a', label: 'Amarelo' },
                          { hex: '#4ade80', label: 'Verde' }, { hex: '#38bdf8', label: 'Azul' },
                          { hex: '#f87171', label: 'Vermelho' }, { hex: '#000000', label: 'Preto' },
                        ].map((shC) => (
                          <button
                            key={shC.hex}
                            type="button"
                            onClick={() => setTextOverlay((prev) => ({ ...prev, shadowColor: shC.hex }))}
                            className={`w-6 h-6 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                              textOverlay.shadowColor === shC.hex ? 'ring-2 ring-[#0071E3] scale-110 border-white shadow-xs' : 'border-black/10 hover:scale-105'
                            }`}
                            style={{ backgroundColor: shC.hex }}
                            title={shC.label}
                          >
                            {textOverlay.shadowColor === shC.hex && (
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: shC.hex === '#ffffff' ? '#000000' : '#ffffff' }} />
                            )}
                          </button>
                        ))}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setActiveCustomPicker(activeCustomPicker === 'shadow' ? 'none' : 'shadow')}
                            className={`w-6 h-6 rounded-full border transition-all cursor-pointer flex items-center justify-center relative overflow-hidden shadow-2xs ${
                              activeCustomPicker === 'shadow' ? 'ring-2 ring-[#0071E3] scale-110' : 'border-black/10 hover:scale-110'
                            }`}
                            style={{ background: 'conic-gradient(from 0deg, red, yellow, lime, aqua, blue, magenta, red)' }}
                            title="Cor personalizada"
                          />
                          {activeCustomPicker === 'shadow' && (
                            <ColorPickerPopover
                              color={textOverlay.shadowColor || '#000000'}
                              onChange={(newColor) => setTextOverlay((prev) => ({ ...prev, shadowColor: newColor }))}
                              onClose={() => setActiveCustomPicker('none')}
                            />
                          )}
                        </div>
                      </div>
                    )}
                    {activeSlider === 'shadowConfig' && (
                      <div className="bg-[#F5F5F7] p-3.5 rounded-xl border border-[#E8E8EA] shadow-xs mt-1.5 flex flex-col gap-3.5 text-[#1D1D1F]">
                        {/* Opacity slider */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between items-center text-xs font-semibold text-[#1D1D1F]">
                            <span>Opacidade</span>
                            <span className="bg-white px-2 py-0.5 rounded-md border border-[#E8E8EA] text-[#0071E3] font-mono text-[11px] font-bold shadow-2xs min-w-[42px] text-center">
                              {textOverlay.shadowOpacity}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={textOverlay.shadowOpacity ?? 80}
                            onChange={(e) => setTextOverlay((prev) => ({ ...prev, shadowOpacity: parseInt(e.target.value) }))}
                            className="w-full cursor-pointer accent-[#0071E3] h-1.5 bg-[#E8E8EA] rounded-lg appearance-none transition-all"
                          />
                        </div>

                        {/* Blur (Desfocar) slider */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between items-center text-xs font-semibold text-[#1D1D1F]">
                            <span>Desfocar</span>
                            <span className="bg-white px-2 py-0.5 rounded-md border border-[#E8E8EA] text-[#0071E3] font-mono text-[11px] font-bold shadow-2xs min-w-[42px] text-center">
                              {textOverlay.shadowBlur ?? 7}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="20"
                            value={textOverlay.shadowBlur ?? 7}
                            onChange={(e) => setTextOverlay((prev) => ({ ...prev, shadowBlur: parseInt(e.target.value) }))}
                            className="w-full cursor-pointer accent-[#0071E3] h-1.5 bg-[#E8E8EA] rounded-lg appearance-none transition-all"
                          />
                        </div>

                        {/* Distance slider */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between items-center text-xs font-semibold text-[#1D1D1F]">
                            <span>Distância</span>
                            <span className="bg-white px-2 py-0.5 rounded-md border border-[#E8E8EA] text-[#0071E3] font-mono text-[11px] font-bold shadow-2xs min-w-[42px] text-center">
                              {textOverlay.shadowDistance ?? 6}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="30"
                            value={textOverlay.shadowDistance ?? 6}
                            onChange={(e) => setTextOverlay((prev) => ({ ...prev, shadowDistance: parseInt(e.target.value) }))}
                            className="w-full cursor-pointer accent-[#0071E3] h-1.5 bg-[#E8E8EA] rounded-lg appearance-none transition-all"
                          />
                        </div>

                        {/* Angle slider */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between items-center text-xs font-semibold text-[#1D1D1F]">
                            <span>Ângulo</span>
                            <span className="bg-white px-2 py-0.5 rounded-md border border-[#E8E8EA] text-[#0071E3] font-mono text-[11px] font-bold shadow-2xs min-w-[42px] text-center">
                              {textOverlay.shadowAngle ?? 45}°
                            </span>
                          </div>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={textOverlay.shadowAngle ?? 45}
                            onChange={(e) => setTextOverlay((prev) => ({ ...prev, shadowAngle: parseInt(e.target.value) }))}
                            className="w-full cursor-pointer accent-[#0071E3] h-1.5 bg-[#E8E8EA] rounded-lg appearance-none transition-all"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Opção de Adicionar Imagem / Marca d'água nos Vídeos */}
          <div className="apple-card rounded-2xl p-6 flex flex-col gap-4 text-[#1D1D1F]">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#0071E3]" />
                <h3 className="font-semibold text-xs tracking-[0.15em] text-[#86868B] uppercase">Adicionar Imagem</h3>
              </div>
              <button type="button" onClick={() => setImageOverlay((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`px-2 py-1 rounded-full text-[8px] font-bold tracking-wider font-mono uppercase transition-all duration-300 cursor-pointer ${
                  imageOverlay.enabled ? 'bg-emerald-500 text-white shadow-sm' : 'bg-[#86868B]/10 text-[#86868B] hover:bg-[#86868B]/20'
                }`}>{imageOverlay.enabled ? 'ATIVADO' : 'DESATIVADO'}</button>
            </div>

            {imageOverlay.enabled ? (
              <div className="flex flex-col gap-3.5 text-xs">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Imagem da Marca d'água / Logo</span>
                  {imageOverlay.imageUrl ? (
                    <div className="relative group rounded-lg overflow-hidden border border-black/10 bg-[#F5F5F7] flex items-center justify-center p-3 h-24">
                      <img src={imageOverlay.imageUrl} alt="Watermark preview" className="max-h-full max-w-full object-contain" style={{ opacity: imageOverlay.opacity / 100 }} />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <label className="bg-white/90 hover:bg-white text-slate-950 font-bold text-[9px] px-2 py-1 rounded cursor-pointer transition-colors shadow-sm">
                          Alterar
                          <input type="file" accept="image/*" onChange={handleWatermarkImageChange} className="hidden" />
                        </label>
                        <button type="button" onClick={() => { setImageOverlay(prev => ({ ...prev, imageUrl: null })); setWatermarkFile(null); }}
                          className="bg-red-500/90 hover:bg-red-600 text-white font-bold text-[9px] px-2 py-1 rounded cursor-pointer transition-colors shadow-sm">Remover</button>
                      </div>
                    </div>
                  ) : (
                    <label className="border border-dashed border-black/20 hover:border-[#0071E3]/40 rounded-lg bg-[#F5F5F7] hover:bg-[#0071E3]/5 p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all h-24 text-center">
                      <ImageIcon className="w-5 h-5 text-[#86868B]" />
                      <span className="text-[10px] font-medium text-slate-600">Escolha uma imagem</span>
                      <span className="text-[8px] text-[#86868B] uppercase font-mono">PNG transparente recomendado</span>
                      <input type="file" accept="image/*" onChange={handleWatermarkImageChange} className="hidden" />
                    </label>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-[#86868B] uppercase tracking-wider">
                    <span>Opacidade da Imagem</span>
                    <span className="text-[#0071E3]">{imageOverlay.opacity}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={imageOverlay.opacity}
                    onChange={(e) => setImageOverlay((prev) => ({ ...prev, opacity: parseInt(e.target.value) }))}
                    className="w-full cursor-pointer accent-[#0071E3] mt-1" />
                </div>
              </div>
            ) : null}
          </div>

          {/* Opção de Adicionar Música / Trilha Sonora nos Vídeos */}
          <div className="apple-card rounded-2xl p-6 flex flex-col gap-4 text-[#1D1D1F]">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-[#0071E3]" />
                <h3 className="font-semibold text-xs tracking-[0.15em] text-[#86868B] uppercase">Adicionar Música</h3>
              </div>
              <button type="button" onClick={() => setMusicOverlay((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`px-2 py-1 rounded-full text-[8px] font-bold tracking-wider font-mono uppercase transition-all duration-300 cursor-pointer ${
                  musicOverlay.enabled ? 'bg-[#0071E3] text-white shadow-sm' : 'bg-[#86868B]/10 text-[#86868B] hover:bg-[#86868B]/20'
                }`}>{musicOverlay.enabled ? 'ATIVADO' : 'DESATIVADO'}</button>
            </div>

            {musicOverlay.enabled ? (
              <div className="flex flex-col gap-3.5 text-xs">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Arquivo de Áudio (Música)</span>
                  {musicOverlay.objectUrl ? (
                    <div className="relative group rounded-lg overflow-hidden border border-black/10 bg-[#F5F5F7] flex flex-col p-3 gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 truncate">
                          <Music className="w-4 h-4 text-[#0071E3] flex-shrink-0" />
                          <span className="font-mono text-[10px] text-slate-700 truncate" title={musicOverlay.fileName}>{musicOverlay.fileName}</span>
                        </div>
                        <button type="button" onClick={() => setMusicOverlay(prev => ({ ...prev, objectUrl: null, fileName: '' }))}
                          className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-bold text-[9px] px-2 py-1 rounded cursor-pointer transition-all border border-red-500/20">Remover</button>
                      </div>
                      <div className="text-[9px] text-[#86868B] font-mono uppercase flex justify-between">
                        <span>Duração Total:</span>
                        <span>{Math.floor(musicOverlay.duration / 60)}:{(Math.floor(musicOverlay.duration % 60) < 10 ? '0' : '')}{Math.floor(musicOverlay.duration % 60)}s</span>
                      </div>
                    </div>
                  ) : (
                    <label className="border border-dashed border-black/20 hover:border-[#0071E3]/40 rounded-lg bg-[#F5F5F7] hover:bg-[#0071E3]/5 p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all h-24 text-center">
                      <Music className="w-5 h-5 text-[#86868B]" />
                      <span className="text-[10px] font-medium text-slate-600">Escolha uma música</span>
                      <span className="text-[8px] text-[#86868B] uppercase font-mono">MP3, WAV ou M4A recomendado</span>
                      <input type="file" accept="audio/*" onChange={handleMusicFileChange} className="hidden" />
                    </label>
                  )}
                </div>

                {musicOverlay.objectUrl && (
                  <div className="flex flex-col gap-2.5 border-t border-black/5 pt-2.5">
                    <div className="flex justify-between items-center text-[10px] font-bold text-[#86868B] uppercase tracking-wider">
                      <span>Ponto de Partida da Música (Início)</span>
                      <span className="text-[#0071E3] font-mono">
                        {Math.floor(musicOverlay.startTime / 60)}:{(Math.floor(musicOverlay.startTime % 60) < 10 ? '0' : '')}{Math.floor(musicOverlay.startTime % 60)}
                      </span>
                    </div>
                    <input type="range" min="0" max={Math.floor(musicOverlay.duration)} value={musicOverlay.startTime}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setMusicOverlay((prev) => ({ ...prev, startTime: val }));
                        if (previewAudioRef.current) {
                          previewAudioRef.current.currentTime = val;
                          previewAudioRef.current.play().catch((err) => console.log('Error playing preview:', err));
                        }
                      }}
                      className="w-full cursor-pointer accent-[#0071E3] mt-1" />

                    <div className="flex items-center gap-2 mt-1">
                      <button type="button" onClick={togglePreviewAudio}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 border rounded-xl text-[10px] font-bold tracking-wider font-mono cursor-pointer transition-all ${
                          isPreviewPlaying
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 hover:bg-amber-500/20'
                            : 'bg-[#0071E3]/5 border-[#0071E3]/10 text-[#0071E3] hover:bg-[#0071E3]/10'
                        }`}>
                        {isPreviewPlaying ? (
                          <><Pause className="w-3.5 h-3.5" /> PAUSAR MÚSICA</>
                        ) : (
                          <><Play className="w-3.5 h-3.5 text-[#0071E3] fill-[#0071E3]" /> ESCUTAR INÍCIO DA MÚSICA</>
                        )}
                      </button>
                    </div>

                    <audio
                      ref={previewAudioRef}
                      src={musicOverlay.objectUrl || undefined}
                      onPlay={() => setIsPreviewPlaying(true)}
                      onPause={() => setIsPreviewPlaying(false)}
                      onEnded={() => setIsPreviewPlaying(false)}
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Lote Configuration Parameters */}
          <div className="apple-card rounded-2xl p-6 flex flex-col gap-5 text-[#1D1D1F]">
            <div className="flex items-center gap-2 border-b border-black/5 pb-3">
              <Settings className="w-4 h-4 text-[#0071E3]" />
              <h3 className="font-semibold text-xs tracking-[0.15em] text-[#86868B] uppercase">Ajustes do Lote</h3>
            </div>

          <div className="flex flex-col gap-4 text-xs">
              <div className="flex flex-col gap-1.5 pt-1">
                <button type="button"
                  onClick={() => {
                    const anyUnmirrored = jobs.some((j) => !j.mirrored);
                    setJobs((prev) => prev.map((j) => ({ ...j, mirrored: anyUnmirrored, outputBlobUrl: null })));
                  }}
                  disabled={jobs.length === 0}
                  className={`w-full py-2 px-3 border rounded-lg text-[10px] font-semibold tracking-wider font-mono flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    jobs.length === 0
                      ? 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50/50'
                      : jobs.some((j) => j.mirrored)
                      ? 'bg-[#0071E3]/5 border-[#0071E3]/20 text-[#0071E3] hover:bg-[#0071E3]/10'
                      : 'bg-white border-slate-200 hover:border-[#0071E3]/30 text-[#86868B] hover:text-[#0071E3]'
                  }`}>
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  {jobs.every((j) => j.mirrored) && jobs.length > 0
                    ? 'DESFAZER ESPELHAMENTO DE TODOS'
                    : 'ESPELHAR TODOS OS VÍDEOS'}
                </button>

                {/* Manter Título — preserva a área acima do vídeo (título/nome da fonte) no recorte */}
                <button type="button"
                  onClick={() => {
                    const anyWithout = jobs.some((j) => !j.keepTitle);
                    setJobs((prev) => prev.map((j) => ({ ...j, keepTitle: anyWithout, outputBlobUrl: null })));
                  }}
                  disabled={jobs.length === 0}
                  className={`w-full py-2 px-3 border rounded-lg text-[10px] font-semibold tracking-wider font-mono flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    jobs.length === 0
                      ? 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50/50'
                      : jobs.some((j) => j.keepTitle)
                      ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/10'
                      : 'bg-white border-slate-200 hover:border-emerald-500/30 text-[#86868B] hover:text-emerald-600'
                  }`}>
                  <PanelTop className="w-3.5 h-3.5" />
                  {jobs.every((j) => j.keepTitle) && jobs.length > 0
                    ? 'DESFAZER TÍTULO DE TODOS'
                    : 'MANTER TÍTULO DE TODOS'}
                </button>

                {/* Remover Todos os Vídeos */}
                <button type="button"
                  onClick={() => setShowClearAllConfirm(true)}
                  disabled={jobs.length === 0}
                  className={`w-full py-2 px-3 border rounded-lg text-[10px] font-semibold tracking-wider font-mono flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    jobs.length === 0
                      ? 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50/50'
                      : 'bg-rose-500/5 border-rose-500/20 text-rose-600 hover:bg-rose-500/10 hover:border-rose-500/30'
                  }`}>
                  <Trash2 className="w-3.5 h-3.5" />
                  REMOVER TODOS OS VÍDEOS
                </button>
              </div>
            </div>

            {renderizandoJobs > 0 && (
              <div className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[#E8E8ED] text-[#86868B] text-xs font-bold tracking-widest uppercase">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Renderizando {renderizandoJobs} vídeo{renderizandoJobs > 1 ? 's' : ''}...
              </div>
            )}

            {completedJobs > 0 && (
              <button
                onClick={handleSaveAll}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-bold tracking-widest uppercase transition-all duration-300 border border-[#0071E3] text-[#0071E3] hover:bg-[#0071E3]/5 bg-white transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer shadow-sm">
                <Save className="w-4 h-4" />
                Salvar Todos os Vídeos ({completedJobs})
              </button>
            )}
          </div>

        </div>

        {/* Right Section: Video Lot Management Console */}
        <div className="flex-grow flex flex-col gap-4 min-w-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-xs tracking-[0.2em] text-[#86868B] uppercase flex items-center gap-2">
                <Film className="w-4 h-4 text-[#0071E3]" />
                Lote de Processamento ({jobs.length} vídeos)
              </h2>
              <p className="text-[11px] text-[#86868B] mt-1">
                Os vídeos são renderizados automaticamente. Após concluir, clique em Salvar.
              </p>
            </div>
          </div>

          <VideoGrid
            jobs={jobs}
            template={template}
            onCalibrate={handleCalibrate}
            onRemove={handleRemoveJob}
            onToggleMirror={handleToggleMirror}
            onToggleKeepTitle={handleToggleKeepTitle}
            onDownload={handleSave}
            antiDuplicityEnabled={antiDuplicity.enabled}
            textOverlay={textOverlay}
            imageOverlay={imageOverlay}
            onUpdateTextOverlay={(newConfig) => setTextOverlay((prev) => ({ ...prev, ...newConfig }))}
            onUpdateImageOverlay={(newConfig) => setImageOverlay((prev) => ({ ...prev, ...newConfig }))}
          />
        </div>

      </main>

      {/* Embedded Crop Calibrator Modal */}
      {calibratingJob && (
        <CropModal
          job={calibratingJob}
          template={template}
          onClose={() => setCalibratingJob(null)}
          onSave={handleSaveCalibration}
          musicOverlay={musicOverlay}
          onMusicStartTimeChange={(time) => setMusicOverlay((prev) => ({ ...prev, startTime: time }))}
          keepTitle={{ enabled: calibratingJob.keepTitle ?? keepTitle.enabled, heightPercent: keepTitle.heightPercent }}
          onKeepTitleChange={(val) =>
            setJobs((prev) =>
              prev.map((j) => (j.id === calibratingJob.id ? { ...j, keepTitle: val.enabled, outputBlobUrl: null } : j))
            )
          }
        />
      )}

      {/* Modal Flutuante: Confirmar Remoção de Todos os Vídeos */}
      {showClearAllConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="relative w-full max-w-[400px] bg-white rounded-2xl border border-[#E8E8EA] shadow-[0_20px_60px_rgba(0,0,0,0.18)] p-6 overflow-hidden flex flex-col items-center text-center animate-modal-scale">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4 shrink-0 shadow-xs">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-[#1D1D1F]">
              Remover todos os vídeos?
            </h3>

            <p className="text-xs text-[#86868B] mt-2 leading-relaxed">
              Esta ação removerá todos os {jobs.length} vídeo(s) da lista de edições atuais do lote. Esta operação não pode ser desfeita.
            </p>

            <div className="flex items-center justify-end gap-3 w-full mt-6">
              <button
                type="button"
                onClick={() => setShowClearAllConfirm(false)}
                className="flex-1 h-10 rounded-xl border border-[#E8E8EA] bg-white hover:bg-[#F5F5F7] text-xs font-semibold text-[#1D1D1F] transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setJobs([]);
                  setShowClearAllConfirm(false);
                }}
                className="flex-1 h-10 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold shadow-[0_4px_14px_rgba(220,38,38,0.25)] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Remover Todos
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
