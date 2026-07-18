import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocialApprovalService } from './social.service';
import { ProductDocument } from '../database/schemas/product.schema';

/**
 * Gestão web de posts sociais (Facebook/Instagram) — complementa o fluxo de
 * aprovação por Telegram (não substitui). Dados escopados pelo `ownerId` fixo
 * de config, mesma fonte que `SocialApprovalService` já usa para o pick
 * diário automático (ver comentário lá) — não pelo usuário JWT autenticado,
 * que só serve para exigir login nestas rotas.
 */
@ApiTags('social')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('social')
export class SocialController {
  constructor(private readonly social: SocialApprovalService) {}

  @Get('history')
  async history(@Query('status') status?: string) {
    const products = await this.social.listHistory(status);
    return { posts: products.map((p) => this.summarize(p, { includeApproval: true })) };
  }

  /**
   * Prévia somente-leitura: "o que a automação pegaria a seguir" — não é uma
   * fila comprometida, é um peek na mesma lógica do pick diário.
   */
  @Get('plan-preview')
  async planPreview(@Query('days') days?: string) {
    const limit = Math.max(1, Math.min(30, Number(days) || 7));
    const candidates = await this.social.pickUpcomingCandidates(limit);
    return {
      candidates: candidates.map((p) => ({
        ...this.summarize(p, { includeApproval: false }),
        previewCaption: this.social.buildCaption(p),
      })),
    };
  }

  @Post('posts')
  async createPost(@Body() body: { productId: string; mode?: 'approval' | 'immediate' }) {
    await this.social.createManualPost(
      body.productId,
      body.mode === 'immediate' ? 'immediate' : 'approval',
    );
    return { ok: true };
  }

  private summarize(product: ProductDocument, opts: { includeApproval: boolean }) {
    const doc = product.toObject() as unknown as Record<string, unknown>;
    const vision = (doc.vision ?? {}) as { name?: string };
    const content = (doc.content ?? {}) as { title?: string };
    const images = (doc.images ?? {}) as { hd?: string; square?: string; original?: string };
    return {
      id: String(product._id),
      internalSku: doc.internalSku,
      title: content.title || vision.name || doc.internalSku,
      image: images.hd || images.square || images.original || '',
      ...(opts.includeApproval ? { socialApproval: doc.socialApproval } : {}),
    };
  }
}
