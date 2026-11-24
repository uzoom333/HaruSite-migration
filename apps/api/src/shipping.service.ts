import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { ShippingQuote, ShippingRate } from "@haru/contracts";
import { DatabaseService } from "./database.service";
import { MelhorEnvioClient } from "./melhor-envio.client";

export interface QuoteItem {
  slug: string;
  quantity: number;
}
export interface ShippableItem {
  slug: string;
  name: string;
  priceCents: number;
  quantity: number;
  weightG: number;
  widthCm: number;
  heightCm: number;
  lengthCm: number;
}
export interface RemotePackage {
  weight: string | number;
  dimensions: {
    height: string | number;
    width: string | number;
    length: string | number;
  };
}
interface RemoteRate {
  id: number;
  name: string;
  error?: string;
  price?: string;
  custom_price?: string;
  delivery_time?: number;
  custom_delivery_time?: number;
  delivery_range?: { min: number; max: number };
  custom_delivery_range?: { min: number; max: number };
  company?: { name?: string };
  packages?: RemotePackage[];
}
export interface DetailedRate extends ShippingRate {
  packages: RemotePackage[];
}
const CACHE_MS = 10 * 60000;

@Injectable()
export class ShippingService {
  private readonly cache = new Map<string, { at: number; rates: DetailedRate[] }>();
  constructor(
    private readonly db: DatabaseService,
    private readonly client: MelhorEnvioClient,
  ) {}

  /** Preço, peso e medidas vêm do banco; do cliente só entram slug e quantidade. */
  items(input: QuoteItem[]): ShippableItem[] {
    if (new Set(input.map((i) => i.slug)).size !== input.length)
      throw new BadRequestException("Produto repetido");
    return input.map(({ slug, quantity }) => {
      const row = this.db.first<Omit<ShippableItem, "quantity">>(
        `SELECT p.slug,p.name,v.price_cents AS "priceCents",v.weight_g AS "weightG",
         v.width_cm AS "widthCm",v.height_cm AS "heightCm",v.length_cm AS "lengthCm"
         FROM products p JOIN variants v ON v.product_id=p.id
         WHERE p.slug=? AND p.active=1`,
        [slug],
      );
      if (!row) throw new BadRequestException("Produto indisponível");
      if (!row.weightG || !row.widthCm || !row.heightCm || !row.lengthCm)
        throw new ServiceUnavailableException(
          `Produto sem peso ou medidas: ${slug}`,
        );
      return { ...row, quantity };
    });
  }

  async detailed(cep: string, input: QuoteItem[], fresh = false): Promise<DetailedRate[]> {
    const from = process.env.SHIP_FROM_CEP?.replace(/\D/g, "");
    if (!from || from.length !== 8)
      throw new ServiceUnavailableException("SHIP_FROM_CEP não configurada");
    const items = this.items(input);
    const payload = {
      from: { postal_code: from },
      to: { postal_code: cep },
      products: items
        .map((i) => ({
          id: i.slug,
          width: i.widthCm,
          height: i.heightCm,
          length: i.lengthCm,
          weight: i.weightG / 1000,
          insurance_value: i.priceCents / 100,
          quantity: i.quantity,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      options: { receipt: false, own_hand: false },
      ...(process.env.MELHOR_ENVIO_SERVICES
        ? { services: process.env.MELHOR_ENVIO_SERVICES }
        : {}),
    };
    const key = this.client.environment + JSON.stringify(payload);
    const hit = this.cache.get(key);
    if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.rates;

    const data = await this.client.post<RemoteRate[]>("shipment/calculate", payload);
    if (!Array.isArray(data))
      throw new ServiceUnavailableException("Cotação inválida");
    const rates: DetailedRate[] = [];
    for (const r of data) {
      const price = Number(r.custom_price ?? r.price);
      const range = r.custom_delivery_range ?? r.delivery_range;
      const days = r.custom_delivery_time ?? r.delivery_time;
      const min = range?.min ?? days;
      const max = range?.max ?? days;
      // Transportadora que não atende o trecho não tem preço: sai da lista.
      if (r.error || !(price > 0) || min == null || max == null) continue;
      rates.push({
        serviceId: r.id,
        name: r.name,
        company: r.company?.name ?? "",
        priceCents: Math.round(price * 100),
        minDays: min,
        maxDays: max,
        packages: r.packages ?? [],
      });
    }
    rates.sort((a, b) => a.priceCents - b.priceCents);
    if (this.cache.size >= 500)
      this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, { at: Date.now(), rates });
    return rates;
  }

  async quote(cep: string, input: QuoteItem[]): Promise<ShippingQuote> {
    const rates = await this.detailed(cep, input);
    return {
      rates: rates.map(({ serviceId, name, company, priceCents, minDays, maxDays }) => ({
        serviceId, name, company, priceCents, minDays, maxDays,
      })),
    };
  }
}
