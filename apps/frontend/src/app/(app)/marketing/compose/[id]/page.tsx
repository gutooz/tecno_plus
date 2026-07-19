'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wand2, ImagePlus, Film, Send, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Skeleton, StatusPill } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { MarketingNav } from '@/components/marketing-nav';

interface TrendItem {
  id: string;
  title: string;
  image: string;
  trend: { score: number } | null;
  plan: { campaignType: string } | null;
}

interface ImageStyle {
  key: string;
  label: string;
  format: string;
}

interface PostDetail {
  id: string;
  productTitle: string;
  channel: string;
  type: string;
  status: string;
  scheduledFor: string;
  content: { caption: string; hashtags: string[]; cta: string; mediaUrls: string[] };
  lastError?: string;
}

const CHANNELS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube_shorts', label: 'YouTube Shorts' },
  { value: 'pinterest', label: 'Pinterest' },
  { value: 'google_business', label: 'Google Meu Negócio' },
];

const TYPES = [
  { value: 'feed', label: 'Feed' },
  { value: 'story', label: 'Story' },
  { value: 'reel', label: 'Reel' },
  { value: 'carousel', label: 'Carrossel' },
  { value: 'offer', label: 'Oferta' },
];

const selectClass =
  'h-9 rounded-xl border border-border bg-surface px-3 text-sm outline-none transition-colors focus:border-primary';

export default function ComposePage() {
  return (
    <Suspense>
      <ComposeContent />
    </Suspense>
  );
}

function ComposeContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const productId = params.id;
  const postId = searchParams.get('postId');
  const queryClient = useQueryClient();

  const { data: trends, isLoading } = useQuery({
    queryKey: ['marketing', 'trends'],
    queryFn: () => api.get<TrendItem[]>('/marketing/trends'),
  });
  const product = useMemo(() => trends?.find((t) => t.id === productId), [trends, productId]);

  const { data: styles } = useQuery({
    queryKey: ['marketing', 'image-styles'],
    queryFn: () => api.get<ImageStyle[]>('/marketing/image-styles'),
  });

  const { data: post } = useQuery({
    queryKey: ['marketing', 'post', postId],
    queryFn: () => api.get<PostDetail>(`/marketing/calendar/${postId}`),
    enabled: Boolean(postId),
    refetchInterval: (query) => (query.state.data?.content?.caption ? false : 2000),
  });

  const [channel, setChannel] = useState('instagram');
  const [type, setType] = useState('feed');
  const [styleKey, setStyleKey] = useState('');

  // Se veio de um post existente (Editor Manual), pré-seleciona canal/formato dele.
  useEffect(() => {
    if (post) {
      setChannel(post.channel);
      setType(post.type);
    }
  }, [post]);

  const copy = useMutation({
    mutationFn: () =>
      api.post<{ caption: string; hashtags: string[]; cta: string }>('/marketing/copy/preview', {
        productId,
        channel,
        type,
      }),
  });

  const image = useMutation({
    mutationFn: () =>
      api.post<{ url: string }>('/marketing/image/preview', { productId, styleKey }),
  });

  const [videoFormat, setVideoFormat] = useState<'vertical' | 'square'>('vertical');
  const video = useMutation({
    mutationFn: () =>
      api.post<{ url: string }>('/marketing/video/preview', { productId, format: videoFormat }),
  });

  const attachCopy = useMutation({
    mutationFn: () =>
      api.patch(`/marketing/calendar/${postId}/content`, {
        caption: copy.data?.caption,
        hashtags: copy.data?.hashtags,
        cta: copy.data?.cta,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing', 'post', postId] }),
  });

  const attachImage = useMutation({
    mutationFn: () =>
      api.patch(`/marketing/calendar/${postId}/content`, { mediaUrls: [image.data?.url] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing', 'post', postId] }),
  });

  const attachVideo = useMutation({
    mutationFn: () =>
      api.patch(`/marketing/calendar/${postId}/content`, { mediaUrls: [video.data?.url] }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing', 'post', postId] }),
  });

  const publish = useMutation({
    mutationFn: () =>
      api.post<{ ok: true; externalId: string }>(`/marketing/calendar/${postId}/publish`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing', 'post', postId] }),
  });

  function confirmPublish() {
    if (!post) return;
    const ok = window.confirm(
      `Publicar de verdade agora em ${post.channel === 'instagram' ? 'Instagram' : post.channel === 'facebook' ? 'Facebook' : post.channel}? Esta ação é real e pública — não pode ser desfeita pelo sistema.`,
    );
    if (ok) publish.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={product?.title ?? post?.productTitle ?? 'Compor post'}
        subtitle="Conteúdo gerado pelo Copywriter e pelo Image Agent do Marketing IA"
      />
      <MarketingNav />

      {post && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Status do post:</span>
            <StatusPill status={post.status} />
            {post.lastError && <span className="text-xs text-danger">{post.lastError}</span>}
          </div>
          <Button
            size="sm"
            disabled={!post.content.mediaUrls.length || post.status === 'published'}
            loading={publish.isPending}
            onClick={confirmPublish}
          >
            <Send size={14} /> Publicar agora
          </Button>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-3.5">
            <p className="flex items-center gap-2 font-medium">
              <Wand2 size={16} className="text-primary" /> Legenda
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className={selectClass}
              >
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={selectClass}
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <Button size="sm" loading={copy.isPending} onClick={() => copy.mutate()}>
                Gerar legenda
              </Button>
            </div>

            {copy.data && (
              <div className="rounded-xl bg-surface-2/60 p-3.5 text-sm">
                <p className="whitespace-pre-wrap">{copy.data.caption}</p>
                <p className="mt-2 font-medium text-primary">{copy.data.cta}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {copy.data.hashtags.map((h) => (
                    <span
                      key={h}
                      className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-muted"
                    >
                      #{h}
                    </span>
                  ))}
                </div>
                {postId && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    loading={attachCopy.isPending}
                    onClick={() => attachCopy.mutate()}
                  >
                    {attachCopy.isSuccess ? <Check size={14} /> : null} Usar esta legenda no post
                  </Button>
                )}
              </div>
            )}
            {copy.isError && (
              <p className="text-sm text-danger">
                {copy.error instanceof Error ? copy.error.message : 'Falha ao gerar legenda.'}
              </p>
            )}
          </Card>

          <Card className="flex flex-col gap-3.5">
            <p className="flex items-center gap-2 font-medium">
              <ImagePlus size={16} className="text-primary" /> Imagem
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                value={styleKey}
                onChange={(e) => setStyleKey(e.target.value)}
                className={`${selectClass} flex-1`}
              >
                <option value="" disabled>
                  Escolha um estilo
                </option>
                {(styles ?? []).map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={!styleKey}
                loading={image.isPending}
                onClick={() => image.mutate()}
              >
                Gerar imagem
              </Button>
            </div>

            {image.data && (
              <div className="flex flex-col gap-2">
                <div className="overflow-hidden rounded-xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.data.url} alt="Imagem gerada" className="h-auto w-full" />
                </div>
                {postId && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={attachImage.isPending}
                    onClick={() => attachImage.mutate()}
                  >
                    {attachImage.isSuccess ? <Check size={14} /> : null} Usar esta imagem no post
                  </Button>
                )}
              </div>
            )}
            {image.isError && (
              <p className="text-sm text-danger">
                {image.error instanceof Error ? image.error.message : 'Falha ao gerar imagem.'}
              </p>
            )}
          </Card>

          <Card className="flex flex-col gap-3.5 lg:col-span-2">
            <p className="flex items-center gap-2 font-medium">
              <Film size={16} className="text-primary" /> Vídeo (Reels/Stories/Shorts)
            </p>
            <p className="text-xs text-muted">
              Slideshow com zoom lento a partir das fotos do produto, legenda na capa — sem música
              (direitos autorais).
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                value={videoFormat}
                onChange={(e) => setVideoFormat(e.target.value as 'vertical' | 'square')}
                className={selectClass}
              >
                <option value="vertical">Vertical (Reels/Stories/Shorts)</option>
                <option value="square">Quadrado (Feed)</option>
              </select>
              <Button size="sm" loading={video.isPending} onClick={() => video.mutate()}>
                Gerar vídeo
              </Button>
            </div>

            {video.data && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <video
                  src={video.data.url}
                  controls
                  className="max-h-[420px] rounded-xl border border-border"
                />
                {postId && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={attachVideo.isPending}
                    onClick={() => attachVideo.mutate()}
                  >
                    {attachVideo.isSuccess ? <Check size={14} /> : null} Usar este vídeo no post
                  </Button>
                )}
              </div>
            )}
            {video.isError && (
              <p className="text-sm text-danger">
                {video.error instanceof Error ? video.error.message : 'Falha ao gerar vídeo.'}
              </p>
            )}
          </Card>
        </div>
      )}

      {publish.isError && (
        <Card className="mt-4 text-sm text-danger">
          {publish.error instanceof Error ? publish.error.message : 'Falha ao publicar.'}
        </Card>
      )}
      {publish.isSuccess && (
        <Card className="mt-4 text-sm text-success">Publicado com sucesso.</Card>
      )}
    </div>
  );
}
