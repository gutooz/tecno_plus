import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import { User, UserSchema } from './schemas/user.schema';
import { AgentLog, AgentLogSchema } from './schemas/agent-log.schema';

const models = MongooseModule.forFeature([
  { name: Product.name, schema: ProductSchema },
  { name: User.name, schema: UserSchema },
  { name: AgentLog.name, schema: AgentLogSchema },
]);

/**
 * Torna os models disponíveis globalmente para evitar reimport em cada módulo
 * de agente. A CONEXÃO em si é criada no AppModule (MongooseModule.forRootAsync).
 */
@Global()
@Module({
  imports: [models],
  exports: [models],
})
export class DatabaseModule {}
