import { BadRequestException, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { Cart, CartItem } from "@haru/contracts";
import { DatabaseService } from "./database.service";

const COOKIE = "haru_migration_cart";
@Injectable()
export class CartService {
  constructor(private readonly db: DatabaseService) {}
  /** O cookie contém segredo aleatório; no banco só fica o hash. Não é login de cliente. */
  async session(req: Request, res: Response): Promise<string> {
    const token: unknown = req.cookies?.[COOKIE];
    if (typeof token === "string" && /^[a-f0-9]{64}$/.test(token)) {
      const hash = createHash("sha256").update(token).digest("hex");
      if (
        this.db.first(
          "SELECT 1 FROM carts WHERE token_hash=? AND expires_at>datetime('now')",
          [hash],
        )
      )
        return hash;
    }
    const next = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(next).digest("hex");
    this.db.run("INSERT INTO carts(token_hash) VALUES(?)", [hash]);
    res.cookie(COOKIE, next, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 30 * 86400000,
      path: "/api",
    });
    return hash;
  }
  async read(hash: string): Promise<Cart> {
    const items = this.db.all<CartItem>(
      `SELECT p.id,p.slug,p.name,p.image,v.sku,v.stock,
      v.price_cents AS "priceCents", MIN(COALESCE(v.stock,9),99) AS "maxQuantity",
      i.quantity,(i.quantity*v.price_cents) AS "lineTotalCents"
      FROM cart_items i JOIN variants v ON v.sku=i.sku JOIN products p ON p.id=v.product_id
      WHERE i.cart_id=? AND p.active=1 ORDER BY p.id`,
      [hash],
    );
    return {
      items,
      quantity: items.reduce((n, i) => n + i.quantity, 0),
      subtotalCents: items.reduce((n, i) => n + i.lineTotalCents, 0),
      checkoutAvailable: false,
    };
  }
  async set(hash: string, sku: string, quantity: number): Promise<Cart> {
    // Sem transação interativa: o Cloudflare D1 não oferece BEGIN/COMMIT entre
    // requisições. A regra que antes morava entre o SELECT e o INSERT foi movida
    // para o WHERE da própria escrita, e o resultado se lê em changes. Assim não
    // existe janela entre verificar o estoque e gravar a quantidade.
    // O SQLite admite um único escritor por banco, então o FOR UPDATE também
    // deixou de ser necessário para evitar perda de atualização entre abas.
    if (quantity === 0) {
      this.db.run("DELETE FROM cart_items WHERE cart_id=? AND sku=?", [
        hash,
        sku,
      ]);
    } else {
      const { changes } = this.db.run(
        `INSERT INTO cart_items(cart_id, sku, quantity)
        SELECT ?, v.sku, ? FROM variants v JOIN products p ON p.id = v.product_id
        WHERE v.sku = ? AND p.active = 1 AND ? <= MIN(COALESCE(v.stock, 9), 99)
        ON CONFLICT(cart_id, sku) DO UPDATE SET quantity = excluded.quantity`,
        [hash, quantity, sku, quantity],
      );
      if (!changes) this.recusar(sku);
    }
    this.db.run("UPDATE carts SET updated_at=datetime('now') WHERE token_hash=?", [
      hash,
    ]);
    // A sacola não reserva estoque e nunca recebe preços enviados pelo cliente.
    return this.read(hash);
  }
  /**
   * Só escolhe a mensagem do erro. A decisão de recusar já foi tomada pelo WHERE
   * da instrução acima; esta leitura não participa da regra e por isso pode
   * acontecer fora de qualquer transação sem abrir brecha de concorrência.
   */
  private recusar(sku: string): never {
    const variante = this.db.first<{ active: number }>(
      "SELECT p.active FROM variants v JOIN products p ON p.id=v.product_id WHERE v.sku=?",
      [sku],
    );
    if (!variante?.active)
      throw new BadRequestException("Produto indisponível");
    throw new BadRequestException("Quantidade acima do limite disponível");
  }
}
