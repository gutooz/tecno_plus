import { Controller, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/jwt.strategy';
import { UploadsService } from './uploads.service';

// tipo mínimo do arquivo do Multer (evita depender de @types global)
interface MulterFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * Recebe até 1000 imagens por requisição. O frontend envia em paralelo
   (batches); cada arquivo vira um produto + job de pipeline.
   */
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 1000))
  async upload(@CurrentUser() user: AuthUser, @UploadedFiles() files: MulterFile[]) {
    const results = await Promise.all(
      (files ?? []).map((f) =>
        this.uploads.ingest(user.id, {
          buffer: f.buffer,
          originalName: f.originalname,
          mimeType: f.mimetype,
        }),
      ),
    );
    return { received: results.length, products: results };
  }
}
