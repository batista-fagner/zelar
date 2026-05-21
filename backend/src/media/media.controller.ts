import {
  Controller, Get, Post, Patch, Delete, Param, Body,
  UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  list() {
    return this.mediaService.listAll();
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
  ) {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    if (!name?.trim()) throw new BadRequestException('Nome é obrigatório');
    return this.mediaService.upload(file, name.trim());
  }

  @Patch(':id/rename')
  async rename(@Param('id') id: string, @Body('name') name: string) {
    if (!name?.trim()) throw new BadRequestException('Nome é obrigatório');
    return this.mediaService.rename(id, name.trim());
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.mediaService.delete(id);
    return { ok: true };
  }
}
