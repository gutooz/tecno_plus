import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import ffmpegStatic from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { StorageService } from '../../modules/storage/storage.service';
import { fetchImageAsBase64 } from '../../modules/ai/ai.utils';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);

export type MarketingVideoFormat = 'vertical' | 'square';

const FORMAT_DIMENSIONS: Record<MarketingVideoFormat, [number, number]> = {
  vertical: [1080, 1920], // Reels/Stories/Shorts
  square: [1080, 1080], // Feed
};

const SECONDS_PER_IMAGE = 3;
const FPS = 30;

/**
 * AGENTE 5 (Marketing IA) — Video Creator.
 * V1 sem engine de vídeo por IA paga (nenhuma configurada) — decisão já
 * combinada com o operador: monta um slideshow com zoom lento (Ken Burns) a
 * partir das imagens já existentes do produto (catálogo ou Image Agent de
 * marketing), com a legenda do Copywriter sobreposta. SEM MÚSICA (direitos
 * autorais — nunca inventamos trilha sonora).
 *
 * O texto é composto via `sharp` (SVG, `<text>` puro — sem `foreignObject`,
 * que tem suporte inconsistente no librsvg) ANTES do ffmpeg, e o ffmpeg só
 * cuida do zoom/pan e da montagem — evita qualquer dependência de
 * fontconfig/drawtext no servidor.
 */
@Injectable()
export class MarketingVideoAgent {
  private readonly logger = new Logger(MarketingVideoAgent.name);

  constructor(private readonly storage: StorageService) {}

  async generate(
    productId: string,
    imageUrls: string[],
    caption: string,
    format: MarketingVideoFormat,
  ): Promise<string> {
    if (!imageUrls.length) throw new Error('Nenhuma imagem disponível para gerar o vídeo.');
    const [width, height] = FORMAT_DIMENSIONS[format];

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tp-marketing-video-'));
    try {
      const segmentPaths: string[] = [];
      for (let i = 0; i < imageUrls.length; i++) {
        const framePath = path.join(workDir, `frame-${i}.jpg`);
        // Legenda só na primeira imagem (capa) — as demais ficam limpas, como um carrossel de vídeo.
        await this.composeFrame(imageUrls[i], i === 0 ? caption : '', width, height, framePath);

        const segmentPath = path.join(workDir, `segment-${i}.mp4`);
        await this.renderSegment(framePath, width, height, segmentPath);
        segmentPaths.push(segmentPath);
      }

      const outputPath = path.join(workDir, 'output.mp4');
      await this.concatSegments(segmentPaths, path.join(workDir, 'concat.txt'), outputPath);

      const buffer = await fs.readFile(outputPath);
      const key = `products/${productId}/marketing/videos/${format}-${Date.now()}.mp4`;
      return await this.storage.upload(key, buffer, 'video/mp4');
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Baixa a imagem, ajusta ao formato (cover) e, se houver legenda, sobrepõe um rodapé com gradiente + texto. */
  private async composeFrame(
    imageUrl: string,
    caption: string,
    width: number,
    height: number,
    outPath: string,
  ): Promise<void> {
    const { base64 } = await fetchImageAsBase64(imageUrl);
    const input = Buffer.from(base64, 'base64');
    const base = sharp(input).resize(width, height, { fit: 'cover', position: 'attention' });

    if (!caption.trim()) {
      await base.jpeg({ quality: 92 }).toFile(outPath);
      return;
    }

    const overlay = this.captionOverlaySvg(caption, width, height);
    await base
      .composite([{ input: Buffer.from(overlay), top: 0, left: 0 }])
      .jpeg({ quality: 92 })
      .toFile(outPath);
  }

  private captionOverlaySvg(caption: string, width: number, height: number): string {
    const barHeight = Math.round(height * 0.24);
    const fontSize = Math.round(width * 0.048);
    const lineHeight = Math.round(fontSize * 1.35);
    // 0.62: largura média de caractere em negrito (semi-bold) — margem extra
    // pra não estourar a borda direita (medido visualmente, sem fontmetrics real).
    const maxCharsPerLine = Math.round((width - 80) / (fontSize * 0.62));
    const lines = wrapText(caption, maxCharsPerLine, 4);
    const startY = height - barHeight + fontSize + 14;

    const textEls = lines
      .map(
        (line, i) =>
          `<text x="40" y="${startY + i * lineHeight}" font-family="Arial, Helvetica, sans-serif" ` +
          `font-size="${fontSize}" font-weight="600" fill="#ffffff">${escapeXml(line)}</text>`,
      )
      .join('');

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="black" stop-opacity="0"/>
          <stop offset="100%" stop-color="black" stop-opacity="0.78"/>
        </linearGradient>
      </defs>
      <rect x="0" y="${height - barHeight}" width="${width}" height="${barHeight}" fill="url(#fade)"/>
      ${textEls}
    </svg>`;
  }

  /** Vídeo de 1 imagem só, com zoom lento (Ken Burns) — sem áudio. */
  private renderSegment(
    framePath: string,
    width: number,
    height: number,
    outPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const frames = SECONDS_PER_IMAGE * FPS;
      ffmpeg(framePath)
        .inputOptions(['-loop 1'])
        .videoFilters([
          `zoompan=z='min(zoom+0.0015,1.15)':d=${frames}:s=${width}x${height}:fps=${FPS}`,
          'format=yuv420p',
        ])
        .outputOptions([`-t ${SECONDS_PER_IMAGE}`, `-r ${FPS}`, '-pix_fmt yuv420p'])
        .noAudio()
        .on('error', (err) => reject(err))
        .on('end', () => resolve())
        .save(outPath);
    });
  }

  /** Concatena os segmentos (mesmo codec/params — gerados pela mesma etapa acima) sem recodificar. */
  private async concatSegments(
    segmentPaths: string[],
    listPath: string,
    outputPath: string,
  ): Promise<void> {
    const list = segmentPaths
      .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n');
    await fs.writeFile(listPath, list, 'utf8');

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .on('error', (err) => reject(err))
        .on('end', () => resolve())
        .save(outputPath);
    });
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Quebra simples por contagem de caracteres (sem métricas reais de fonte) — suficiente pro rodapé do vídeo. */
function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (attempt.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = attempt;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  const consumed = lines.join(' ').length;
  if (lines.length === maxLines && consumed < text.trim().length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/.{3}$/, '')}...`;
  }
  return lines;
}
