import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PublishModule } from '../publish/publish.module';
import { AgentsModule } from '../../agents/agents.module';

@Module({
  imports: [PublishModule, AgentsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
