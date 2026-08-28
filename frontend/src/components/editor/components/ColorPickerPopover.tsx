import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

interface ColorPickerPopoverProps {
  color: string;
  onChange: (color: string) => void;
  onClose: () => void;
}

function hsvToHex(h: number, s: number, v: number): string {
  s /= 100;
  v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
  else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
  else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
  else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
  else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
  else if (h >= 300 && h <= 360) { r = c; g = 0; b = x; }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  let c = (hex || '#000000').replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  if (c.length !== 6) return { h: 0, s: 0, v: 0 };
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;

  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s), v: Math.round(v) };
}

export const ColorPickerPopover: React.FC<ColorPickerPopoverProps> = ({ color, onChange, onClose }) => {
  const initialHsv = hexToHsv(color);
  const [hue, setHue] = useState<number>(initialHsv.h);
  const [sat, setSat] = useState<number>(initialHsv.s);
  const [val, setVal] = useState<number>(initialHsv.v);

  const satValRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef<boolean>(false);

  useEffect(() => {
    const hsv = hexToHsv(color);
    setHue(hsv.h);
    setSat(hsv.s);
    setVal(hsv.v);
  }, [color]);

  const updateColorFromHsv = useCallback((h: number, s: number, v: number) => {
    const newHex = hsvToHex(h, s, v);
    onChange(newHex);
  }, [onChange]);

  const handleSatValMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!satValRef.current) return;
    const rect = satValRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));

    const newSat = Math.round((x / rect.width) * 100);
    const newVal = Math.round((1 - y / rect.height) * 100);

    setSat(newSat);
    setVal(newVal);
    updateColorFromHsv(hue, newSat, newVal);
  }, [hue, updateColorFromHsv]);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    isDragging.current = true;
    handleSatValMove(e.nativeEvent);

    const onMove = (moveEvt: MouseEvent | TouchEvent) => {
      if (isDragging.current) handleSatValMove(moveEvt);
    };

    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
  };

  const handleHueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHue = parseInt(e.target.value);
    setHue(newHue);
    updateColorFromHsv(newHue, sat, val);
  };

  const currentHex = hsvToHex(hue, sat, val).toUpperCase();

  return (
    <>
      {/* Invisible overlay backdrop for closing popover when clicking outside */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="absolute right-0 top-full mt-2 z-50 w-52 bg-white/95 backdrop-blur-xl border border-[#E8E8EA] rounded-2xl shadow-2xl p-3 flex flex-col gap-2.5 select-none animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between text-xs font-semibold text-[#1D1D1F]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentHex }} />
            <span>Escolher Cor</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] transition-all cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 2D Gradient Canvas Saturation/Brightness Box */}
        <div
          ref={satValRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          className="relative w-full h-28 rounded-xl cursor-crosshair overflow-hidden border border-black/10 shadow-inner"
          style={{ backgroundColor: `hsl(${hue}, 100%, 50%)` }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(to right, #ffffff, transparent)' }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(to top, #000000, transparent)' }}
          />
          {/* Handle Ring */}
          <div
            className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${sat}%`,
              top: `${100 - val}%`,
              backgroundColor: currentHex,
            }}
          />
        </div>

        {/* Rainbow Hue Slider */}
        <div className="flex items-center">
          <input
            type="range"
            min="0"
            max="360"
            value={hue}
            onChange={handleHueChange}
            className="w-full h-3 rounded-full appearance-none cursor-pointer border border-black/10 shadow-2xs [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:bg-transparent"
            style={{
              background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
            }}
          />
        </div>

        {/* Clean Footer Bar (Read-only HEX badge + color preview) */}
        <div className="flex items-center justify-between pt-1 border-t border-[#E8E8EA]">
          <span className="text-[11px] font-mono font-bold text-[#86868B] tracking-wide">HEX</span>
          <div className="flex items-center gap-1.5 bg-[#F5F5F7] border border-[#E8E8EA] rounded-full px-2.5 py-0.5 shadow-2xs">
            <span className="text-xs font-mono font-bold text-[#1D1D1F]">{currentHex}</span>
            <span
              className="w-3.5 h-3.5 rounded-full border border-black/10 shadow-2xs"
              style={{ backgroundColor: currentHex }}
            />
          </div>
        </div>
      </div>
    </>
  );
};
