import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { OpsService } from './ops.service';
import { OpsController } from './ops.controller';

@Module({
  imports: [ProductsModule],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
