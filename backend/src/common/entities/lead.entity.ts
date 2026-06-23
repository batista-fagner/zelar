import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany, OneToOne,
  BeforeInsert, BeforeUpdate,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { LeadStageHistory } from './lead-stage-history.entity';

export type LeadStage = 'novo_lead' | 'em_atendimento' | 'aguardando_pagamento' | 'pagamento_confirmado' | 'matriculado' | 'perdido';

export type LeadTemperature = 'quente' | 'morno' | 'frio';

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  phone: string;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ default: 'novo_lead' })
  stage: LeadStage;

  @Column({ nullable: true })
  temperature: LeadTemperature;

  @Column({ name: 'qualification_score', default: 0 })
  qualificationScore: number;

  @Column({ nullable: true, type: 'text' })
  symptoms: string;

  @Column({ nullable: true })
  urgency: string;

  @Column({ nullable: true })
  availability: string;

  @Column({ nullable: true })
  budget: string;

  @Column({ nullable: true, type: 'text' })
  observations: string | null;

  @Column({ name: 'qualification_step', default: 0 })
  qualificationStep: number;

  @Column({ name: 'ai_context', type: 'jsonb', default: [] })
  aiContext: object[];

  @Column({ name: 'nurture_step', default: 0 })
  nurtureStep: number;

  @Column({ name: 'nurture_paused', default: false })
  nurturePaused: boolean;

  @Column({ name: 'next_nurture_at', nullable: true, type: 'timestamp' })
  nextNurtureAt: Date;

  @Column({ name: 'appointment_at', nullable: true, type: 'timestamp' })
  appointmentAt: Date | null;

  @Column({ name: 'calendar_event_id', nullable: true, type: 'text' })
  calendarEventId: string | null;

  @Column({ name: 'calendar_event_link', nullable: true, type: 'text' })
  calendarEventLink: string | null;

  @Column({ name: 'last_message_at', nullable: true, type: 'timestamp' })
  lastMessageAt: Date;

  @Column({ name: 'last_message_direction', nullable: true, type: 'varchar' })
  lastMessageDirection: 'inbound' | 'outbound' | null;

  @Column({ name: 'followup_sent_at', nullable: true, type: 'timestamp' })
  followupSentAt: Date | null;

  @Column({ nullable: true, type: 'varchar' })
  cpf: string | null;

  @Column({ type: 'jsonb', default: [] })
  labels: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  normalizePhone() {
    if (this.phone) {
      this.phone = this.phone.replace(/\D/g, '');
    }
  }

  @OneToOne(() => Conversation, (c) => c.lead)
  conversation: Conversation;

  @OneToMany(() => LeadStageHistory, (h) => h.lead)
  stageHistory: LeadStageHistory[];
}
