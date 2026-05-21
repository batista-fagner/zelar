import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'campaign_name' })
  campaignName: string;

  @Column({ type: 'text' })
  message: string;

  @Column()
  mode: string; // 'manual' | 'system'

  @Column({ name: 'total_recipients', default: 0 })
  totalRecipients: number;

  @Column({ name: 'folder_id', nullable: true })
  folderId: string; // ID da pasta na uazapi

  @Column({ default: 'sending' })
  status: string; // scheduled | sending | paused | done | deleting

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
