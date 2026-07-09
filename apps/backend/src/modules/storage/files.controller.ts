import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { StorageService } from './storage.service';

/**
 * Serve imagens armazenadas no GridFS. Público (id opaco) — necessário para que
 * <img> no frontend e os provedores de IA consigam ler a imagem sem enviar
 * token no header.
 */
@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get(':id')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async get(@Param('id') id: string, @Res() res: Response) {
    const { file, stream } = await this.storage.openDownload(id);
    res.setHeader('Content-Type', file.contentType ?? 'application/octet-stream');
    if (file.length) res.setHeader('Content-Length', String(file.length));
    stream.on('error', () => res.status(404).end());
    stream.pipe(res);
  }
}
