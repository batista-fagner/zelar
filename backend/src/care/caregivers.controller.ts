import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { CaregiversService } from './caregivers.service';

@Controller('caregivers')
export class CaregiversController {
  constructor(private readonly caregiversService: CaregiversService) {}

  @Get()
  findAll() {
    return this.caregiversService.findAll();
  }

  @Post()
  create(@Body() body: { name: string; phone: string }) {
    return this.caregiversService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; phone?: string; active?: boolean }) {
    return this.caregiversService.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.caregiversService.remove(id);
    return { ok: true };
  }
}
