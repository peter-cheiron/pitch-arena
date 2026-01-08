// src/app/services/image-compress.service.ts
import { Injectable } from '@angular/core';

export interface ImageCompressOptions {
  /** Max megapixels (W*H / 1e6). Example: 2.5 => ~2000x1250 */
  maxMP: number;
  /** Max width/height (optional). Use with maxMP if you want both constraints. */
  maxW?: number;
  maxH?: number;
  /** Initial encode quality 0..1 (used before targetBytes search) */
  quality: number;
  /** Prefer WebP (will still pick JPEG if it's smaller / only one works) */
  preferWebP: boolean;
  /** Paint white behind the image to remove alpha (helps JPEG/WebP compress far better) */
  flatten: boolean;
  /**
   * If provided, do a short binary search on quality to keep output <= targetBytes.
   * Example: 350_000 (~342 KB)
   */
  targetBytes?: number;
  /** Floor quality used by binary search (0..1). Default 0.55 */
  minQuality?: number;
}

export interface CompressResult {
  file: File;
  width: number;
  height: number;
  wasResized: boolean;
  mime: string;
  originalBytes: number;
  finalBytes: number;
  ratio: number; // final/original
}

@Injectable({ providedIn: 'root' })
export class ImageCompressService {
  /**
   * Compress an image file with safe browser APIs (works on iPhone Safari).
   * - Resizes to fit maxMP/maxW/maxH
   * - Encodes WebP & JPEG, chooses the smaller
   * - Optionally binary-searches quality to fit targetBytes
   */
  async compress(file: File, opts?: Partial<ImageCompressOptions>): Promise<CompressResult> {
    const o: ImageCompressOptions = {
      maxMP: opts?.maxMP ?? 2.5,       // sensible default for phones
      maxW: opts?.maxW,
      maxH: opts?.maxH,
      quality: opts?.quality ?? 0.8,
      preferWebP: opts?.preferWebP ?? true,
      flatten: opts?.flatten ?? true,
      targetBytes: opts?.targetBytes,  // e.g. 350_000
      minQuality: opts?.minQuality ?? 0.55,
    };

    // 1) Decode
    const src = await this.decodeToBitmap(file);

    // 2) Compute scale
    const scaleByMP = Math.sqrt((o.maxMP * 1_000_000) / (src.width * src.height || 1));
    const scaleByW  = o.maxW ? (o.maxW / src.width)  : 1;
    const scaleByH  = o.maxH ? (o.maxH / src.height) : 1;
    const scale = Math.min(1, scaleByMP, scaleByW, scaleByH);

    const targetW = Math.max(1, Math.round(src.width  * scale));
    const targetH = Math.max(1, Math.round(src.height * scale));
    const wasResized = (targetW !== src.width) || (targetH !== src.height);

    // 3) Draw (progressive downscale for better quality)
    const canvas = await this.drawDownscaled(src.image, src.width, src.height, targetW, targetH, o.flatten);

    // 4) Encode once in both formats and pick the smaller
    let best = await this.encodeBest(canvas, o.preferWebP, o.quality);

    // 5) If we exceed the targetBytes, binary-search quality to fit
    if (o.targetBytes && best.blob.size > o.targetBytes) {
      best = await this.shrinkToTargetBytes(canvas, o.preferWebP, o.targetBytes, {
        qMin: o.minQuality!,
        qMax: o.quality,
        rounds: 6,
        seedType: best.type, // start with whichever was smaller initially
      });
    }

    // 6) Return result
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const ext = best.type.endsWith('webp') ? 'webp' : 'jpg';
    const outFile = new File([await best.blob.arrayBuffer()], `${baseName}.${ext}`, { type: best.type });

    return {
      file: outFile,
      width: canvas.width,
      height: canvas.height,
      wasResized,
      mime: outFile.type,
      originalBytes: file.size,
      finalBytes: outFile.size,
      ratio: outFile.size / file.size,
    };
  }

  // ---------- Internal helpers ----------

  /** Decode input file to an ImageBitmap (or HTMLImageElement as fallback) */
  private async decodeToBitmap(file: File): Promise<{ image: ImageBitmap | HTMLImageElement; width: number; height: number }> {
    // Prefer createImageBitmap when available; it’s fast and respects EXIF on many browsers.
    if(!file){
      return null;
    }
    if ('createImageBitmap' in window) {
      const buf = await file.arrayBuffer();
      const bmp = await (createImageBitmap as any)(new Blob([buf]), { imageOrientation: 'from-image' });
      return { image: bmp, width: bmp.width, height: bmp.height };
    }
    // Fallback to <img>
    const img = await this.loadImageBitmapFallback(file);
    return { image: img, width: img.naturalWidth || (img as any).width, height: img.naturalHeight || (img as any).height };
  }

  /** Progressive downscale for better quality + optional white background flatten */
  private async drawDownscaled(
    src: ImageBitmap | HTMLImageElement,
    sw: number, sh: number,
    tw: number, th: number,
    flatten: boolean
  ): Promise<HTMLCanvasElement> {
    // start on a temp canvas at source size
    let cw = sw, ch = sh;
    let tmp = document.createElement('canvas');
    tmp.width = cw; tmp.height = ch;
    let tctx = tmp.getContext('2d')!;
    tctx.drawImage(src as any, 0, 0, cw, ch);

    // halve until close to target (avoids aliasing)
    while (cw / 2 > tw * 1.5 || ch / 2 > th * 1.5) {
      const nw = Math.max(tw, Math.floor(cw / 2));
      const nh = Math.max(th, Math.floor(ch / 2));
      const c2 = document.createElement('canvas');
      c2.width = nw; c2.height = nh;
      c2.getContext('2d')!.drawImage(tmp, 0, 0, cw, ch, 0, 0, nw, nh);
      tmp = c2; tctx = tmp.getContext('2d')!;
      cw = nw; ch = nh;
    }

    // final pass to exact size
    const out = document.createElement('canvas');
    out.width = tw; out.height = th;
    const octx = out.getContext('2d')!;
    octx.drawImage(tmp, 0, 0, cw, ch, 0, 0, tw, th);

    if (flatten) {
      octx.globalCompositeOperation = 'destination-over';
      octx.fillStyle = '#fff';
      octx.fillRect(0, 0, tw, th);
      octx.globalCompositeOperation = 'source-over';
    }
    return out;
  }

  private async encodeOnce(canvas: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
    // Safari sometimes returns null if type unsupported
    return await new Promise<Blob | null>(res => canvas.toBlob(res, type, q));
  }

  /** Encode as WebP + JPEG, pick whichever is smaller (and exists) */
  private async encodeBest(canvas: HTMLCanvasElement, preferWebP: boolean, q: number) {
    const order = preferWebP ? ['image/webp', 'image/jpeg'] : ['image/jpeg', 'image/webp'];
    let bestBlob: Blob | null = null;
    let bestType = order[0];

    for (const t of order) {
      const b = await this.encodeOnce(canvas, t, q);
      if (b && (!bestBlob || b.size < bestBlob.size)) {
        bestBlob = b; bestType = b.type || t;
      }
    }
    if (!bestBlob) throw new Error('Encoding failed — neither WebP nor JPEG available.');
    return { type: bestType, blob: bestBlob };
  }

  /** Binary-search quality to fit targetBytes (tries both types, keeps the smallest under the cap) */
  private async shrinkToTargetBytes(
    canvas: HTMLCanvasElement,
    preferWebP: boolean,
    target: number,
    opts: { qMin: number; qMax: number; rounds: number; seedType?: string }
  ) {
    const types = preferWebP ? ['image/webp', 'image/jpeg'] : ['image/jpeg', 'image/webp'];

    // Try the seed type first (the smaller one from initial encodeBest)
    const tryTypes = opts.seedType && types.includes(opts.seedType) ? [opts.seedType, ...types.filter(t => t !== opts.seedType)] : types;

    let bestOverall: { type: string; blob: Blob } | null = null;

    for (const t of tryTypes) {
      let lo = opts.qMin, hi = opts.qMax;
      let best: Blob | null = null;

      for (let i = 0; i < opts.rounds; i++) {
        const mid = (lo + hi) / 2;
        const b = await this.encodeOnce(canvas, t, mid);
        if (!b) { hi = mid; continue; }

        if (b.size <= target) {
          best = !best || b.size < best.size ? b : best;
          // we can try even lower quality (smaller) while staying <= target
          hi = mid;
        } else {
          // need more compression → lower quality
          lo = mid;
        }
      }

      if (best) {
        const candidate = { type: t, blob: best };
        if (!bestOverall || candidate.blob.size < bestOverall.blob.size) {
          bestOverall = candidate;
        }
      }
    }

    // If nothing got under target, take the smallest we can at qMin
    if (!bestOverall) {
      const encA = await this.encodeOnce(canvas, types[0], opts.qMin);
      const encB = await this.encodeOnce(canvas, types[1], opts.qMin);
      const pick = !encA ? encB! : !encB ? encA! : (encA.size <= encB.size ? encA : encB);
      bestOverall = { type: pick.type || types[0], blob: pick };
    }
    return bestOverall;
  }

  private loadImageBitmapFallback(file: File): Promise<HTMLImageElement> {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
      img.src = url;
    });
  }
}
