export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type JobStatus = 'na fila' | 'detectando' | 'renderizando' | 'compondo' | 'concluído' | 'falhou' | 'salvando' | 'salvo';

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
  keepTitle?: boolean;
}

export interface TemplateConfig {
  file: File | null;
  objectUrl: string | null;
  width: number;
  height: number;
  hole: BoundingBox | null; // Detected/calibrated transparent area
  hasAlpha: boolean;
}

export interface TemplateLibraryItem {
  id: string;
  name: string;
  width: number;
  height: number;
  hole: BoundingBox;
  has_alpha: boolean;
  origin: 'created' | 'uploaded';
  extra_config?: any;
  created_at: string;
  file_url: string;
  thumbnail_url: string;
}

export type TemplateElementType = 'text' | 'image';

export interface TemplateDesignElement {
  id: string;
  type: TemplateElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  imageUrl?: string;
  borderRadius?: number;
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
  opacity?: number;
  bgColor: string;
  bgOpacity: number;
  useShadow: boolean;
  shadowColor?: string;
  shadowOpacity?: number;
  shadowBlur?: number;
  shadowDistance?: number;
  shadowAngle?: number;
  bold: boolean;
  fontFamily?: string;
  strokeEnabled?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  caseMode?: 'normal' | 'sentence' | 'lower' | 'upper' | 'title';
  letterSpacing?: number;
  lineSpacing?: number;
  widthPercent?: number;
}

export interface ImageOverlayConfig {
  enabled: boolean;
  imageUrl: string | null;
  opacity: number; // 0 to 100
  positionX: number; // 0 to 100
  positionY: number; // 0 to 100
  scale: number; // Percentage scale (e.g., 5 to 100%)
}
