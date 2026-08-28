export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type JobStatus = 'na fila' | 'detectando' | 'compondo' | 'concluído' | 'falhou' | 'salvando';

export interface VideoJob {
  id: string;
  name: string;
  file: File;
  objectUrl: string;
  thumbnailUrl: string;
  status: JobStatus;
  progress: number;
  details: string;
  mode: 'auto' | 'manual';
  detectedBbox: BoundingBox | null;
  manualBbox: BoundingBox | null;
  confidence: number;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  outputBlobUrl: string | null;
  mirrored?: boolean;
  videoScale?: number;
  trimStart?: number;
  trimEnd?: number;
}

export interface TemplateConfig {
  file: File | null;
  objectUrl: string | null;
  width: number;
  height: number;
  hole: BoundingBox | null; // Detected/calibrated transparent area
  hasAlpha: boolean;
}

export interface TextOverlayConfig {
  enabled: boolean;
  text: string;
  position: 'top' | 'middle' | 'bottom';
  positionX: number;
  positionY: number;
  align: 'left' | 'center' | 'right';
  size: number;
  color: string;
  bgColor: string;
  bgOpacity: number;
  useShadow: boolean;
  bold: boolean;
}

export interface ImageOverlayConfig {
  enabled: boolean;
  imageUrl: string | null;
  opacity: number; // 0 to 100
  positionX: number; // 0 to 100
  positionY: number; // 0 to 100
  scale: number; // Percentage scale (e.g., 5 to 100%)
}

