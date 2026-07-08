import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, BeforeInsert, BeforeUpdate,
} from 'typeorm';

@Entity('caregivers')
export class Caregiver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  phone: string;

  @Column({ default: true })
  active: boolean;

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
}
