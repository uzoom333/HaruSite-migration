import { Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import type { Product } from "@haru/contracts";

// Nove mantém a regra da v5.5 enquanto o estoque comercial não foi informado.
// Quando stock for preenchido, a API limita pelo saldo (com teto operacional 99).
// MIN com dois argumentos é o mínimo escalar no SQLite, equivalente ao LEAST do
// PostgreSQL. active é 0/1 porque o SQLite não tem booleano.
export const PRODUCT_SELECT = `SELECT p.id, p.slug, p.name, p.image, v.sku,
 v.price_cents AS "priceCents", v.stock,
 MIN(COALESCE(v.stock,9),99) AS "maxQuantity"
 FROM products p JOIN variants v ON v.product_id=p.id WHERE p.active=1`;
@Injectable()
export class CatalogService {
  constructor(private readonly db: DatabaseService) {}
  async list(): Promise<Product[]> {
    return this.db.all<Product>(PRODUCT_SELECT + " ORDER BY p.id, v.sku");
  }
  async bySlug(slug: string): Promise<Product> {
    const item = this.db.first<Product>(PRODUCT_SELECT + " AND p.slug=?", [
      slug,
    ]);
    if (!item) throw new NotFoundException("Produto não encontrado");
    return item;
  }
}
