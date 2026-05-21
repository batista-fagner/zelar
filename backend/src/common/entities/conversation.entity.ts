import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, OneToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { Lead } from './lead.entity';
import { Message } from './message.entity';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id' })
  leadId: string;

  @Column({ name: 'ai_enabled', default: true })
  aiEnabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToOne(() => Lead, (l) => l.conversation)
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;

  @OneToMany(() => Message, (m) => m.conversation)
  messages: Message[];
}
