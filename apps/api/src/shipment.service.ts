import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { MelhorEnvioClient, UnknownOutcomeError } from "./melhor-envio.client";
import { ShippingService, type QuoteItem } from "./shipping.service";

export interface Recipient {
  name: string;
  document: string;
  phone?: string;
  email?: string;
  address: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  uf: string;
  cep: string;
}
interface Shipment {
  reference: string;
  environment: string;
  melhor_envio_id: string | null;
  status: string;
  tracking: string | null;
  price_cents: number | null;
}
interface RemoteStatus {
  status?: string;
  tracking?: string | null;
}

/**
 * Etiquetas. Cada passo é uma chamada administrativa separada, porque comprar
 * gasta saldo da carteira: nada aqui roda sozinho a partir do checkout.
 */
@Injectable()
export class ShipmentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly client: MelhorEnvioClient,
    private readonly shipping: ShippingService,
  ) {}

  private sender() {
    const e = process.env;
    const from = {
      name: e.SHIP_FROM_NAME,
      phone: e.SHIP_FROM_PHONE,
      email: e.SHIP_FROM_EMAIL,
      document: e.SHIP_FROM_DOCUMENT,
      company_document: e.SHIP_FROM_COMPANY_DOCUMENT || undefined,
      address: e.SHIP_FROM_ADDRESS,
      number: e.SHIP_FROM_NUMBER,
      district: e.SHIP_FROM_DISTRICT,
      city: e.SHIP_FROM_CITY,
      state_abbr: e.SHIP_FROM_UF,
      postal_code: e.SHIP_FROM_CEP?.replace(/\D/g, ""),
      country_id: "BR",
    };
    const missing = (
      ["name", "address", "number", "district", "city", "state_abbr", "postal_code"] as const
    ).filter((k) => !from[k]);
    if (missing.length || (!from.document && !from.company_document))
      throw new ServiceUnavailableException("Remetente incompleto no .env");
    return from;
  }

  find(reference: string): Shipment {
    const row = this.db.first<Shipment>(
      "SELECT reference,environment,melhor_envio_id,status,tracking,price_cents FROM shipments WHERE reference=? AND environment=?",
      [reference, this.client.environment],
    );
    if (!row) throw new NotFoundException("Envio não encontrado");
    return row;
  }
  private set(reference: string, status: string) {
    this.db.run(
      "UPDATE shipments SET status=?,updated_at=datetime('now') WHERE reference=?",
      [status, reference],
    );
  }

  async create(reference: string, serviceId: number, to: Recipient, input: QuoteItem[]) {
    const from = this.sender();
    const items = this.shipping.items(input);
    const rate = (await this.shipping.detailed(to.cep, input, true)).find(
      (r) => r.serviceId === serviceId,
    );
    if (!rate) throw new BadRequestException("Serviço indisponível para este envio");
    // Correios, J&T e Loggi aceitam um volume por etiqueta.
    if (rate.packages.length !== 1)
      throw new BadRequestException("O envio precisa caber em um único volume");
    const box = rate.packages[0];
    const { changes } = this.db.run(
      "INSERT INTO shipments(reference,environment,status) VALUES(?,?,'creating') ON CONFLICT DO NOTHING",
      [reference, this.client.environment],
    );
    if (!changes) throw new ConflictException("Pedido já tem envio");
    try {
      const created = await this.client.post<{ id?: string; price?: string | number }>("cart", {
        service: serviceId,
        from,
        to: {
          name: to.name,
          document: to.document,
          phone: to.phone,
          email: to.email,
          address: to.address,
          number: to.number,
          complement: to.complement,
          district: to.district,
          city: to.city,
          state_abbr: to.uf,
          postal_code: to.cep,
          country_id: "BR",
        },
        products: items.map((i) => ({
          name: i.name,
          quantity: String(i.quantity),
          unitary_value: (i.priceCents / 100).toFixed(2),
        })),
        volumes: [
          {
            height: Number(box.dimensions.height),
            width: Number(box.dimensions.width),
            length: Number(box.dimensions.length),
            weight: Number(box.weight),
          },
        ],
        options: {
          insurance_value: items.reduce((n, i) => n + i.priceCents * i.quantity, 0) / 100,
          receipt: false,
          own_hand: false,
          reverse: false,
          // Declaração de conteúdo. Com nota fiscal este campo e invoice.key mudam.
          non_commercial: true,
          tags: [{ tag: reference, url: null }],
        },
      });
      if (!created.id) throw new UnknownOutcomeError("Resposta sem id do envio");
      this.db.run(
        "UPDATE shipments SET melhor_envio_id=?,status='cart',price_cents=?,updated_at=datetime('now') WHERE reference=?",
        [created.id, Math.round(Number(created.price ?? 0) * 100), reference],
      );
    } catch (error) {
      // Recusa clara libera nova tentativa; resultado incerto fica travado para conferência.
      if (error instanceof UnknownOutcomeError) this.set(reference, "unknown");
      else this.db.run("DELETE FROM shipments WHERE reference=?", [reference]);
      throw error;
    }
    return this.find(reference);
  }

  /** Compra a etiqueta com o saldo da carteira. A troca de status impede compra dupla. */
  async buy(reference: string) {
    const row = this.find(reference);
    const { changes } = this.db.run(
      "UPDATE shipments SET status='buying',updated_at=datetime('now') WHERE reference=? AND status='cart'",
      [reference],
    );
    if (!changes) throw new ConflictException(`Envio está em "${row.status}"`);
    try {
      await this.client.post("shipment/checkout", { orders: [row.melhor_envio_id] });
    } catch (error) {
      // Sem resposta, a compra pode ter ocorrido: use a sincronização antes de repetir.
      if (!(error instanceof UnknownOutcomeError)) this.set(reference, "cart");
      throw error;
    }
    this.set(reference, "released");
    return this.find(reference);
  }
  private id(reference: string): string {
    const row = this.find(reference);
    if (!row.melhor_envio_id)
      throw new ConflictException("Envio sem id: confira no painel do Melhor Envio");
    return row.melhor_envio_id;
  }
  async generate(reference: string) {
    const id = this.id(reference);
    const result = await this.client.post<Record<string, { status?: boolean; message?: string }>>(
      "shipment/generate",
      { orders: [id] },
    );
    if (!result[id]?.status)
      throw new ConflictException(result[id]?.message ?? "Etiqueta não gerada");
    this.set(reference, "generated");
    return this.find(reference);
  }
  async print(reference: string) {
    const { url } = await this.client.post<{ url: string }>("shipment/print", {
      mode: "private",
      orders: [this.id(reference)],
    });
    return { url };
  }
  async sync(reference: string) {
    const id = this.id(reference);
    const data = await this.client.post<Record<string, RemoteStatus>>("shipment/tracking", {
      orders: [id],
    });
    this.apply(id, data[id], true);
    return this.find(reference);
  }
  /** Webhooks podem repetir ou chegar fora de ordem; o estado final não volta atrás. */
  apply(id: string, data?: RemoteStatus, confirmed = false) {
    if (typeof data?.status !== "string") return;
    // Um "pending" atrasado reabriria a compra: só vale quando consultado agora.
    if (data.status === "pending" && !confirmed) return;
    const status = data.status === "pending" ? "cart" : data.status;
    this.db.run(
      `UPDATE shipments SET status=?,tracking=COALESCE(?,tracking),updated_at=datetime('now')
       WHERE melhor_envio_id=? AND status NOT IN ('delivered','canceled','cancelled')`,
      [status, data.tracking ?? null, id],
    );
  }
}
