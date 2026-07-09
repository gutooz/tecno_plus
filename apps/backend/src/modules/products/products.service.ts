import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { ProductStatus } from '@tecnoplus/shared';
import { Product, ProductDocument } from '../database/schemas/product.schema';

export interface ListProductsQuery {
  ownerId: string;
  search?: string;
  status?: ProductStatus;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

@Injectable()
export class ProductsService {
  constructor(@InjectModel(Product.name) private readonly model: Model<ProductDocument>) {}

  async list(q: ListProductsQuery) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 20));
    const filter: FilterQuery<ProductDocument> = { ownerId: q.ownerId };
    if (q.status) filter.status = q.status;
    if (q.search) filter.$text = { $search: q.search };

    const sort: Record<string, 1 | -1> = {
      [q.sortBy ?? 'createdAt']: q.sortDir === 'asc' ? 1 : -1,
    };

    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.model.countDocuments(filter),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findById(ownerId: string, id: string) {
    const doc = await this.model.findOne({ _id: id, ownerId }).lean();
    if (!doc) throw new NotFoundException('Produto não encontrado');
    return doc;
  }

  async update(ownerId: string, id: string, patch: Partial<Product>) {
    const doc = await this.model
      .findOneAndUpdate({ _id: id, ownerId }, { $set: patch }, { new: true })
      .lean();
    if (!doc) throw new NotFoundException('Produto não encontrado');
    return doc;
  }

  async remove(ownerId: string, id: string) {
    const res = await this.model.deleteOne({ _id: id, ownerId });
    if (res.deletedCount === 0) throw new NotFoundException('Produto não encontrado');
    return { deleted: true };
  }

  async duplicate(ownerId: string, id: string) {
    const source = await this.findById(ownerId, id);
    const { _id, createdAt, updatedAt, ...rest } = source as Record<string, unknown>;
    void _id;
    void createdAt;
    void updatedAt;
    const copy = await this.model.create({
      ...rest,
      status: ProductStatus.DRAFT,
      internalSku: `${(rest as { internalSku: string }).internalSku}-COPY`,
    });
    return copy.toObject();
  }

  async countsByStatus(ownerId: string) {
    const rows = await this.model.aggregate<{ _id: string; count: number }>([
      { $match: { ownerId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return rows.reduce<Record<string, number>>((acc, r) => ((acc[r._id] = r.count), acc), {});
  }
}
