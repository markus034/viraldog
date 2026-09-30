// Canvas & WebGL Defender - Subtitle noise injection to prevent canvas fingerprinting
(function() {
  const script = document.createElement('script');
  script.textContent = `(${function() {
    try {
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

      CanvasRenderingContext2D.prototype.getImageData = function(...args) {
        const imageData = originalGetImageData.apply(this, args);
        // Add minimal imperceptible random noise to 2 pixels
        if (imageData && imageData.data && imageData.data.length > 4) {
          const idx = Math.floor(Math.random() * (imageData.data.length / 4)) * 4;
          imageData.data[idx] = (imageData.data[idx] + 1) % 256;
        }
        return imageData;
      };

      HTMLCanvasElement.prototype.toDataURL = function(...args) {
        const ctx = this.getContext('2d');
        if (ctx) {
          try {
            const img = ctx.getImageData(0, 0, Math.min(this.width, 10), Math.min(this.height, 10));
          } catch(e) {}
        }
        return originalToDataURL.apply(this, args);
      };
    } catch (e) {}
  }})();`;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();
