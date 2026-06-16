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

  @Column({ name: 'custom_prompt_lia', nullable: true, type: 'text' })
  customPromptLia: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
