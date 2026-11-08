import { useEffect, useRef, useState } from 'react';
import { CameraOff } from 'lucide-react';

type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/**
 * Camera QR scanner: the native BarcodeDetector where the browser has it
 * (Chrome/Edge/Android), otherwise html5-qrcode (Safari/Firefox), loaded only
 * when needed. Calls onResult with the raw text; the parent validates it.
 */
export default function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fallbackId = 'smartaqua-qr-fallback';
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'native' | 'fallback' | null>(null);
  const resultRef = useRef(onResult);
  useEffect(() => {
    resultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    let fallbackStop: (() => Promise<void>) | null = null;
    const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

    async function startNative(DetectorCtor: BarcodeDetectorCtor) {
      setMode('native');
      const detector = new DetectorCtor({ formats: ['qr_code'] });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (stopped || !videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const tick = async () => {
        if (stopped || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) {
            resultRef.current(codes[0].rawValue);
            return;
          }
        } catch {
          // a frame that could not be read; keep scanning
        }
        frame = window.setTimeout(() => void tick(), 250);
      };
      void tick();
    }

    async function startFallback() {
      setMode('fallback');
      const { Html5Qrcode } = await import('html5-qrcode');
      if (stopped) return;
      const scanner = new Html5Qrcode(fallbackId, { verbose: false });
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: 220 },
        (text) => resultRef.current(text),
        () => undefined
      );
      fallbackStop = async () => {
        if (scanner.isScanning) await scanner.stop();
        scanner.clear();
      };
    }

    (Detector ? startNative(Detector) : startFallback()).catch((err: unknown) => {
      console.warn('QR scanner unavailable:', err);
      setError('Camera not available. Allow camera access, or type the ID and code below.');
    });

    return () => {
      stopped = true;
      window.clearTimeout(frame);
      stream?.getTracks().forEach((track) => track.stop());
      void fallbackStop?.();
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">
        <CameraOff className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
        {error}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-600/40 bg-black">
      {mode !== 'fallback' && <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline aria-label="Camera preview" />}
      <div id={fallbackId} className={mode === 'fallback' ? 'w-full' : 'hidden'} />
    </div>
  );
}
