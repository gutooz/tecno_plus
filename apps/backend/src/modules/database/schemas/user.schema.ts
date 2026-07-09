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

  @Prop({ default: 'admin', enum: ['admin', 'operator'] })
  role!: string;

  @Prop({ type: [String], default: [] })
  refreshTokenHashes!: string[];
}

export const UserSchema = SchemaFactory.createForClass(User);
