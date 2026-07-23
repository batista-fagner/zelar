import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type CareRequestStatus = 'aguardando_aceite' | 'aceito' | 'expirado' | 'cancelado';

export type CareComplexity = 'simples' | 'medio' | 'complexo';

export interface CareBroadcastEntry {
  phone: string;
  name: string;
  status: 'enviado' | 'entregue' | 'falhou';
  messageId?: string | null;
  sentAt: string;
  deliveredAt?: string | null;
}

export interface CareRequestSummary {
  clientName: string;
  tipoCuidado: string;
  regiao: string;
  dataAtendimento: string; // DD/MM/AAAA (validado no backend antes de criar)
  turno: 'diurno' | 'noturno' | '24h';
  // Só preenchidos no ramo domiciliar — dão ao cuidador um resumo do paciente antes de aceitar.
  idade?: string | null;
  locomocao?: string | null;
  banho?: string | null;
  medicacao?: string | null;
  diagnostico?: string | null;
}

@Entity('care_requests')
export class CareRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id' })
  leadId: string;

  @Column({ name: 'lead_phone' })
  leadPhone: string;

  @Column({ type: 'jsonb' })
  summary: CareRequestSummary;

  @Column({ type: 'varchar', default: 'medio' })
  complexity: CareComplexity;

  // Valores em centavos (mesmo padrão do InfinitPay). 0 = não configurado → omitido nas mensagens.
  @Column({ name: 'plan_value', type: 'int', default: 0 })
  planValue: number;

  @Column({ name: 'caregiver_value', type: 'int', default: 0 })
  caregiverValue: number;

  @Column({ type: 'varchar', default: 'aguardando_aceite' })
  status: CareRequestStatus;

  @Column({ name: 'assigned_caregiver_id', type: 'uuid', nullable: true })
  assignedCaregiverId: string | null;

  // Telefones (só dígitos) dos cuidadores notificados no broadcast — usados para
  // avisar "vaga preenchida" aos demais quando alguém aceita.
  @Column({ name: 'notified_phones', type: 'jsonb', default: [] })
  notifiedPhones: string[];

  // Log visual de entrega do broadcast — status por cuidador notificado (frontend exibe no Kanban).
  @Column({ name: 'broadcast_log', type: 'jsonb', default: [] })
  broadcastLog: CareBroadcastEntry[];

  @Column({ name: 'calendar_event_id', type: 'text', nullable: true })
  calendarEventId: string | null;

  @Column({ name: 'notified_at', type: 'timestamp', nullable: true })
  notifiedAt: Date | null;

  @Column({ name: 'accepted_at', type: 'timestamp', nullable: true })
  acceptedAt: Date | null;

  // Pesquisa de satisfação enviada ao cliente 24h depois do cuidador aceitar (acceptedAt).
  @Column({ name: 'satisfaction_survey_sent_at', type: 'timestamp', nullable: true })
  satisfactionSurveySentAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
