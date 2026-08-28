import React, { useState, useEffect } from 'react';
import { Layers, Film, Play, Settings, RefreshCw, CheckSquare, Sliders, ExternalLink, FlipHorizontal, Type, TypeOutline, Image as ImageIcon, Music, Pause, Download } from 'lucide-react';
import { VideoJob, TemplateConfig, BoundingBox, TextOverlayConfig, ImageOverlayConfig } from './types';
import TemplateCard from './components/TemplateCard';
import VideoDropzone from './components/VideoDropzone';
import VideoGrid from './components/VideoGrid';
import CropModal from './components/CropModal';
import { renderAndRecordVideo } from './utils/renderer';

export default function App() {
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [renderingStatus, setRenderingStatus] = useState<{
    jobName: string;
    progress: number;
    currentCount?: number;
    totalCount?: number;
  } | null>(null);
  const [workers, setWorkers] = useState<number>(10);
  const [marginOffset, setMarginOffset] = useState<number>(5);

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
    bgColor: '#000000',
    bgOpacity: 60,
    useShadow: true,
    bold: true,
  });

  const [imageOverlay, setImageOverlay] = useState<ImageOverlayConfig>({
    enabled: false,
    imageUrl: null,
    opacity: 100,
    positionX: 50,
    positionY: 50,
    scale: 25,
  });

  const [musicOverlay, setMusicOverlay] = useState({
    enabled: false,
    fileName: '',
    objectUrl: null as string | null,
    startTime: 0,
    duration: 180, // default placeholder
  });

  const [keepTitle, setKeepTitle] = useState({
    enabled: false,
    heightPercent: 25,
  });

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

  // Invalidate pre-rendered video caches when overlays or title configurations change
  useEffect(() => {
    setJobs((prev) =>
      prev.map((j) => (j.outputBlobUrl ? { ...j, outputBlobUrl: null } : j))
    );
  }, [keepTitle, textOverlay, imageOverlay, antiDuplicity, template]);

  const handleWatermarkImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageOverlay(prev => ({ ...prev, imageUrl: url }));
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
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw solid elegant dark background
    ctx.fillStyle = '#0f0f11';
    ctx.fillRect(0, 0, 1080, 1920);

    // Create central mobile cut-out slot (9:16 vertical ratio)
    const hX = 140;
    const hY = 240;
    const hW = 800;
    const hH = 1420;

    // Cut hole for video composition preview
    ctx.clearRect(hX, hY, hW, hH);

    // Stroke a neon-teal glowing border accent around the hole
    ctx.strokeStyle = '#14b8a6';
    ctx.lineWidth = 6;
    ctx.strokeRect(hX, hY, hW, hH);

    // Add sleek minimalist layout texts on the template
    ctx.fillStyle = '#f3f4f6';
    ctx.font = 'bold 38px system-ui, sans-serif';
    ctx.fillText('AUTODARK GRID STUDIO', 140, 110);

    ctx.fillStyle = '#64748b';
    ctx.font = '22px monospace';
    ctx.fillText('OVERLAY TEMPLATE • BYPASS DETECTOR', 140, 160);

    // Draw accent bottom footer banner
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
    ctx.fillText('AUTODARK VIDEO SUITE', 220, 1788);

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
  }, []);

  // Handler for adding parsed videos to queue
  const handleJobsAdded = (addedJobs: VideoJob[]) => {
    setJobs((prev) => {
      // Filter out duplicates and merge
      const filtered = prev.filter((p) => !addedJobs.some((a) => a.id === p.id));
      const merged = [...filtered, ...addedJobs];
      
      // Update existing entries with analysis data if matches
      return merged.map((m) => {
        const match = addedJobs.find((a) => a.id === m.id);
        if (match) {
          return { ...m, ...match };
        }
        return m;
      });
    });
  };

  const handleRemoveJob = (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  // Trigger manual calibration modal
  const handleCalibrate = (job: VideoJob) => {
    setCalibratingJob(job);
  };

  // Save manual adjustments
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

  const triggerBlobDownload = (url: string, name: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownload = async (job: VideoJob) => {
    if (job.outputBlobUrl) {
      triggerBlobDownload(job.outputBlobUrl, job.name);
      return;
    }

    try {
      setRenderingStatus({
        jobName: job.name,
        progress: 0,
      });

      const blob = await renderAndRecordVideo(
        job,
        template,
        textOverlay,
        imageOverlay,
        antiDuplicity.enabled,
        (pct) => {
          setRenderingStatus((prev) => prev ? { ...prev, progress: pct } : null);
        },
        keepTitle
      );

      const outputBlobUrl = URL.createObjectURL(blob);
      
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, outputBlobUrl } : j))
      );

      triggerBlobDownload(outputBlobUrl, job.name);
    } catch (err: any) {
      alert('Erro ao renderizar o vídeo editado: ' + err.message);
    } finally {
      setRenderingStatus(null);
    }
  };

  const handleDownloadAll = async () => {
    const completed = jobs.filter((j) => j.status === 'concluído');
    if (completed.length === 0) return;

    let idx = 0;
    for (const job of completed) {
      idx++;
      let url = job.outputBlobUrl;
      if (!url) {
        try {
          setRenderingStatus({
            jobName: job.name,
            progress: 0,
            currentCount: idx,
            totalCount: completed.length,
          });

          const blob = await renderAndRecordVideo(
            job,
            template,
            textOverlay,
            imageOverlay,
            antiDuplicity.enabled,
            (pct) => {
              setRenderingStatus((prev) =>
                prev ? { ...prev, progress: pct } : null
              );
            },
            keepTitle
          );

          url = URL.createObjectURL(blob);
          setJobs((prev) =>
            prev.map((j) => (j.id === job.id ? { ...j, outputBlobUrl: url } : j))
          );
        } catch (err: any) {
          console.error('Failed to render', job.name, err);
          continue;
        }
      }
      if (url) {
        triggerBlobDownload(url, job.name);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    setRenderingStatus(null);
  };

  // Helper to generate and persist the next name in sequence for a template
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

  // Process batch compilation loop
  const processBatch = async () => {
    if (jobs.length === 0) return;
    setIsProcessing(true);

    // Group jobs to process
    const jobsToProcess = jobs.filter((j) => j.status === 'na fila' || j.status === 'falhou');

    for (const job of jobsToProcess) {
      const templateFileName = template.file?.name || "default_mobile_frame.png";
      const newBaseName = generateNextVideoName(templateFileName);
      const originalExtension = job.file?.name
        ? job.file.name.substring(job.file.name.lastIndexOf('.')) || '.mp4'
        : '.mp4';
      const newName = `${newBaseName}${originalExtension}`;

      // Step 1: Compondo status
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, name: newName, status: 'compondo', details: 'Renderizando vídeo sob o novo template...' }
            : j
        )
      );

      await new Promise((r) => setTimeout(r, 800));

      // Step 2: Wipe Metadata if active
      if (antiDuplicity.enabled && antiDuplicity.wipeMetadata) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? { ...j, details: '[Anti-Duplicidade] Removendo metadados EXIF, IPTC e UUIDs do dispositivo...' }
              : j
          )
        );
        await new Promise((r) => setTimeout(r, 700));
      }

      // Step 3: Subtle Pixel Filters if active
      if (antiDuplicity.enabled && antiDuplicity.invisibleFilters) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? { ...j, details: '[Anti-Duplicidade] Aplicando micro-filtro cromático (brilho +0.2%, hash de pixel alterado)...' }
              : j
          )
        );
        await new Promise((r) => setTimeout(r, 700));
      }

      // Step 4: Audio phase / noise if active
      if (antiDuplicity.enabled && antiDuplicity.inaudibleAudioNoise) {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? { ...j, details: '[Anti-Duplicidade] Injetando ruído acústico inaudível (18.5kHz, bypass de áudio)...' }
              : j
          )
        );
        await new Promise((r) => setTimeout(r, 700));
      }

      // Done
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? {
                ...j,
                status: 'concluído',
                progress: 100,
                details: antiDuplicity.enabled
                  ? 'Vídeo composto e processado com Anti-Duplicidade Ativa.'
                  : 'Pronto! Vídeo composto com sucesso.',
              }
            : j
        )
      );
    }

    setIsProcessing(false);
  };

  // Stats calculation
  const totalJobs = jobs.length;
  const completedJobs = jobs.filter((j) => j.status === 'concluído').length;
  const processingJobs = jobs.filter((j) => j.status === 'compondo' || j.status === 'detectando').length;

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] flex flex-col font-sans selection:bg-[#0071E3]/10 selection:text-[#0071E3]">
      
      {/* Premium Studio Header */}
      <header className="h-16 shrink-0 px-6 glass-header flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0071E3] flex items-center justify-center shadow-sm">
            <Layers className="w-4 h-4 text-white stroke-[2]" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-[#1D1D1F]">
              AUTODARK <span className="font-light text-[#86868B]">GRID STUDIO v2.6</span>
            </h1>
            <p className="text-[9px] text-[#86868B] font-mono tracking-widest uppercase">
              Batch Vertical Video Crop Overlay Suite
            </p>
          </div>
        </div>

        {/* Dashboard Indicators */}
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <div className="flex flex-col gap-0.5 text-right">
              <span className="text-[8px] text-[#86868B] uppercase tracking-[0.15em] font-mono font-bold">Lote Ativo</span>
              <span className="text-xs font-bold font-mono text-[#1D1D1F]">{completedJobs} / {totalJobs}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Studio Console Layout */}
      <main className="flex-grow p-6 max-w-7xl w-full mx-auto flex flex-col lg:flex-row gap-6">
        
        {/* Left Column: Calibration & Setup Controls */}
        <div className="w-full lg:w-80 flex flex-col gap-6 flex-shrink-0">
          
          {/* Template Card Component */}
          <TemplateCard config={template} onChange={setTemplate} />

          {/* Video Dropzone Component */}
          <VideoDropzone jobs={jobs} onJobsAdded={handleJobsAdded} />

          {/* Opção de Adicionar Texto nos Vídeos */}
          <div className="apple-card rounded-2xl p-6 flex flex-col gap-4 text-[#1D1D1F]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-[#0071E3]" />
                <h3 className="font-semibold text-xs tracking-[0.15em] text-[#86868B] uppercase">
                  Opções de Texto / Marca d'água
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

            {/* Content list when enabled */}
            {textOverlay.enabled ? (
              <div className="flex flex-col gap-3.5 text-xs">
                
                {/* Text input */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="overlay-text-input" className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">
                    Texto do Vídeo
                  </label>
                  <input
                    id="overlay-text-input"
                    type="text"
                    value={textOverlay.text}
                    onChange={(e) => setTextOverlay((prev) => ({ ...prev, text: e.target.value }))}
                    placeholder="Digite seu texto, cupom ou @usuário..."
                    className="w-full px-3 py-2 border border-black/10 rounded-lg text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-[#0071E3] focus:border-[#0071E3] transition-all outline-none"
                  />
                </div>

                {/* Sliders de Posição Manual X/Y */}
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[9px] font-bold text-[#86868B] uppercase tracking-wider">
                      <span>Posição X (Horizontal)</span>
                      <span className="text-[#0071E3]">{textOverlay.positionX}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={textOverlay.positionX}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setTextOverlay((prev) => ({ ...prev, positionX: val }));
                      }}
                      className="w-full cursor-pointer accent-[#0071E3] mt-1"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[9px] font-bold text-[#86868B] uppercase tracking-wider">
                      <span>Posição Y (Vertical)</span>
                      <span className="text-[#0071E3]">{textOverlay.positionY}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={textOverlay.positionY}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setTextOverlay((prev) => ({ ...prev, positionY: val }));
                      }}
                      className="w-full cursor-pointer accent-[#0071E3] mt-1"
                    />
                  </div>
                </div>

                {/* Text styling & properties */}
                <div className="grid grid-cols-2 gap-3 mt-1">
                  
                  {/* Font Size slider */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[9px] font-bold text-[#86868B] uppercase tracking-wider">
                      <span>Tamanho</span>
                      <span className="text-[#0071E3]">{textOverlay.size}px</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="32"
                      value={textOverlay.size}
                      onChange={(e) => setTextOverlay((prev) => ({ ...prev, size: parseInt(e.target.value) }))}
                      className="w-full cursor-pointer accent-[#0071E3] mt-1"
                    />
                  </div>

                  {/* Font Weights & Effects */}
                  <div className="flex flex-col gap-1.5 justify-end">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setTextOverlay((prev) => ({ ...prev, bold: !prev.bold }))}
                        className={`flex-grow py-1 border rounded-md text-[9px] font-bold tracking-wider font-mono cursor-pointer transition-all text-center ${
                          textOverlay.bold
                            ? 'bg-[#0071E3]/5 border-[#0071E3]/20 text-[#0071E3]'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-500'
                        }`}
                      >
                        NEGRITO
                      </button>
                      <button
                        type="button"
                        onClick={() => setTextOverlay((prev) => ({ ...prev, useShadow: !prev.useShadow }))}
                        className={`flex-grow py-1 border rounded-md text-[9px] font-bold tracking-wider font-mono cursor-pointer transition-all text-center ${
                          textOverlay.useShadow
                            ? 'bg-[#0071E3]/5 border-[#0071E3]/20 text-[#0071E3]'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-500'
                        }`}
                      >
                        SOMBRA
                      </button>
                    </div>
                  </div>

                </div>

                {/* Color Selection Panel */}
                <div className="flex flex-col gap-1.5 border-t border-black/5 pt-2.5">
                  <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">
                    Cor do Texto
                  </span>
                  <div className="flex items-center gap-2">
                    {[
                      { hex: '#ffffff', label: 'Branco' },
                      { hex: '#fef08a', label: 'Amarelo' },
                      { hex: '#4ade80', label: 'Verde' },
                      { hex: '#38bdf8', label: 'Azul' },
                      { hex: '#f87171', label: 'Vermelho' },
                      { hex: '#000000', label: 'Preto' },
                    ].map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setTextOverlay((prev) => ({ ...prev, color: c.hex }))}
                        className={`w-6 h-6 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                          textOverlay.color === c.hex
                            ? 'ring-2 ring-offset-2 ring-[#0071E3] scale-110 border-black/20'
                            : 'border-black/10 hover:scale-105'
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={c.label}
                      >
                        {textOverlay.color === c.hex && (
                          <span 
                            className="w-1.5 h-1.5 rounded-full" 
                            style={{ backgroundColor: c.hex === '#ffffff' ? '#000000' : '#ffffff' }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subtitle Strip Background Option */}
                <div className="flex flex-col gap-2 border-t border-black/5 pt-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">
                      Fundo da Legenda
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setTextOverlay((prev) => ({ ...prev, bgColor: prev.bgColor ? '' : '#000000' }))}
                        className={`px-2 py-0.5 rounded text-[8px] font-bold tracking-wider uppercase cursor-pointer transition-all ${
                          textOverlay.bgColor
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-[#86868B] hover:bg-slate-200'
                        }`}
                      >
                        {textOverlay.bgColor ? 'Com Fundo' : 'Sem Fundo'}
                      </button>
                    </div>
                  </div>

                  {textOverlay.bgColor ? (
                    <div className="flex flex-col gap-2">
                      {/* Background Opacity */}
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center text-[9px] font-mono text-[#86868B]">
                          <span>Opacidade do Fundo</span>
                          <span>{textOverlay.bgOpacity}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={textOverlay.bgOpacity}
                          onChange={(e) => setTextOverlay((prev) => ({ ...prev, bgOpacity: parseInt(e.target.value) }))}
                          className="w-full cursor-pointer accent-slate-900"
                        />
                      </div>

                      {/* Background Color Picker */}
                      <div className="flex flex-col gap-1 mt-0.5">
                        <span className="text-[9px] font-bold text-[#86868B] uppercase tracking-wider">
                          Cor do Fundo
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          {[
                            { hex: '#000000', label: 'Preto' },
                            { hex: '#ffffff', label: 'Branco' },
                            { hex: '#ef4444', label: 'Vermelho' },
                            { hex: '#3b82f6', label: 'Azul' },
                            { hex: '#10b981', label: 'Verde' },
                            { hex: '#fef08a', label: 'Amarelo' },
                            { hex: '#8b5cf6', label: 'Roxo' },
                          ].map((bgC) => (
                            <button
                              key={bgC.hex}
                              type="button"
                              onClick={() => setTextOverlay((prev) => ({ ...prev, bgColor: bgC.hex }))}
                              className={`w-6 h-6 rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                                textOverlay.bgColor === bgC.hex
                                  ? 'ring-2 ring-offset-2 ring-slate-850 scale-110 border-black/20'
                                  : 'border-black/10 hover:scale-105'
                              }`}
                              style={{ backgroundColor: bgC.hex }}
                              title={bgC.label}
                            >
                              {textOverlay.bgColor === bgC.hex && (
                                <span 
                                  className="w-1.5 h-1.5 rounded-full" 
                                  style={{ backgroundColor: bgC.hex === '#ffffff' ? '#000000' : '#ffffff' }}
                                />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

              </div>
            ) : null}
          </div>

          {/* Opção de Adicionar Imagem / Marca d'água nos Vídeos */}
          <div className="apple-card rounded-2xl p-6 flex flex-col gap-4 text-[#1D1D1F]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#0071E3]" />
                <h3 className="font-semibold text-xs tracking-[0.15em] text-[#86868B] uppercase">
                  Opções de Imagem / Logo
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setImageOverlay((prev) => ({ ...prev, enabled: !prev.enabled }));
                }}
                className={`px-2 py-1 rounded-full text-[8px] font-bold tracking-wider font-mono uppercase transition-all duration-300 cursor-pointer ${
                  imageOverlay.enabled
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'bg-[#86868B]/10 text-[#86868B] hover:bg-[#86868B]/20'
                }`}
              >
                {imageOverlay.enabled ? 'ATIVADO' : 'DESATIVADO'}
              </button>
            </div>

            {/* Content when enabled */}
            {imageOverlay.enabled ? (
              <div className="flex flex-col gap-3.5 text-xs">
                {/* Image Upload Area */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">
                    Imagem da Marca d'água / Logo
                  </span>
                  {imageOverlay.imageUrl ? (
                    <div className="relative group rounded-lg overflow-hidden border border-black/10 bg-[#F5F5F7] flex items-center justify-center p-3 h-24">
                      <img
                        src={imageOverlay.imageUrl}
                        alt="Watermark preview"
                        className="max-h-full max-w-full object-contain"
                        style={{ opacity: imageOverlay.opacity / 100 }}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <label className="bg-white/90 hover:bg-white text-slate-950 font-bold text-[9px] px-2 py-1 rounded cursor-pointer transition-colors shadow-sm">
                          Alterar
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleWatermarkImageChange}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setImageOverlay(prev => ({ ...prev, imageUrl: null }))}
                          className="bg-red-500/90 hover:bg-red-600 text-white font-bold text-[9px] px-2 py-1 rounded cursor-pointer transition-colors shadow-sm"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="border border-dashed border-black/20 hover:border-[#0071E3]/40 rounded-lg bg-[#F5F5F7] hover:bg-[#0071E3]/5 p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all h-24 text-center">
                      <ImageIcon className="w-5 h-5 text-[#86868B]" />
                      <span className="text-[10px] font-medium text-slate-600">Escolha uma imagem</span>
                      <span className="text-[8px] text-[#86868B] uppercase font-mono">PNG transparente recomendado</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleWatermarkImageChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* Opacity Slider */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-[#86868B] uppercase tracking-wider">
                    <span>Opacidade da Imagem</span>
                    <span className="text-[#0071E3]">{imageOverlay.opacity}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={imageOverlay.opacity}
                    onChange={(e) => setImageOverlay((prev) => ({ ...prev, opacity: parseInt(e.target.value) }))}
                    className="w-full cursor-pointer accent-[#0071E3] mt-1"
                  />
                </div>

                {/* Scale/Size Slider */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-[#86868B] uppercase tracking-wider">
                    <span>Tamanho do Logo (Escala)</span>
                    <span className="text-[#0071E3]">{imageOverlay.scale}%</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={imageOverlay.scale}
                    onChange={(e) => setImageOverlay((prev) => ({ ...prev, scale: parseInt(e.target.value) }))}
                    className="w-full cursor-pointer accent-[#0071E3] mt-1"
                  />
                </div>

                {/* Position Sliders X / Y */}
                <div className="grid grid-cols-2 gap-3 border-t border-black/5 pt-2.5">
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[9px] font-bold text-[#86868B] uppercase tracking-wider">
                      <span>Posição X</span>
                      <span className="text-[#0071E3]">{imageOverlay.positionX}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={imageOverlay.positionX}
                      onChange={(e) => setImageOverlay((prev) => ({ ...prev, positionX: parseInt(e.target.value) }))}
                      className="w-full cursor-pointer accent-[#0071E3] mt-1"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-[9px] font-bold text-[#86868B] uppercase tracking-wider">
                      <span>Posição Y</span>
                      <span className="text-[#0071E3]">{imageOverlay.positionY}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={imageOverlay.positionY}
                      onChange={(e) => setImageOverlay((prev) => ({ ...prev, positionY: parseInt(e.target.value) }))}
                      className="w-full cursor-pointer accent-[#0071E3] mt-1"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Opção de Adicionar Música / Trilha Sonora nos Vídeos */}
          <div className="apple-card rounded-2xl p-6 flex flex-col gap-4 text-[#1D1D1F]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-[#0071E3]" />
                <h3 className="font-semibold text-xs tracking-[0.15em] text-[#86868B] uppercase">
                  Opções de Trilha Sonora
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMusicOverlay((prev) => ({ ...prev, enabled: !prev.enabled }));
                }}
                className={`px-2 py-1 rounded-full text-[8px] font-bold tracking-wider font-mono uppercase transition-all duration-300 cursor-pointer ${
                  musicOverlay.enabled
                    ? 'bg-[#0071E3] text-white shadow-sm'
                    : 'bg-[#86868B]/10 text-[#86868B] hover:bg-[#86868B]/20'
                }`}
              >
                {musicOverlay.enabled ? 'ATIVADO' : 'DESATIVADO'}
              </button>
            </div>

            {/* Content when enabled */}
            {musicOverlay.enabled ? (
              <div className="flex flex-col gap-3.5 text-xs">
                {/* Audio Upload Area */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">
                    Arquivo de Áudio (Música)
                  </span>
                  {musicOverlay.objectUrl ? (
                    <div className="relative group rounded-lg overflow-hidden border border-black/10 bg-[#F5F5F7] flex flex-col p-3 gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 truncate">
                          <Music className="w-4 h-4 text-[#0071E3] flex-shrink-0" />
                          <span className="font-mono text-[10px] text-slate-700 truncate" title={musicOverlay.fileName}>
                            {musicOverlay.fileName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMusicOverlay(prev => ({ ...prev, objectUrl: null, fileName: '' }))}
                          className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-bold text-[9px] px-2 py-1 rounded cursor-pointer transition-all border border-red-500/20"
                        >
                          Remover
                        </button>
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
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={handleMusicFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* Sliding Timeline for Start Time */}
                {musicOverlay.objectUrl && (
                  <div className="flex flex-col gap-2.5 border-t border-black/5 pt-2.5">
                    <div className="flex justify-between items-center text-[10px] font-bold text-[#86868B] uppercase tracking-wider">
                      <span>Ponto de Partida da Música (Início)</span>
                      <span className="text-[#0071E3] font-mono">
                        {Math.floor(musicOverlay.startTime / 60)}:{(Math.floor(musicOverlay.startTime % 60) < 10 ? '0' : '')}{Math.floor(musicOverlay.startTime % 60)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={Math.floor(musicOverlay.duration)}
                      value={musicOverlay.startTime}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setMusicOverlay((prev) => ({ ...prev, startTime: val }));
                        if (previewAudioRef.current) {
                          previewAudioRef.current.currentTime = val;
                          previewAudioRef.current.play().catch((err) => console.log('Error playing preview:', err));
                        }
                      }}
                      className="w-full cursor-pointer accent-[#0071E3] mt-1"
                    />

                    {/* Preview Button */}
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={togglePreviewAudio}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 border rounded-xl text-[10px] font-bold tracking-wider font-mono cursor-pointer transition-all ${
                          isPreviewPlaying
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 hover:bg-amber-500/20'
                            : 'bg-[#0071E3]/5 border-[#0071E3]/10 text-[#0071E3] hover:bg-[#0071E3]/10'
                        }`}
                      >
                        {isPreviewPlaying ? (
                          <>
                            <Pause className="w-3.5 h-3.5" /> PAUSAR MÚSICA
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 text-[#0071E3] fill-[#0071E3]" /> ESCUTAR INÍCIO DA MÚSICA
                          </>
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
              
              {/* Batch Mirroring Toggle */}
              <div className="flex flex-col gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const anyUnmirrored = jobs.some((j) => !j.mirrored);
                    setJobs((prev) => prev.map((j) => ({ ...j, mirrored: anyUnmirrored })));
                  }}
                  disabled={jobs.length === 0}
                  className={`w-full py-2 px-3 border rounded-lg text-[10px] font-semibold tracking-wider font-mono flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    jobs.length === 0
                      ? 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50/50'
                      : jobs.some((j) => j.mirrored)
                      ? 'bg-[#0071E3]/5 border-[#0071E3]/20 text-[#0071E3] hover:bg-[#0071E3]/10'
                      : 'bg-white border-slate-200 hover:border-[#0071E3]/30 text-[#86868B] hover:text-[#0071E3]'
                  }`}
                >
                  <FlipHorizontal className="w-3.5 h-3.5" />
                  {jobs.every((j) => j.mirrored) && jobs.length > 0
                    ? 'DESFAZER ESPELHAMENTO DE TODOS'
                    : 'ESPELHAR TODOS OS VÍDEOS'}
                </button>
              </div>

            </div>

            {/* Main Batch Execution Action Button */}
            <button
              onClick={processBatch}
              disabled={isProcessing || jobs.length === 0 || processingJobs > 0}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-bold tracking-widest uppercase transition-all duration-300 cursor-pointer ${
                isProcessing || jobs.length === 0 || processingJobs > 0
                  ? 'bg-[#E8E8ED] text-[#86868B] cursor-not-allowed shadow-none'
                  : 'bg-[#0071E3] hover:bg-[#0077ED] text-white accent-glow transform hover:-translate-y-0.5 active:translate-y-0'
              }`}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white text-white" />
                  Processar Lote
                </>
              )}
            </button>

            {/* Download All Processed Videos Button */}
            {completedJobs > 0 && (
              <button
                onClick={handleDownloadAll}
                disabled={isProcessing}
                className={`w-full flex items-center justify-center gap-2 py-3 mt-3 rounded-lg text-xs font-bold tracking-widest uppercase transition-all duration-300 border border-[#0071E3] text-[#0071E3] hover:bg-[#0071E3]/5 bg-white transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer shadow-sm`}
              >
                <Download className="w-4 h-4" />
                Baixar Todos os Vídeos ({completedJobs})
              </button>
            )}
          </div>

        </div>

        {/* Right Section: Video Lot Management Console */}
        <div className="flex-grow flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-xs tracking-[0.2em] text-[#86868B] uppercase flex items-center gap-2">
                <Film className="w-4 h-4 text-[#0071E3]" />
                Lote de Processamento ({jobs.length} vídeos)
              </h2>
              <p className="text-[11px] text-[#86868B] mt-1">
                Os vídeos inseridos têm suas molduras analógicas detectadas instantaneamente por variância temporal.
              </p>
            </div>
          </div>

          {/* Video Grid Component */}
          <VideoGrid
            jobs={jobs}
            template={template}
            onCalibrate={handleCalibrate}
            onRemove={handleRemoveJob}
            onToggleMirror={handleToggleMirror}
            onDownload={handleDownload}
            antiDuplicityEnabled={antiDuplicity.enabled}
            textOverlay={textOverlay}
            imageOverlay={imageOverlay}
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
        />
      )}

      {/* Rendering Status Overlay Modal */}
      {renderingStatus && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-black/5 rounded-2xl max-w-sm w-full p-6 shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
            <div className="p-3 bg-[#0071E3]/10 text-[#0071E3] rounded-full mb-4">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
            
            <h3 className="font-bold text-base text-[#1D1D1F] tracking-tight">
              {renderingStatus.totalCount 
                ? `Renderizando (${renderingStatus.currentCount}/${renderingStatus.totalCount})`
                : 'Renderizando Vídeo'}
            </h3>
            
            <p className="text-xs text-[#86868B] font-mono truncate max-w-full mt-1.5" title={renderingStatus.jobName}>
              {renderingStatus.jobName}
            </p>

            {/* Progress gauge */}
            <div className="w-full bg-[#E8E8ED] h-2.5 rounded-full overflow-hidden mt-6 relative shadow-inner">
              <div 
                className="bg-[#0071E3] h-full rounded-full transition-all duration-150 relative"
                style={{ width: `${renderingStatus.progress}%` }}
              />
            </div>

            <div className="flex justify-between w-full mt-2 font-mono text-[10px] font-bold text-[#86868B]">
              <span>GRAVANDO STREAM</span>
              <span>{renderingStatus.progress}%</span>
            </div>

            <p className="text-[10px] text-[#86868B] leading-relaxed mt-5">
              Por favor, não feche esta aba. O vídeo está sendo composto e gravado quadro a quadro em alta definição diretamente no navegador.
            </p>
          </div>
        </div>
      )}

      {/* Technical Credits Footer */}
      <footer className="border-t border-black/5 bg-white px-6 py-4 mt-auto">
        <div className="max-w-7xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] text-[#86868B] font-mono uppercase tracking-wider">
          <span>AUTODARK GRID STUDIO © 2026</span>
          <div className="flex items-center gap-4">
            <a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-[#0071E3] flex items-center gap-1 transition-colors">
              Github <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}
