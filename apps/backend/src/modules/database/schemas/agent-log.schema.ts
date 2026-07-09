import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AgentLogDocument = HydratedDocument<AgentLog>;

/**
 * Registro por execução de agente. Atende ao requisito de logs completos:
 * início, fim, tempo, sucesso/erro, tokens e modelo de IA usado.
 */
@Schema({ collection: 'logs', timestamps: true })
export class AgentLog {
  @Prop({ required: true, index: true })
  agent!: string; // vision | market | content | image | pricing | publish

  @Prop({ required: true, index: true })
  productId!: string;

  @Prop({ required: true, enum: ['success', 'error'] })
  outcome!: string;

  @Prop() startedAt!: Date;
  @Prop() finishedAt!: Date;
  @Prop({ default: 0 }) durationMs!: number;

  @Prop({ default: '' }) aiProvider!: string;
  @Prop({ default: '' }) aiModel!: string;
  @Prop({ default: 0 }) inputTokens!: number;
  @Prop({ default: 0 }) outputTokens!: number;

  @Prop({ default: '' }) error!: string;
}

export const AgentLogSchema = SchemaFactory.createForClass(AgentLog);
AgentLogSchema.index({ agent: 1, createdAt: -1 });
