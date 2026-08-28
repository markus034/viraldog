import React, { useRef, useState } from 'react';
import { Upload, Film, RefreshCw } from 'lucide-react';
import { VideoJob } from '../types';
import { analyzeVideoVariance } from '../utils/detector';

interface VideoDropzoneProps {
  jobs: VideoJob[];
  onJobsAdded: (newJobs: VideoJob[]) => void;
  onAutoRender: (jobId: string) => void;
}

export default function VideoDropzone({ jobs, onJobsAdded, onAutoRender }: VideoDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFiles = async (files: FileList) => {
    setLoading(true);
    const newJobs: VideoJob[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.includes('video/')) {
        continue;
      }

      const id = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const objectUrl = URL.createObjectURL(file);

      // Create an initial job record in 'detectando' state
      const initialJob: VideoJob = {
        id,
        name: file.name,
        file,
        objectUrl,
        thumbnailUrl: '', // Will be updated
        status: 'detectando',
        progress: 10,
        details: 'Analisando variância temporal...',
        mode: 'auto',
        detectedBbox: null,
        manualBbox: null,
        confidence: 0,
        duration: 0,
        videoWidth: 0,
        videoHeight: 0,
        outputBlobUrl: null,
        mirrored: false,
        videoScale: 100,
      };

      // Append immediately to show loading spinner on card
      newJobs.push(initialJob);
    }

    onJobsAdded(newJobs);

    // Run parallel video analytical detection in browser background with a concurrency limit of 3
    const limit = 3;
    let index = 0;

    const runNext = async () => {
      if (index >= newJobs.length) return;
      const job = newJobs[index++];
      try {
        const analysis = await analyzeVideoVariance(job.objectUrl);
        
        // Only send the fields that changed from the analysis — don't spread the
        // stale closure-captured job object which would overwrite user state (e.g. mirrored)
        onJobsAdded([
          {
            ...job,
            id: job.id,
            status: 'na fila',
            progress: 100,
            thumbnailUrl: analysis.thumbnailUrl,
            detectedBbox: analysis.bbox,
            confidence: analysis.confidence,
            duration: analysis.duration,
            videoWidth: analysis.width,
            videoHeight: analysis.height,
            details: 'Análise concluída. Renderizando automaticamente...',
          }
        ]);
        onAutoRender(job.id);
      } catch (err) {
        console.error('Failed to analyze video:', err);
        onJobsAdded([
          {
            ...job,
            id: job.id,
            status: 'falhou',
            details: 'Não foi possível decodificar o vídeo.',
          }
        ]);
      } finally {
        await runNext();
      }
    };

    const runners: Promise<void>[] = [];
    for (let i = 0; i < Math.min(limit, newJobs.length); i++) {
      runners.push(runNext());
    }
    await Promise.all(runners);

    setLoading(false);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div id="video-dropzone-sidebar" className="apple-card rounded-2xl p-6 flex flex-col gap-4 text-[#1D1D1F]">
      <div className="flex items-center gap-2 border-b border-black/5 pb-3">
        <Film className="w-4 h-4 text-[#0071E3]" />
        <h3 className="font-semibold text-xs tracking-[0.15em] text-[#86868B] uppercase">2. Vídeos de Origem</h3>
      </div>

      <div
        id="video-dropzone-area"
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className="border border-dashed border-slate-200 hover:border-[#0071E3]/50 bg-[#F5F5F7] hover:bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all duration-300 group min-h-[110px]"
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="video/*"
          multiple
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        
        {loading ? (
          <div className="flex flex-col items-center gap-1.5 text-center">
            <RefreshCw className="w-6 h-6 text-[#0071E3] animate-spin" />
            <p className="text-[10px] text-[#86868B]">Processando lote...</p>
          </div>
        ) : (
          <>
            <div className="p-2 bg-white rounded-lg shadow-sm border border-black/5 group-hover:scale-105 transition-transform duration-300">
              <Upload className="w-4 h-4 text-[#86868B] group-hover:text-[#0071E3]" />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-[#1D1D1F]">Arraste ou clique para vídeos</p>
              <p className="text-[10px] text-[#86868B] mt-0.5 font-mono">Lote (.mp4, .mov, .webm)</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
