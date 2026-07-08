import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('whatsapp_config')
export class WhatsappConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'instance_token', nullable: true })
  instanceToken: string;

  @Column({ name: 'profile_name', nullable: true })
  profileName: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ name: 'profile_pic_url', nullable: true, type: 'text' })
  profilePicUrl: string;

  @Column({ default: false })
  connected: boolean;

  @Column({ name: 'webhook_configured', default: false })
  webhookConfigured: boolean;

  @Column({ name: 'webhook_url', nullable: true, type: 'text' })
  webhookUrl: string;

  // Prompt legado (agente único) — mantido para compatibilidade/backup
  @Column({ name: 'custom_prompt_lia', nullable: true, type: 'text' })
  customPromptLia: string | null;

  // Prompts por agente (multiagente)
  @Column({ name: 'prompt_roteador', nullable: true, type: 'text' })
  promptRoteador: string | null;

  @Column({ name: 'prompt_fluxo_1', nullable: true, type: 'text' })
  promptFluxo1: string | null;

  @Column({ name: 'prompt_fluxo_2', nullable: true, type: 'text' })
  promptFluxo2: string | null;

  @Column({ name: 'prompt_fluxo_3', nullable: true, type: 'text' })
  promptFluxo3: string | null;

  @Column({ name: 'prompt_fluxo_4', nullable: true, type: 'text' })
  promptFluxo4: string | null;

  @Column({ name: 'followup_delay_minutes', nullable: true, type: 'int', default: 60 })
  followupDelayMinutes: number | null;

  @Column({ name: 'followup_message', nullable: true, type: 'text' })
  followupMessage: string | null;

  // Fluxo 1 — valores dos planos em centavos (0 = não configurado, valor omitido nas mensagens)
  @Column({ name: 'plan_simples_value', type: 'int', default: 0 })
  planSimplesValue: number;

  @Column({ name: 'plan_medio_value', type: 'int', default: 0 })
  planMedioValue: number;

  @Column({ name: 'plan_complexo_value', type: 'int', default: 0 })
  planComplexoValue: number;

  // Percentual do valor do plano repassado ao cuidador (padrão 55%)
  @Column({ name: 'caregiver_percent', type: 'int', default: 55 })
  caregiverPercent: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
