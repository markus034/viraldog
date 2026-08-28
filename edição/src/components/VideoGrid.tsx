import React from 'react';
import { AlertCircle } from 'lucide-react';
import { VideoJob, TemplateConfig, TextOverlayConfig, ImageOverlayConfig } from '../types';
import VideoCard from './VideoCard';

interface VideoGridProps {
  jobs: VideoJob[];
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

export default function VideoGrid({ jobs, template, onCalibrate, onRemove, onToggleMirror, onDownload, antiDuplicityEnabled, textOverlay, imageOverlay, keepTitle }: VideoGridProps) {
  return (
    <div id="video-grid-container" className="flex flex-col gap-5 text-[#1D1D1F]">
      {/* Grid of Video Cards */}
      {jobs.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {jobs.map((job) => (
            <VideoCard
              key={job.id}
              job={job}
              template={template}
              onCalibrate={onCalibrate}
              onRemove={onRemove}
              onToggleMirror={onToggleMirror}
              onDownload={onDownload}
              antiDuplicityEnabled={antiDuplicityEnabled}
              textOverlay={textOverlay}
              imageOverlay={imageOverlay}
              keepTitle={keepTitle}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 px-6 border border-black/5 bg-white shadow-[0_10px_40px_rgba(0,0,0,0.02)] rounded-2xl text-center">
          <AlertCircle className="w-8 h-8 text-[#86868B] mb-2" />
          <p className="text-xs font-semibold text-[#1D1D1F]">Nenhum vídeo adicionado ao lote ainda.</p>
          <p className="text-[10px] text-[#86868B] mt-1">
            Adicione os vídeos na barra lateral esquerda para iniciar a calibração automática.
          </p>
        </div>
      )}
    </div>
  );
}
