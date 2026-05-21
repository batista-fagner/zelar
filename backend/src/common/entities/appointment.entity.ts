import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Lead } from './lead.entity';

export type AppointmentService = 'mega_hair' | 'manutencao';
export type AppointmentStatus = 'agendado' | 'confirmado' | 'realizado' | 'cancelado' | 'nao_compareceu';

@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id', nullable: true, type: 'uuid' })
  leadId: string | null;

  @ManyToOne(() => Lead, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'lead_id' })
  lead: Lead | null;

  @Column({ name: 'client_name', type: 'varchar' })
  clientName: string;

  @Column({ name: 'client_phone', type: 'varchar', nullable: true })
  clientPhone: string | null;

  @Column({ type: 'varchar', default: 'mega_hair' })
  service: AppointmentService;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  value: number | null;

  @Column({ type: 'varchar', default: 'agendado' })
  status: AppointmentStatus;

  @Column({ name: 'start_date_time', type: 'timestamp' })
  startDateTime: Date;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
