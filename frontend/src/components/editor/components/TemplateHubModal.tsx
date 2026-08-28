import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowUp, BadgeCheck, ChevronDown, Copy,
  FolderOpen, Image as ImageIcon, LayoutGrid, LoaderCircle, Moon, MoreHorizontal, MousePointer2, Palette,
  Pencil, RotateCcw, Save, Sun, Trash2, Type, Upload, UserRound, WandSparkles, X,
} from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { BoundingBox, ImageOverlayConfig, TemplateConfig, TemplateDesignElement, TemplateLibraryItem, TextOverlayConfig } from '../types';
import CustomSelect from '../../CustomSelect';
import { ColorPickerPopover } from './ColorPickerPopover';

type HubView = 'choices' | 'library' | 'creator';

interface TemplateHubModalProps {
  open: boolean;
  onClose: () => void;
  onUploadClick: () => void;
  onApply: (config: TemplateConfig) => void;
}

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const DEFAULT_HOLE: BoundingBox = { x: 0, y: 400, width: 1080, height: 1520 };
const PROFILE_IMAGE_BOX: BoundingBox = { x: 90, y: 90, width: 220, height: 220 };
const FONT_OPTIONS = [
  { label: 'Arial', value: 'Arial', fontFamily: 'Arial' },
  { label: 'Inter', value: 'Inter', fontFamily: 'Inter' },
  { label: 'Roboto', value: 'Roboto', fontFamily: 'Roboto' },
  { label: 'Anton', value: 'Anton', fontFamily: 'Anton' },
  { label: 'Wedges', value: 'Wedges', fontFamily: 'Wedges' },
  { label: 'Archivo Black', value: 'Archivo Black', fontFamily: 'Archivo Black' },
  { label: 'League Spartan', value: 'League Spartan', fontFamily: 'League Spartan' },
  { label: 'Verdana', value: 'Verdana', fontFamily: 'Verdana' },
  { label: 'Georgia', value: 'Georgia', fontFamily: 'Georgia' },
  { label: 'Times New Roman', value: 'Times New Roman', fontFamily: 'Times New Roman' },
  { label: 'Impact', value: 'Impact', fontFamily: 'Impact' },
];

const FONT_SIZE_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 10).map((sz) => ({
  value: sz,
  label: String(sz),
}));

const VERIFIED_BADGE_CLIP = `polygon(${Array.from({ length: 24 }, (_, index) => {
  const angle = -Math.PI / 2 + index * Math.PI / 12;
  const radius = index % 2 === 0 ? 50 : 44;
  return `${50 + Math.cos(angle) * radius}% ${50 + Math.sin(angle) * radius}%`;
}).join(', ')})`;

const transformText = (txt: string, mode?: string) => {
  if (!txt) return '';
  if (mode === 'upper') return txt.toUpperCase();
  if (mode === 'lower') return txt.toLowerCase();
  if (mode === 'title') {
    return txt.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase());
  }
  if (mode === 'sentence') {
    return txt.toLowerCase().replace(/(^\s*\w|[\.\!\?]\s*\w)/g, (c) => c.toUpperCase());
  }
  return txt;
};

const getProfileImageSrc = (url: string | null) => {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${API_BASE_URL}${url}`;
};

async function saveTemplate(file: File, name: string, origin: 'created' | 'uploaded', hole: BoundingBox, extraConfig?: string, profileImageFile?: File | null, watermarkFile?: File | null) {
  const data = new FormData();
  data.append('file', file);
  data.append('name', name);
  data.append('origin', origin);
  data.append('hole_x', String(Math.round(hole.x)));
  data.append('hole_y', String(Math.round(hole.y)));
  data.append('hole_width', String(Math.round(hole.width)));
  data.append('hole_height', String(Math.round(hole.height)));
  if (extraConfig) {
    data.append('extra_config', extraConfig);
  }
  if (profileImageFile) {
    data.append('profile_image', profileImageFile);
  }
  if (watermarkFile) {
    data.append('watermark_image', watermarkFile);
  }
  const response = await fetch(`${API_BASE_URL}/api/editor/templates`, { method: 'POST', body: data });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail || 'Não foi possível salvar o template.');
  }
  return response.json() as Promise<TemplateLibraryItem>;
}

export { saveTemplate };

function ChoiceCard({ icon, title, description, onClick }: {
  icon: React.ReactNode; title: string; description: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="group flex min-h-48 flex-col items-start rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-[#0071E3]/40 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#0071E3]">
      <span className="mb-5 rounded-2xl bg-[#0071E3]/10 p-3 text-[#0071E3] transition-transform group-hover:scale-110">{icon}</span>
      <strong className="text-base text-[#1D1D1F]">{title}</strong>
      <span className="mt-2 text-xs leading-5 text-[#86868B]">{description}</span>
    </button>
  );
}

function TemplateLibrary({ onBack, onApply, onClose, onEdit }: {
  onBack: () => void; onApply: (config: TemplateConfig) => void; onClose: () => void;
  onEdit?: (item: TemplateLibraryItem) => void;
}) {
  const [items, setItems] = useState<TemplateLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingId, setUsingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch(`${API_BASE_URL}/api/editor/templates`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível abrir a biblioteca.');
        return response.json();
      })
      .then((templates) => { if (active) setItems(templates); })
      .catch((reason) => {
        if (active && reason.name !== 'AbortError') setError(reason.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, []);

  const useTemplate = async (item: TemplateLibraryItem) => {
    setUsingId(item.id);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}${item.file_url}`);
      if (!response.ok) throw new Error('Não foi possível carregar este template.');
      const blob = await response.blob();
      const file = new File([blob], `${item.name}.png`, { type: 'image/png' });
      onApply({
        file,
        objectUrl: URL.createObjectURL(blob),
        width: item.width,
        height: item.height,
        hole: item.hole,
        hasAlpha: item.has_alpha,
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Erro ao carregar o template.');
    } finally {
      setUsingId(null);
    }
  };

  const deleteTemplate = async (item: TemplateLibraryItem) => {
    if (!window.confirm(`Tem certeza de que deseja apagar o template "${item.name}"?`)) return;
    setDeletingId(item.id);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/editor/templates/${item.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail || 'Não foi possível apagar este template.');
      }
      setItems((prev) => prev.filter((it) => it.id !== item.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Erro ao apagar o template.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-5 flex items-center gap-3">
        <button type="button" onClick={onBack} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
        <div><h2 className="text-lg font-bold">Biblioteca de Templates</h2><p className="text-xs text-[#86868B]">Templates criados e carregados neste computador.</p></div>
      </div>
      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-xs text-red-600">{error}</p> : null}
      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[#86868B]"><LoaderCircle className="h-5 w-5 animate-spin" /> Carregando biblioteca...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-[#F5F5F7] p-10 text-center">
          <LayoutGrid className="mb-3 h-8 w-8 text-slate-400" /><strong className="text-sm">Sua biblioteca está vazia</strong><span className="mt-1 text-xs text-[#86868B]">Crie ou carregue o primeiro template.</span>
        </div>
      ) : (
        <div className="grid min-h-0 grid-cols-2 gap-4 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex aspect-[9/16] items-center justify-center bg-[linear-gradient(45deg,#eee_25%,transparent_25%),linear-gradient(-45deg,#eee_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eee_75%),linear-gradient(-45deg,transparent_75%,#eee_75%)] bg-[length:16px_16px] relative">
                <img
                  src={`${API_BASE_URL}${item.thumbnail_url}${item.created_at ? `?v=${encodeURIComponent(item.created_at)}` : ''}`}
                  alt={`Miniatura de ${item.name}`}
                  className="h-full w-full object-contain transition-opacity duration-200"
                  decoding="async"
                />
              </div>
              <div className="p-3">
                <h3 className="truncate text-xs font-bold" title={item.name}>{item.name}</h3>
                <p className="mt-1 text-[9px] font-mono text-[#86868B]">{item.width}×{item.height} · {item.origin === 'created' ? 'Criado' : 'Carregado'}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={usingId === item.id || deletingId === item.id} onClick={() => useTemplate(item)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0071E3] px-2 py-2 text-[10px] font-bold text-white hover:bg-[#0077ED] disabled:opacity-60">
                    {usingId === item.id ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <MousePointer2 className="h-3 w-3" />} Usar template
                  </button>
                  <button type="button" disabled={usingId === item.id || deletingId === item.id} onClick={() => onEdit?.(item)} className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-60" title="Editar template">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" disabled={usingId === item.id || deletingId === item.id} onClick={() => deleteTemplate(item)} className="flex items-center justify-center rounded-lg border border-red-100 bg-red-50 p-2 text-red-600 hover:bg-red-100 disabled:opacity-60" title="Apagar template">
                    {deletingId === item.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

type Interaction = {
  target: 'hole' | 'textOverlay' | 'imageOverlay' | string;
  mode: 'move' | 'resize' | 'resize-side';
  startX: number;
  startY: number;
  initial: BoundingBox;
  initialFontSize?: number;
  handle?: string;
};

function hexToRgba(hex: string, opacityPercent: number): string {
  if (!hex) return 'transparent';
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(char => char + char).join('');
  }
  if (cleanHex.length !== 6) return hex;
  const num = parseInt(cleanHex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacityPercent / 100})`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (url && !url.startsWith('data:') && !url.startsWith('blob:')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function drawImageCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sw = width / scale;
  const sh = height / scale;
  ctx.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, x, y, width, height);
}

function drawImageContain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

function drawCircularImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, box: BoundingBox) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(box.x + box.width / 2, box.y + box.height / 2, box.width / 2, 0, Math.PI * 2);
  ctx.clip();
  drawImageCover(ctx, image, box.x, box.y, box.width, box.height);
  ctx.restore();
}

function drawVerifiedBadge(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius = 34) {
  ctx.save();
  ctx.fillStyle = '#2196F3';
  ctx.beginPath();
  for (let index = 0; index < 24; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 12;
    const pointRadius = index % 2 === 0 ? radius : radius * 0.88;
    const x = centerX + Math.cos(angle) * pointRadius;
    const y = centerY + Math.sin(angle) * pointRadius;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(centerX - 14, centerY);
  ctx.lineTo(centerX - 3, centerY + 12);
  ctx.lineTo(centerX + 17, centerY - 13);
  ctx.stroke();
  ctx.restore();
}

function TemplateCreator({ onBack, onApply, onClose, editingItem }: {
  onBack: () => void; onApply: (config: TemplateConfig) => void; onClose: () => void;
  editingItem?: TemplateLibraryItem | null;
}) {
  const previewRef = useRef<HTMLDivElement>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('Template de perfil');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const backgroundColor = theme === 'light' ? '#ffffff' : '#000000';
  const textColor = theme === 'light' ? '#050505' : '#ffffff';
  const usernameColor = theme === 'light' ? '#111111' : '#a1a1aa';
  const [profileName, setProfileName] = useState('Nome do perfil');
  const [profileUsername, setProfileUsername] = useState('@usuario');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [profileVerified, setProfileVerified] = useState(true);
  const [hole, setHole] = useState<BoundingBox>(DEFAULT_HOLE);

  // Text Overlay State (matching Editor.tsx)
  const [textOverlay, setTextOverlay] = useState<TextOverlayConfig>({
    enabled: false,
    text: 'DIGITE SEU TEXTO AQUI',
    fontFamily: 'Arial',
    size: 16,
    bold: true,
    align: 'center',
    caseMode: 'normal',
    letterSpacing: 0,
    lineSpacing: 0,
    color: '#ffffff',
    strokeEnabled: true,
    strokeColor: '#000000',
    strokeWidth: 3,
    bgColor: '',
    bgOpacity: 60,
    useShadow: false,
    shadowColor: '#000000',
    shadowOpacity: 80,
    shadowBlur: 7,
    shadowDistance: 6,
    shadowAngle: 45,
  });
  const [textOverlayBox, setTextOverlayBox] = useState<BoundingBox>({ x: 140, y: 1550, width: 800, height: 180 });

  // Image Overlay State (matching Editor.tsx)
  const [imageOverlay, setImageOverlay] = useState<ImageOverlayConfig>({
    enabled: false,
    imageUrl: null,
    opacity: 100,
  });
  const [imageOverlayBox, setImageOverlayBox] = useState<BoundingBox>({ x: 780, y: 1550, width: 200, height: 200 });

  // Formatting popovers / active pickers
  const [alignDropdownOpen, setAlignDropdownOpen] = useState(false);
  const [caseDropdownOpen, setCaseDropdownOpen] = useState(false);
  const [spacingDropdownOpen, setSpacingDropdownOpen] = useState(false);
  const [activePicker, setActivePicker] = useState<'none' | 'fill' | 'stroke' | 'bg' | 'shadow'>('none');
  const [activeSlider, setActiveSlider] = useState<'none' | 'strokeWidth' | 'bgOpacity' | 'shadowConfig'>('none');
  const [activeCustomPicker, setActiveCustomPicker] = useState<'none' | 'fill' | 'stroke' | 'bg' | 'shadow'>('none');

  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!imageOverlay.imageUrl) {
      setImageAspectRatio(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      setImageAspectRatio(ratio);
      setImageOverlayBox((prev) => ({
        ...prev,
        height: prev.width / ratio
      }));
    };
    img.src = imageOverlay.imageUrl;
  }, [imageOverlay.imageUrl]);

  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!editingItem) return;
    setName(editingItem.name);
    setHole(editingItem.hole);
    if (editingItem.extra_config) {
      const cfg = editingItem.extra_config;
      if (cfg.theme) setTheme(cfg.theme);
      if (cfg.profileName) setProfileName(cfg.profileName);
      if (cfg.profileUsername) setProfileUsername(cfg.profileUsername);
      if (cfg.profileImage) setProfileImage(cfg.profileImage);
      if (cfg.profileVerified !== undefined) setProfileVerified(cfg.profileVerified);
      if (cfg.textOverlay) setTextOverlay(cfg.textOverlay);
      if (cfg.textOverlayBox) setTextOverlayBox(cfg.textOverlayBox);
      if (cfg.imageOverlay) setImageOverlay(cfg.imageOverlay);
      if (cfg.imageOverlayBox) setImageOverlayBox(cfg.imageOverlayBox);
    } else {
      // Trigger dynamic backend template scan
      setScanning(true);
      fetch(`${API_BASE_URL}/api/editor/templates/${editingItem.id}/scan`, { method: 'POST' })
        .then(async (res) => {
          if (!res.ok) throw new Error('Falha no escaneamento.');
          return res.json();
        })
        .then((data) => {
          if (data.profileName) setProfileName(data.profileName);
          if (data.profileUsername) setProfileUsername(data.profileUsername);
          if (data.profileVerified !== undefined) setProfileVerified(data.profileVerified);
          if (data.profileImage) setProfileImage(data.profileImage);
          if (data.text) {
            setTextOverlay((prev) => ({ ...prev, enabled: true, text: data.text }));
          } else {
            setTextOverlay((prev) => ({ ...prev, enabled: false }));
          }
        })
        .catch((err) => {
          console.error("Scan error:", err);
          // Fallback to name-based defaults
          setProfileName(editingItem.name);
          setProfileUsername('@' + editingItem.name.toLowerCase().replace(/\s+/g, ''));
          setProfileVerified(false);
          setProfileImage(null);
        })
        .finally(() => {
          setScanning(false);
        });
    }
  }, [editingItem]);

  const [selectedId, setSelectedId] = useState<string>('');
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const displayedUsername = profileUsername.startsWith('@') ? profileUsername : `@${profileUsername}`;

  useEffect(() => {
    if (!interaction) return;
    const move = (event: PointerEvent) => {
      const bounds = previewRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const dx = (event.clientX - interaction.startX) * CANVAS_WIDTH / bounds.width;
      const dy = (event.clientY - interaction.startY) * CANVAS_HEIGHT / bounds.height;
      let next = { ...interaction.initial };

      if (interaction.mode === 'move') {
        next = {
          ...interaction.initial,
          x: Math.max(0, Math.min(CANVAS_WIDTH - interaction.initial.width, interaction.initial.x + dx)),
          y: Math.max(0, Math.min(CANVAS_HEIGHT - interaction.initial.height, interaction.initial.y + dy)),
        };
      } else {
        // Symmetric resizing from center
        const initialCx = interaction.initial.x + interaction.initial.width / 2;
        const initialCy = interaction.initial.y + interaction.initial.height / 2;
        
        const handle = interaction.handle || 'se';
        let factorX = handle.includes('w') ? -1 : 1;
        let factorY = handle.includes('n') ? -1 : 1;
        
        let newWidth = Math.max(50, Math.min(CANVAS_WIDTH, interaction.initial.width + dx * 2 * factorX));
        let newHeight = interaction.initial.height;
        
        if (interaction.mode === 'resize') {
          newHeight = Math.max(20, Math.min(CANVAS_HEIGHT, interaction.initial.height + dy * 2 * factorY));
        }

        // Keep aspect ratio for image overlay
        if (interaction.target === 'imageOverlay' && imageAspectRatio) {
          newHeight = newWidth / imageAspectRatio;
        }

        // Scale font size proportionally for text overlay
        if (interaction.target === 'textOverlay' && interaction.initialFontSize) {
          const scale = newWidth / interaction.initial.width;
          newHeight = interaction.initial.height * scale;
          const newFontSize = Math.max(4, Math.min(120, Math.round(interaction.initialFontSize * scale)));
          setTextOverlay((prev) => ({ ...prev, size: newFontSize }));
        }

        next = {
          x: Math.max(0, Math.min(CANVAS_WIDTH - newWidth, initialCx - newWidth / 2)),
          y: Math.max(0, Math.min(CANVAS_HEIGHT - newHeight, initialCy - newHeight / 2)),
          width: newWidth,
          height: newHeight,
        };
      }

      if (interaction.target === 'hole') setHole(next);
      else if (interaction.target === 'textOverlay') setTextOverlayBox(next);
      else if (interaction.target === 'imageOverlay') setImageOverlayBox(next);
    };
    const stop = () => setInteraction(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
  }, [interaction, imageAspectRatio]);

  useEffect(() => {
    const handleOutsideClick = (e: PointerEvent) => {
      if (interaction) return;
      if (previewRef.current && previewRef.current.contains(e.target as Node)) {
        return;
      }
      setSelectedId('');
    };

    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [interaction]);

  const beginInteraction = (event: React.PointerEvent, target: 'hole' | 'textOverlay' | 'imageOverlay' | string, mode: 'move' | 'resize' | 'resize-side', box: BoundingBox, handle?: string) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(target);
    setInteraction({
      target,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      initial: { ...box },
      initialFontSize: target === 'textOverlay' ? textOverlay.size : undefined,
      handle,
    });
  };

  const handleWatermarkImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageOverlay((prev) => ({ ...prev, enabled: true, imageUrl: url }));
    setWatermarkFile(file);
    e.target.value = '';
  };

  const exportTemplate = async () => {
    if (!name.trim()) { setError('Informe um nome para salvar o template.'); return; }
    setSaving(true);
    setError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Não foi possível criar a imagem.');

      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (profileImage) {
        drawCircularImage(ctx, await loadImage(getProfileImageSrc(profileImage)), PROFILE_IMAGE_BOX);
      } else {
        ctx.fillStyle = '#E5E7EB';
        ctx.beginPath();
        ctx.arc(PROFILE_IMAGE_BOX.x + PROFILE_IMAGE_BOX.width / 2, PROFILE_IMAGE_BOX.y + PROFILE_IMAGE_BOX.height / 2, PROFILE_IMAGE_BOX.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#64748B';
        ctx.font = '700 82px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((profileName.trim()[0] || '?').toUpperCase(), PROFILE_IMAGE_BOX.x + PROFILE_IMAGE_BOX.width / 2, PROFILE_IMAGE_BOX.y + PROFILE_IMAGE_BOX.height / 2);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = textColor;
      ctx.font = '700 78px system-ui, sans-serif';
      ctx.fillText(profileName.trim() || 'Nome do perfil', 350, 105, 610);
      const nameWidth = Math.min(ctx.measureText(profileName.trim() || 'Nome do perfil').width, 610);
      if (profileVerified) {
        const badgeX = Math.min(985, 350 + nameWidth + 40);
        const badgeY = 145;
        drawVerifiedBadge(ctx, badgeX, badgeY, 34);
      }
      ctx.fillStyle = usernameColor;
      ctx.font = '400 58px system-ui, sans-serif';
      ctx.fillText(displayedUsername, 350, 210, 630);

      // Render Text Overlay to canvas if enabled
      if (textOverlay.enabled && textOverlay.text) {
        const content = transformText(textOverlay.text, textOverlay.caseMode);
        if (content) {
          ctx.save();
          const textAlpha = (textOverlay.opacity ?? 100) / 100;
          ctx.globalAlpha = textAlpha;
          const fontSize = (textOverlay.size || 16) * 3.5;
          const fontFamily = textOverlay.fontFamily || 'Arial';
          const fontWeight = textOverlay.bold ? '700' : '400';
          ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
          ctx.textAlign = (textOverlay.align || 'center') as CanvasTextAlign;
          ctx.textBaseline = 'top';

          const lines = content.split('\n');
          const lineSpacing = (textOverlay.lineSpacing ?? 0) * 0.5;
          const lineHeight = fontSize * 1.2 + lineSpacing;

          let startX = textOverlayBox.x;
          if (textOverlay.align === 'center') startX = textOverlayBox.x + textOverlayBox.width / 2;
          else if (textOverlay.align === 'right') startX = textOverlayBox.x + textOverlayBox.width;

          if (textOverlay.bgColor) {
            ctx.fillStyle = textOverlay.bgColor;
            ctx.globalAlpha = ((textOverlay.bgOpacity ?? 60) / 100) * textAlpha;
            ctx.fillRect(textOverlayBox.x, textOverlayBox.y, textOverlayBox.width, lines.length * lineHeight + 20);
            ctx.globalAlpha = textAlpha;
          }

          if (textOverlay.useShadow) {
            ctx.shadowColor = textOverlay.shadowColor || '#000000';
            ctx.shadowBlur = textOverlay.shadowBlur ?? 7;
            const angleRad = ((textOverlay.shadowAngle ?? 45) * Math.PI) / 180;
            const dist = textOverlay.shadowDistance ?? 6;
            ctx.shadowOffsetX = Math.cos(angleRad) * dist;
            ctx.shadowOffsetY = Math.sin(angleRad) * dist;
          }

          lines.forEach((line, idx) => {
            const y = textOverlayBox.y + idx * lineHeight;
            if (textOverlay.strokeEnabled) {
              ctx.strokeStyle = textOverlay.strokeColor || '#000000';
              ctx.lineWidth = (textOverlay.strokeWidth ?? 3) * 2;
              ctx.lineJoin = 'round';
              ctx.strokeText(line, startX, y, textOverlayBox.width);
            }
            ctx.fillStyle = textOverlay.color || '#ffffff';
            ctx.fillText(line, startX, y, textOverlayBox.width);
          });
          ctx.restore();
        }
      }

      // Render Image Overlay to canvas if enabled
      if (imageOverlay.enabled && imageOverlay.imageUrl) {
        ctx.save();
        ctx.globalAlpha = (imageOverlay.opacity ?? 100) / 100;
        const img = await loadImage(getProfileImageSrc(imageOverlay.imageUrl));
        drawImageContain(ctx, img, imageOverlayBox.x, imageOverlayBox.y, imageOverlayBox.width, imageOverlayBox.height);
        ctx.restore();
      }

      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Falha ao exportar PNG.')), 'image/png'));
      const safeName = name.trim().replace(/[\\/:*?"<>|]+/g, '-');
      const file = new File([blob], `${safeName}.png`, { type: 'image/png' });
      
      const configObj = {
        theme,
        profileName,
        profileUsername,
        profileVerified,
        profileImage,
        textOverlay,
        textOverlayBox,
        imageOverlay,
        imageOverlayBox
      };
      const extraConfigStr = JSON.stringify(configObj);

      if (editingItem) {
        const data = new FormData();
        data.append('file', file);
        data.append('name', safeName);
        data.append('hole_x', String(Math.round(hole.x)));
        data.append('hole_y', String(Math.round(hole.y)));
        data.append('hole_width', String(Math.round(hole.width)));
        data.append('hole_height', String(Math.round(hole.height)));
        data.append('extra_config', extraConfigStr);
        if (profileImageFile) {
          data.append('profile_image', profileImageFile);
        }
        if (watermarkFile) {
          data.append('watermark_image', watermarkFile);
        }
        const response = await fetch(`${API_BASE_URL}/api/editor/templates/${editingItem.id}`, { method: 'PUT', body: data });
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          throw new Error(detail?.detail || 'Não foi possível atualizar o template.');
        }
        const updatedItem = await response.json() as TemplateLibraryItem;
        onApply({
          file,
          objectUrl: URL.createObjectURL(blob),
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          hole,
          hasAlpha: false
        });
      } else {
        await saveTemplate(file, safeName, 'created', hole, extraConfigStr, profileImageFile, watermarkFile);
        onApply({ file, objectUrl: URL.createObjectURL(blob), width: CANVAS_WIDTH, height: CANVAS_HEIGHT, hole, hasAlpha: false });
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o template.');
    } finally { setSaving(false); }
  };

  const transformedPreviewText = transformText(textOverlay.text, textOverlay.caseMode);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex flex-wrap items-center gap-3 pr-10">
        <button type="button" onClick={onBack} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1"><h2 className="text-lg font-bold">Criar Template</h2><p className="text-xs text-[#86868B]">Adicione foto, nome, usuário, textos e logos ao modelo pronto e personalize como quiser.</p></div>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome do template" aria-label="Nome do template" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-[#0071E3] sm:w-48" />
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[340px_minmax(280px,1fr)] lg:overflow-hidden">
        {/* Left Control Sidebar */}
        <aside className="space-y-4 overflow-y-visible rounded-2xl border border-slate-200 bg-[#F5F5F7] p-4 lg:overflow-y-auto">
          {/* Perfil Section */}
          <section className="bg-white rounded-2xl p-4 border border-slate-200">
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#86868B]">Perfil</h3>
            <div className="mb-3 flex items-center gap-3">
              <button type="button" onClick={() => profileImageInputRef.current?.click()} className="flex h-12 w-12 flex-none items-center justify-center overflow-hidden rounded-full border-2 border-white bg-slate-200 shadow-sm" aria-label="Adicionar foto do perfil">
                {profileImage ? <img src={getProfileImageSrc(profileImage)} alt="Foto do perfil" className="h-full w-full object-cover" /> : <UserRound className="h-5 w-5 text-slate-500" />}
              </button>
              <button type="button" onClick={() => profileImageInputRef.current?.click()} className="flex-1 rounded-lg border bg-slate-50 px-2 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-100">Adicionar foto</button>
              <input ref={profileImageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setProfileImage(URL.createObjectURL(file)); setProfileImageFile(file); } event.target.value = ''; }} />
            </div>
            <label className="mb-2 block text-[9px] font-bold text-slate-600">Nome<input value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength={40} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#0071E3]" /></label>
            <label className="mb-2 block text-[9px] font-bold text-slate-600">Usuário<input value={profileUsername} onChange={(event) => setProfileUsername(event.target.value)} maxLength={40} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#0071E3]" /></label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[9px] font-bold text-slate-600"><input type="checkbox" checked={profileVerified} onChange={(event) => setProfileVerified(event.target.checked)} className="accent-[#2196F3]" /><BadgeCheck className="h-4 w-4 text-[#2196F3]" /> Selo de verificação</label>
          </section>

          {/* Tema Section */}
          <section className="bg-white rounded-2xl p-4 border border-slate-200">
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[#86868B]">Tema do Template</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-bold transition-all ${
                  theme === 'light'
                    ? 'border-[#0071E3] bg-[#0071E3]/5 text-[#0071E3]'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Sun className="h-4 w-4" /> Claro
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-bold transition-all ${
                  theme === 'dark'
                    ? 'border-[#0071E3] bg-[#0071E3]/5 text-[#0071E3]'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Moon className="h-4 w-4" /> Escuro
              </button>
            </div>
          </section>

          {/* OPÇÕES DE TEXTO / MARCA D'ÁGUA Section (identical to Editor.tsx) */}
          <section className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col gap-4 text-[#1D1D1F]">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-[#0071E3]" />
                <h3 className="font-semibold text-xs tracking-[0.15em] text-[#86868B] uppercase">Adicionar Texto</h3>
              </div>
              <button
                type="button"
                onClick={() => setTextOverlay((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`px-2 py-1 rounded-full text-[8px] font-bold tracking-wider font-mono uppercase transition-all duration-300 cursor-pointer ${
                  textOverlay.enabled ? 'bg-emerald-500 text-white shadow-sm' : 'bg-[#86868B]/10 text-[#86868B] hover:bg-[#86868B]/20'
                }`}
              >
                {textOverlay.enabled ? 'ATIVADO' : 'DESATIVADO'}
              </button>
            </div>

            {textOverlay.enabled ? (
              <div className="flex flex-col gap-3.5 text-xs">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="overlay-text-input" className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Texto do Vídeo</label>
                  <div className="flex flex-col rounded-xl border border-slate-200 shadow-sm bg-white relative z-10">
                    <textarea
                      id="overlay-text-input"
                      value={textOverlay.text}
                      onChange={(e) => setTextOverlay((prev) => ({ ...prev, text: e.target.value }))}
                      placeholder="Digite seu texto, cupom ou @usuário..."
                      className="w-full h-20 px-3 py-2 bg-white text-slate-800 border-0 text-xs outline-none resize-none focus:ring-0 placeholder-slate-400 font-medium rounded-t-xl"
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
                <div className="flex gap-2 mt-2 pt-3 border-t border-black/5 items-center">
                  {/* Negrito Button */}
                  <button
                    type="button"
                    onClick={() => setTextOverlay((prev) => ({ ...prev, bold: !prev.bold }))}
                    className={`w-[32px] h-[29px] rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer transition-all border ${
                      textOverlay.bold ? 'bg-[#0071E3] text-white border-[#0071E3]' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                    title="Negrito"
                  >
                    N
                  </button>

                  {/* Alinhamento Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setAlignDropdownOpen(!alignDropdownOpen); setCaseDropdownOpen(false); setSpacingDropdownOpen(false); }}
                      className={`w-[32px] h-[29px] rounded-lg flex items-center justify-center cursor-pointer transition-all border ${
                        alignDropdownOpen ? 'bg-[#0071E3] text-white border-[#0071E3]' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
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
                                onClick={() => { setTextOverlay((prev) => ({ ...prev, align: opt.value as any })); setAlignDropdownOpen(false); }}
                                className={`px-3 py-2 text-left rounded-xl transition-all cursor-pointer flex items-center gap-2.5 font-medium ${
                                  active ? 'text-[#0071E3] font-bold bg-[#F5F5F7]' : 'text-[#1D1D1F] hover:text-[#0071E3] hover:bg-[#F5F5F7]'
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
                      onClick={() => { setCaseDropdownOpen(!caseDropdownOpen); setAlignDropdownOpen(false); setSpacingDropdownOpen(false); }}
                      className={`w-[32px] h-[29px] rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer transition-all border ${
                        caseDropdownOpen ? 'bg-[#0071E3] text-white border-[#0071E3]' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
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
                              onClick={() => { setTextOverlay((prev) => ({ ...prev, caseMode: opt.value as any })); setCaseDropdownOpen(false); }}
                              className={`px-3 py-1.5 text-left rounded-xl transition-all cursor-pointer font-medium ${
                                (textOverlay.caseMode || 'normal') === opt.value ? 'text-[#0071E3] font-bold bg-[#F5F5F7]' : 'text-[#1D1D1F] hover:text-[#0071E3] hover:bg-[#F5F5F7]'
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
                      onClick={() => { setSpacingDropdownOpen(!spacingDropdownOpen); setAlignDropdownOpen(false); setCaseDropdownOpen(false); }}
                      className={`w-[32px] h-[29px] rounded-lg flex items-center justify-center cursor-pointer transition-all border ${
                        spacingDropdownOpen ? 'bg-[#0071E3] text-white border-[#0071E3]' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
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

                {/* Estilo section */}
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
                          shadowColor: '#000000',
                          shadowOpacity: 80,
                          shadowBlur: 7,
                          shadowDistance: 6,
                          shadowAngle: 45,
                          bold: false,
                        }));
                        setActivePicker('none');
                        setActiveSlider('none');
                      }}
                      className="text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
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
                          onClick={() => { setActivePicker(activePicker === 'fill' ? 'none' : 'fill'); setActiveSlider('none'); }}
                          className="w-6 h-6 rounded border border-slate-300 shadow-sm transition-all hover:scale-105 cursor-pointer relative overflow-hidden flex items-center justify-center"
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
                            {textOverlay.color === c.hex && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.hex === '#ffffff' ? '#000000' : '#ffffff' }} />}
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
                          className="w-6 h-6 rounded border border-slate-300 shadow-sm transition-all hover:scale-105 cursor-pointer relative overflow-hidden flex items-center justify-center bg-transparent"
                          style={{ backgroundColor: textOverlay.strokeEnabled ? textOverlay.strokeColor || '#000000' : 'transparent' }}
                        >
                          {!textOverlay.strokeEnabled && (
                            <svg className="w-full h-full stroke-slate-500/85 stroke-[1.5]" viewBox="0 0 24 24" fill="none"><line x1="2" y1="22" x2="22" y2="2" /></svg>
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
                            {textOverlay.strokeColor === stC.hex && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: stC.hex === '#ffffff' ? '#000000' : '#ffffff' }} />}
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
                          <span className="bg-white px-2 py-0.5 rounded-md border border-[#E8E8EA] text-[#0071E3] font-mono text-[11px] font-bold shadow-2xs min-w-[36px] text-center">{textOverlay.strokeWidth ?? 3}px</span>
                        </div>
                        <input
                          type="range" min="1" max="10" value={textOverlay.strokeWidth ?? 3}
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
                            const hasBg = !!textOverlay.bgColor;
                            setTextOverlay((prev) => ({ ...prev, bgColor: hasBg ? '' : '#000000', bgOpacity: prev.bgOpacity ?? 60 }));
                            setActivePicker(hasBg ? 'none' : 'bg');
                            setActiveSlider('none');
                          }}
                          className="w-6 h-6 rounded border border-slate-300 shadow-sm transition-all hover:scale-105 cursor-pointer relative overflow-hidden flex items-center justify-center bg-transparent"
                          style={{ backgroundColor: textOverlay.bgColor || 'transparent' }}
                        >
                          {!textOverlay.bgColor && (
                            <svg className="w-full h-full stroke-slate-500/85 stroke-[1.5]" viewBox="0 0 24 24" fill="none"><line x1="2" y1="22" x2="22" y2="2" /></svg>
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
                    {activePicker === 'bg' && !!textOverlay.bgColor && (
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
                            {textOverlay.bgColor === bgC.hex && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: bgC.hex === '#ffffff' ? '#000000' : '#ffffff' }} />}
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
                          <span className="bg-white px-2 py-0.5 rounded-md border border-[#E8E8EA] text-[#0071E3] font-mono text-[11px] font-bold shadow-2xs min-w-[42px] text-center">{textOverlay.bgOpacity ?? 60}%</span>
                        </div>
                        <input
                          type="range" min="10" max="100" value={textOverlay.bgOpacity ?? 60}
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
                            const isShadow = !textOverlay.useShadow;
                            setTextOverlay((prev) => ({ ...prev, useShadow: isShadow, shadowColor: prev.shadowColor || '#000000' }));
                            setActivePicker(isShadow ? 'shadow' : 'none');
                            setActiveSlider('none');
                          }}
                          className="w-6 h-6 rounded border border-slate-300 shadow-sm transition-all hover:scale-105 cursor-pointer relative overflow-hidden flex items-center justify-center bg-transparent"
                          style={{ backgroundColor: textOverlay.useShadow ? textOverlay.shadowColor || '#000000' : 'transparent' }}
                        >
                          {!textOverlay.useShadow && (
                            <svg className="w-full h-full stroke-slate-500/85 stroke-[1.5]" viewBox="0 0 24 24" fill="none"><line x1="2" y1="22" x2="22" y2="2" /></svg>
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
                            {textOverlay.shadowColor === shC.hex && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: shC.hex === '#ffffff' ? '#000000' : '#ffffff' }} />}
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
                              {textOverlay.shadowOpacity ?? 80}%
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
                            <span className="bg-white px-2 py-0.5 rounded-md border border-[#E8E8EA] text-[#0071E3] font-mono text-[11px] font-bold shadow-2xs min-w-[42px] text-center">{textOverlay.shadowBlur ?? 7}%</span>
                          </div>
                          <input
                            type="range" min="0" max="20" value={textOverlay.shadowBlur ?? 7}
                            onChange={(e) => setTextOverlay((prev) => ({ ...prev, shadowBlur: parseInt(e.target.value) }))}
                            className="w-full cursor-pointer accent-[#0071E3] h-1.5 bg-[#E8E8EA] rounded-lg appearance-none transition-all"
                          />
                        </div>

                        {/* Distance slider */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between items-center text-xs font-semibold text-[#1D1D1F]">
                            <span>Distância</span>
                            <span className="bg-white px-2 py-0.5 rounded-md border border-[#E8E8EA] text-[#0071E3] font-mono text-[11px] font-bold shadow-2xs min-w-[42px] text-center">{textOverlay.shadowDistance ?? 6}</span>
                          </div>
                          <input
                            type="range" min="0" max="30" value={textOverlay.shadowDistance ?? 6}
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
          </section>

          {/* OPÇÕES DE IMAGEM / LOGO Section (identical to Editor.tsx) */}
          <section className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col gap-4 text-[#1D1D1F]">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#0071E3]" />
                <h3 className="font-semibold text-xs tracking-[0.15em] text-[#86868B] uppercase">Adicionar Imagem</h3>
              </div>
              <button
                type="button"
                onClick={() => setImageOverlay((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`px-2 py-1 rounded-full text-[8px] font-bold tracking-wider font-mono uppercase transition-all duration-300 cursor-pointer ${
                  imageOverlay.enabled ? 'bg-emerald-500 text-white shadow-sm' : 'bg-[#86868B]/10 text-[#86868B] hover:bg-[#86868B]/20'
                }`}
              >
                {imageOverlay.enabled ? 'ATIVADO' : 'DESATIVADO'}
              </button>
            </div>

            {imageOverlay.enabled ? (
              <div className="flex flex-col gap-3.5 text-xs">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Imagem da Marca d'água / Logo</span>
                  {imageOverlay.imageUrl ? (
                    <div className="relative group rounded-lg overflow-hidden border border-black/10 bg-[#F5F5F7] flex items-center justify-center p-3 h-24">
                      <img src={getProfileImageSrc(imageOverlay.imageUrl)} alt="Watermark preview" className="max-h-full max-w-full object-contain" style={{ opacity: (imageOverlay.opacity ?? 100) / 100 }} />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                         <label className="bg-white/90 hover:bg-white text-slate-950 font-bold text-[9px] px-2 py-1 rounded cursor-pointer transition-colors shadow-sm">
                           Alterar
                           <input type="file" accept="image/*" onChange={handleWatermarkImageChange} className="hidden" />
                         </label>
                         <button
                           type="button"
                           onClick={() => { setImageOverlay((prev) => ({ ...prev, imageUrl: null })); setWatermarkFile(null); }}
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
                      <input ref={watermarkInputRef} type="file" accept="image/*" onChange={handleWatermarkImageChange} className="hidden" />
                    </label>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-[#86868B] uppercase tracking-wider">
                    <span>Opacidade da Imagem</span>
                    <span className="text-[#0071E3]">{imageOverlay.opacity ?? 100}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={imageOverlay.opacity ?? 100}
                    onChange={(e) => setImageOverlay((prev) => ({ ...prev, opacity: parseInt(e.target.value) }))}
                    className="w-full cursor-pointer accent-[#0071E3] mt-1"
                  />
                </div>
              </div>
            ) : null}
          </section>
        </aside>

        {/* Main Canvas Preview */}
        <main className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-2xl bg-slate-900 p-4">
          <div
            ref={previewRef}
            onPointerDown={() => setSelectedId('')}
            style={{ aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}`, backgroundColor }}
            className="relative h-full max-h-[68vh] max-w-full touch-none overflow-hidden bg-cover bg-center shadow-2xl [container-type:inline-size]"
          >
            {scanning && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-center p-6 select-none">
                <LoaderCircle className="w-10 h-10 text-[#0071E3] animate-spin mb-3" />
                <strong className="text-white text-[4cqw] font-bold uppercase tracking-widest font-mono">Escaneando Template...</strong>
                <p className="text-slate-400 text-[2.8cqw] mt-1">Identificando perfil e extraindo textos de forma inteligente</p>
              </div>
            )}

            {/* Header Profile Info */}
            <div className="pointer-events-none absolute left-[8.333%] top-[4.688%] h-[11.458%] w-[20.37%] overflow-hidden rounded-full bg-slate-200 shadow-sm">
              {profileImage ? <img src={getProfileImageSrc(profileImage)} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[7cqw] font-bold text-slate-500">{(profileName.trim()[0] || '?').toUpperCase()}</div>}
            </div>
            <div className="pointer-events-none absolute left-[32.407%] top-[5.469%] flex max-w-[62%] items-center gap-[1.2cqw] whitespace-nowrap leading-none" style={{ fontSize: '7.22cqw', fontFamily: 'system-ui, sans-serif', fontWeight: 700, color: textColor }}>
              <span className="min-w-0 overflow-hidden text-ellipsis">{profileName.trim() || 'Nome do perfil'}</span>
              {profileVerified ? <span className="flex h-[6.3cqw] w-[6.3cqw] flex-none items-center justify-center bg-[#2196F3] text-[4cqw] font-bold leading-none text-white drop-shadow-sm" style={{ clipPath: VERIFIED_BADGE_CLIP }}>✓</span> : null}
            </div>
            <div className="pointer-events-none absolute left-[32.407%] top-[10.938%] max-w-[62%] overflow-hidden text-ellipsis whitespace-nowrap leading-none" style={{ fontSize: '5.37cqw', fontFamily: 'system-ui, sans-serif', fontWeight: 400, color: usernameColor }}>{displayedUsername}</div>

            {/* Interactive Text Overlay Box on Canvas */}
            {textOverlay.enabled && (
              <div
                onPointerDown={(e) => beginInteraction(e, 'textOverlay', 'move', textOverlayBox)}
                style={{
                  left: `${(textOverlayBox.x / CANVAS_WIDTH) * 100}%`,
                  top: `${(textOverlayBox.y / CANVAS_HEIGHT) * 100}%`,
                  width: `${(textOverlayBox.width / CANVAS_WIDTH) * 100}%`,
                  height: `${(textOverlayBox.height / CANVAS_HEIGHT) * 100}%`,
                }}
                className="absolute z-30 pointer-events-auto select-none"
              >
                <div
                  className={`relative p-1 min-h-[30px] flex items-center border ${
                    textOverlay.align === 'left' ? 'justify-start' : textOverlay.align === 'right' ? 'justify-end' : 'justify-center'
                  } ${
                    selectedId === 'textOverlay' ? 'border-cyan-400 bg-black/5 hover:bg-black/10 cursor-move' : 'border-transparent'
                  }`}
                >
                  {selectedId === 'textOverlay' && (
                    <>
                      {/* Corner Handles */}
                      <div onPointerDown={(e) => beginInteraction(e, 'textOverlay', 'resize', textOverlayBox, 'nw')} className="absolute top-0 left-0 w-2.5 h-2.5 bg-white border border-cyan-400 rounded-full -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize z-40" />
                      <div onPointerDown={(e) => beginInteraction(e, 'textOverlay', 'resize', textOverlayBox, 'ne')} className="absolute top-0 right-0 w-2.5 h-2.5 bg-white border border-cyan-400 rounded-full translate-x-1/2 -translate-y-1/2 cursor-nesw-resize z-40" />
                      <div onPointerDown={(e) => beginInteraction(e, 'textOverlay', 'resize', textOverlayBox, 'sw')} className="absolute bottom-0 left-0 w-2.5 h-2.5 bg-white border border-cyan-400 rounded-full -translate-x-1/2 translate-y-1/2 cursor-nesw-resize z-40" />
                      <div onPointerDown={(e) => beginInteraction(e, 'textOverlay', 'resize', textOverlayBox, 'se')} className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-white border border-cyan-400 rounded-full translate-x-1/2 translate-y-1/2 cursor-nwse-resize z-40" />

                      {/* Side Handles (Middle Left/Right) */}
                      <div onPointerDown={(e) => beginInteraction(e, 'textOverlay', 'resize-side', textOverlayBox, 'w')} className="absolute top-1/2 left-0 w-1.5 h-3 bg-white border border-cyan-400 rounded -translate-x-1/2 -translate-y-1/2 cursor-ew-resize z-40" />
                      <div onPointerDown={(e) => beginInteraction(e, 'textOverlay', 'resize-side', textOverlayBox, 'e')} className="absolute top-1/2 right-0 w-1.5 h-3 bg-white border border-cyan-400 rounded translate-x-1/2 -translate-y-1/2 cursor-ew-resize z-40" />
                    </>
                  )}

                  <div
                    className="w-full break-words leading-tight"
                    style={{
                      color: textOverlay.color || '#ffffff',
                      opacity: (textOverlay.opacity ?? 100) / 100,
                      fontFamily: textOverlay.fontFamily || 'Arial',
                      fontWeight: textOverlay.bold ? 700 : 400,
                      textAlign: textOverlay.align || 'center',
                      fontSize: `${((textOverlay.size || 16) * 3.5) / CANVAS_WIDTH * 100}cqw`,
                      backgroundColor: textOverlay.bgColor ? hexToRgba(textOverlay.bgColor, textOverlay.bgOpacity ?? 60) : undefined,
                      WebkitTextStroke: textOverlay.strokeEnabled ? `${(textOverlay.strokeWidth ?? 3) * 0.4}px ${textOverlay.strokeColor || '#000000'}` : '0px transparent',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      letterSpacing: `${(textOverlay.letterSpacing ?? 0) * 3.5 / CANVAS_WIDTH * 100}cqw`,
                      lineHeight: `${((textOverlay.size || 16) * 3.5 * 1.2 + (textOverlay.lineSpacing ?? 0) * 0.5) / CANVAS_WIDTH * 100}cqw`,
                      textShadow: textOverlay.useShadow
                        ? `${Math.cos(((textOverlay.shadowAngle ?? 45) * Math.PI) / 180) * (textOverlay.shadowDistance ?? 6) * 3.5 / CANVAS_WIDTH * 100}cqw ${Math.sin(((textOverlay.shadowAngle ?? 45) * Math.PI) / 180) * (textOverlay.shadowDistance ?? 6) * 3.5 / CANVAS_WIDTH * 100}cqw ${(textOverlay.shadowBlur ?? 7) * 3.5 / CANVAS_WIDTH * 100}cqw ${textOverlay.shadowColor || '#000000'}`
                        : undefined,
                    }}
                  >
                    {transformedPreviewText || 'DIGITE SEU TEXTO AQUI'}
                  </div>
                </div>
              </div>
            )}

            {/* Interactive Image Overlay Box on Canvas */}
            {imageOverlay.enabled && imageOverlay.imageUrl && (
              <div
                onPointerDown={(e) => beginInteraction(e, 'imageOverlay', 'move', imageOverlayBox)}
                style={{
                  left: `${(imageOverlayBox.x / CANVAS_WIDTH) * 100}%`,
                  top: `${(imageOverlayBox.y / CANVAS_HEIGHT) * 100}%`,
                  width: `${(imageOverlayBox.width / CANVAS_WIDTH) * 100}%`,
                  height: `${(imageOverlayBox.height / CANVAS_HEIGHT) * 100}%`,
                }}
                className={`absolute z-30 pointer-events-auto flex items-center justify-center border ${
                  selectedId === 'imageOverlay' ? 'border-cyan-400 bg-black/5 hover:bg-black/10 cursor-move' : 'border-transparent'
                }`}
              >
                {selectedId === 'imageOverlay' && (
                  <>
                    {/* Corner Handles */}
                    <div onPointerDown={(e) => beginInteraction(e, 'imageOverlay', 'resize', imageOverlayBox, 'nw')} className="absolute top-0 left-0 w-2.5 h-2.5 bg-white border border-cyan-400 rounded-full -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize z-40" />
                    <div onPointerDown={(e) => beginInteraction(e, 'imageOverlay', 'resize', imageOverlayBox, 'ne')} className="absolute top-0 right-0 w-2.5 h-2.5 bg-white border border-cyan-400 rounded-full translate-x-1/2 -translate-y-1/2 cursor-nesw-resize z-40" />
                    <div onPointerDown={(e) => beginInteraction(e, 'imageOverlay', 'resize', imageOverlayBox, 'sw')} className="absolute bottom-0 left-0 w-2.5 h-2.5 bg-white border border-cyan-400 rounded-full -translate-x-1/2 translate-y-1/2 cursor-nesw-resize z-40" />
                    <div onPointerDown={(e) => beginInteraction(e, 'imageOverlay', 'resize', imageOverlayBox, 'se')} className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-white border border-cyan-400 rounded-full translate-x-1/2 translate-y-1/2 cursor-nwse-resize z-40" />

                    {/* Side Handles */}
                    <div onPointerDown={(e) => beginInteraction(e, 'imageOverlay', 'resize-side', imageOverlayBox, 'w')} className="absolute top-1/2 left-0 w-1.5 h-3 bg-white border border-cyan-400 rounded -translate-x-1/2 -translate-y-1/2 cursor-ew-resize z-40" />
                    <div onPointerDown={(e) => beginInteraction(e, 'imageOverlay', 'resize-side', imageOverlayBox, 'e')} className="absolute top-1/2 right-0 w-1.5 h-3 bg-white border border-cyan-400 rounded translate-x-1/2 -translate-y-1/2 cursor-ew-resize z-40" />
                  </>
                )}
                <img
                  src={getProfileImageSrc(imageOverlay.imageUrl)}
                  alt="Overlay"
                  className="w-full h-full object-contain select-none pointer-events-none"
                  style={{ opacity: (imageOverlay.opacity ?? 100) / 100 }}
                  draggable={false}
                />
              </div>
            )}
          </div>
        </main>
      </div>

      {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={onBack} className="rounded-xl bg-slate-100 px-5 py-2.5 text-xs font-bold hover:bg-slate-200 transition-colors">Cancelar</button>
        <button type="button" disabled={saving || scanning} onClick={exportTemplate} className="flex items-center gap-2 rounded-xl bg-[#0071E3] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#0077ED] transition-colors disabled:opacity-60">
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar e usar
        </button>
      </div>
    </div>
  );
}

export default function TemplateHubModal({ open, onClose, onUploadClick, onApply }: TemplateHubModalProps) {
  const [view, setView] = useState<HubView>('choices');
  const [editingItem, setEditingItem] = useState<TemplateLibraryItem | null>(null);

  const closeModal = useCallback(() => {
    setView('choices');
    setEditingItem(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeModal]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
      <div className="relative flex h-[94vh] w-full max-w-6xl flex-col rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
        <button type="button" onClick={closeModal} className="absolute right-5 top-5 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar modal"><X className="h-5 w-5" /></button>
        {view === 'choices' ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <div className="mx-auto mb-8 max-w-xl text-center">
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#0071E3]/10 px-3 py-1 text-[11px] font-bold text-[#0071E3]"><WandSparkles className="h-3.5 w-3.5" /> Central de Templates</span>
              <h2 className="text-2xl font-bold tracking-tight text-[#1D1D1F] sm:text-3xl">Como você prefere começar?</h2>
              <p className="mt-2 text-xs leading-6 text-[#86868B] sm:text-sm">Escolha se deseja criar um template do zero com dados de perfil ou carregar um arquivo pronto.</p>
            </div>
            <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
              <ChoiceCard icon={<WandSparkles className="h-6 w-6" />} title="Criar Template" description="Monte seu modelo personalizado com foto de perfil, nome, usuário, selo e sobreposição." onClick={() => setView('creator')} />
              <ChoiceCard icon={<FolderOpen className="h-6 w-6" />} title="Abrir Biblioteca" description="Escolha um dos seus templates salvos para usar no lote atual de vídeos." onClick={() => setView('library')} />
              <ChoiceCard icon={<Upload className="h-6 w-6" />} title="Carregar Template" description="Selecione uma imagem PNG, JPG ou WEBP do seu computador." onClick={() => { onUploadClick(); closeModal(); }} />
            </div>
          </div>
        ) : null}
        {view === 'library' ? (
          <TemplateLibrary
            onBack={() => setView('choices')}
            onApply={onApply}
            onClose={closeModal}
            onEdit={(item) => {
              setEditingItem(item);
              setView('creator');
            }}
          />
        ) : null}
        {view === 'creator' ? (
          <TemplateCreator
            onBack={() => {
              if (editingItem) {
                setEditingItem(null);
                setView('library');
              } else {
                setView('choices');
              }
            }}
            onApply={onApply}
            onClose={closeModal}
            editingItem={editingItem}
          />
        ) : null}
      </div>
    </div>,
    document.body
  );
}
