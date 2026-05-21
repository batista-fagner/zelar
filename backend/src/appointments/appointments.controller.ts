import { Controller, Get, Post, Patch, Delete, Param, Body, Query, BadRequestException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import type { CreateAppointmentDto, UpdateAppointmentDto } from './appointments.service';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  async findByMonth(@Query('year') year: string, @Query('month') month: string) {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (!y || !m || m < 1 || m > 12) {
      throw new BadRequestException('year e month são obrigatórios (month entre 1 e 12)');
    }
    return this.appointmentsService.findByMonth(y, m);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAppointmentDto) {
    if (!dto.clientName || !dto.startDateTime || !dto.service) {
      throw new BadRequestException('clientName, startDateTime e service são obrigatórios');
    }
    return this.appointmentsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointmentsService.update(id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.appointmentsService.delete(id);
    return { ok: true };
  }
}
