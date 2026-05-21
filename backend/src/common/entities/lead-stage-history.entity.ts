import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Lead } from './lead.entity';

@Entity('lead_stage_history')
export class LeadStageHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lead_id' })
  leadId: string;

  @Column({ name: 'from_stage', nullable: true, type: 'varchar' })
  fromStage: string | null;

  @Column({ name: 'to_stage' })
  toStage: string;

  @Column({ name: 'changed_by' })
  changedBy: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Lead, (l) => l.stageHistory)
  @JoinColumn({ name: 'lead_id' })
  lead: Lead;
}
