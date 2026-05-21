import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('deleted_leads')
export class DeletedLead {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'original_lead_id', type: 'uuid' })
  originalLeadId: string;

  @Column({ type: 'varchar' })
  phone: string;

  @Column({ type: 'varchar', nullable: true })
  name: string | null;

  @Column({ type: 'varchar', nullable: true })
  stage: string | null;

  @Column({ name: 'deletion_reason', type: 'text' })
  deletionReason: string;

  @Column({ name: 'lead_snapshot', type: 'jsonb' })
  leadSnapshot: any;

  @CreateDateColumn({ name: 'deleted_at' })
  deletedAt: Date;
}
