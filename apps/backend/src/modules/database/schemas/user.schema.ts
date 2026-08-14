import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ default: '' })
  name!: string;

  @Prop({ default: 'seller', enum: ['admin', 'operator', 'supplier', 'seller'] })
  role!: string;

  @Prop({ default: '', index: true })
  organizationId!: string;

  @Prop({ type: [String], default: [] })
  refreshTokenHashes!: string[];

  @Prop({ default: '', index: true })
  resetPasswordTokenHash!: string;

  @Prop({ type: Date, default: null })
  resetPasswordExpiresAt!: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
