import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Caregiver } from '../common/entities/caregiver.entity';

/**
 * Forma canônica de um telefone BR para comparação robusta: remove código do país (55)
 * e o 9º dígito de celulares, resultando em DDD + 8 dígitos. Assim "5527999998888",
 * "27999998888" e "2799998888" comparam iguais — cobre variações do webhook/uazapi.
 */
function canonicalBrPhone(p: string): string {
  let d = (p ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2); // remove código do país
  if (d.length === 11) d = d.slice(0, 2) + d.slice(3);      // remove o 9º dígito (celular)
  return d;
}

@Injectable()
export class CaregiversService {
  constructor(
    @InjectRepository(Caregiver)
    private readonly repo: Repository<Caregiver>,
  ) {}

  findAll(): Promise<Caregiver[]> {
    return this.repo.find({ order: { createdAt: 'ASC' } });
  }

  findAllActive(): Promise<Caregiver[]> {
    return this.repo.find({ where: { active: true }, order: { createdAt: 'ASC' } });
  }

  findOne(id: string): Promise<Caregiver | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Busca cuidador ativo pelo telefone do webhook — usado para interceptar respostas
   * de cuidadores antes do processamento de lead. Compara com e sem o 9º dígito.
   */
  async findActiveByPhone(phone: string): Promise<Caregiver | null> {
    const incoming = canonicalBrPhone(phone);
    if (!incoming) return null;
    const actives = await this.findAllActive();
    return actives.find(c => canonicalBrPhone(c.phone) === incoming) ?? null;
  }

  async create(data: { name: string; phone: string }): Promise<Caregiver> {
    const name = (data.name ?? '').trim();
    const phone = (data.phone ?? '').replace(/\D/g, '');
    if (!name) throw new BadRequestException('Nome é obrigatório');
    if (phone.length < 10) throw new BadRequestException('Telefone inválido — use DDD + número (ex: 27999999999)');

    const existing = await this.repo.findOne({ where: { phone } });
    if (existing) throw new ConflictException('Já existe um cuidador com esse telefone');

    return this.repo.save(this.repo.create({ name, phone }));
  }

  async update(id: string, data: { name?: string; phone?: string; active?: boolean }): Promise<Caregiver> {
    const caregiver = await this.repo.findOne({ where: { id } });
    if (!caregiver) throw new NotFoundException('Cuidador não encontrado');

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('Nome é obrigatório');
      caregiver.name = name;
    }
    if (data.phone !== undefined) {
      const phone = data.phone.replace(/\D/g, '');
      if (phone.length < 10) throw new BadRequestException('Telefone inválido');
      caregiver.phone = phone;
    }
    if (data.active !== undefined) caregiver.active = data.active;

    return this.repo.save(caregiver);
  }

  async remove(id: string): Promise<void> {
    const caregiver = await this.repo.findOne({ where: { id } });
    if (!caregiver) throw new NotFoundException('Cuidador não encontrado');
    await this.repo.remove(caregiver);
  }
}
