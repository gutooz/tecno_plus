'use client';

import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, X, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card } from '@/components/ui';
import { cn } from '@/lib/utils';

interface Preview {
  file: File;
  url: string;
}

export default function UploadPage() {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(0);
  const startRef = useRef<number>(0);
  const [eta, setEta] = useState<string>('');

  const addFiles = useCallback((files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setPreviews((prev) => [
      ...prev,
      ...imgs.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  async function startUpload() {
    if (!previews.length) return;
    setUploading(true);
    setProgress(0);
    setDone(0);
    startRef.current = Date.now();
    try {
      const res = await api.upload(
        previews.map((p) => p.file),
        (pct) => {
          setProgress(pct);
          const elapsed = (Date.now() - startRef.current) / 1000;
          if (pct > 0) {
            const total = elapsed / (pct / 100);
            setEta(`${Math.max(0, Math.round(total - elapsed))}s restantes`);
          }
        },
      );
      setDone(res.received);
      setPreviews([]);
    } finally {
      setUploading(false);
      setEta('');
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Upload de produtos</h1>
        <p className="text-sm text-muted">
          Arraste centenas de fotos. Elas são enviadas em paralelo e processadas em segundo plano.
        </p>
      </header>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed p-12 text-center transition',
          dragging ? 'border-primary bg-primary/5' : 'border-border bg-surface',
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <UploadCloud size={26} />
        </div>
        <p className="font-medium">Arraste as imagens aqui</p>
        <p className="text-sm text-muted">ou</p>
        <label>
          <input
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <span className="inline-flex h-10 cursor-pointer items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-fg">
            Selecionar arquivos
          </span>
        </label>
      </div>

      {done > 0 && (
        <Card className="mt-4 flex items-center gap-3 border-success/40">
          <CheckCircle2 className="text-success" />
          <p className="text-sm">
            {done} imagem(ns) enviada(s) e enfileirada(s). Acompanhe em <b>Produtos</b>.
          </p>
        </Card>
      )}

      {previews.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted">
              {previews.length} selecionada(s)
              {uploading && ` · ${progress}% · ${eta}`}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading}
                onClick={() => setPreviews([])}
              >
                Limpar
              </Button>
              <Button size="sm" disabled={uploading} onClick={startUpload}>
                {uploading ? 'Enviando…' : 'Enviar tudo'}
              </Button>
            </div>
          </div>

          {uploading && (
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-2">
              <motion.div
                className="h-full bg-primary"
                animate={{ width: `${progress}%` }}
                transition={{ ease: 'easeOut' }}
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            <AnimatePresence>
              {previews.map((p, i) => (
                <motion.div
                  key={p.url}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  {!uploading && (
                    <button
                      onClick={() => setPreviews((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                    >
                      <X size={14} />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
