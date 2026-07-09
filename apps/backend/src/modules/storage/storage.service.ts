import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Abstração de storage. Hoje: Supabase Storage. A interface mínima
 * (upload/getPublicUrl) permite trocar por S3/GCS futuramente sem tocar nos
 * agentes. Se as credenciais não estiverem configuradas, cai em modo no-op
 * (retorna uma URL data/placeholder) para não quebrar o fluxo em dev.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: SupabaseClient | null;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('supabase.url');
    const key = this.config.get<string>('supabase.serviceKey');
    this.bucket = this.config.get<string>('supabase.bucket') ?? 'product-images';
    this.client = url && key ? createClient(url, key) : null;
    if (!this.client) {
      this.logger.warn('Supabase não configurado — StorageService em modo local/no-op.');
    }
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /** Sobe um buffer e devolve a URL pública. */
  async upload(path: string, data: Buffer, contentType: string): Promise<string> {
    if (!this.client) {
      // fallback dev: devolve data URL (não persiste, mas mantém o pipeline vivo)
      return `data:${contentType};base64,${data.toString('base64')}`;
    }
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(path, data, { contentType, upsert: true });
    if (error) throw new Error(`Storage upload falhou: ${error.message}`);
    return this.getPublicUrl(path);
  }

  getPublicUrl(path: string): string {
    if (!this.client) return path;
    return this.client.storage.from(this.bucket).getPublicUrl(path).data.publicUrl;
  }
}
