import { getProduct } from "@/app/_data/products";

export interface FreteItem {
  slug: string;
  qty: number;
}

export interface FreteRate {
  id: string;
  name: string;
  price: number;
  min: number;
  max: number;
}

/**
 * API de frete (`apps/api`), embutida no build. Sem ela, o site mantém a
 * estimativa por zona da V6.0. O token do Melhor Envio fica só na API.
 */
const API = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
export const FRETE_REAL = API !== "";

const ZONES: Record<string, string[]> = {
  se: ["SP", "RJ", "ES", "MG"],
  s: ["PR", "SC", "RS"],
  co: ["DF", "GO", "MT", "MS"],
  ne: ["BA", "SE", "AL", "PE", "PB", "RN", "CE", "PI", "MA"],
  n: ["AM", "PA", "AC", "RO", "RR", "AP", "TO"],
};

const ZONE_RATE: Record<
  string,
  { pac: number; sedex: number; pacDays: [number, number]; sedexDays: [number, number] }
> = {
  se: { pac: 14.9, sedex: 24.9, pacDays: [4, 7], sedexDays: [1, 3] },
  s: { pac: 18.9, sedex: 29.9, pacDays: [5, 8], sedexDays: [2, 4] },
  co: { pac: 22.9, sedex: 34.9, pacDays: [6, 10], sedexDays: [3, 5] },
  ne: { pac: 27.9, sedex: 42.9, pacDays: [7, 12], sedexDays: [4, 6] },
  n: { pac: 32.9, sedex: 49.9, pacDays: [8, 14], sedexDays: [5, 8] },
};

const cents = (value: number) => Math.round(value * 100) / 100;

function estimate(uf: string, items: FreteItem[]): FreteRate[] {
  const zone = Object.keys(ZONES).find((key) => ZONES[key].includes(uf)) ?? "se";
  const base = ZONE_RATE[zone];
  const weight = items.reduce(
    (sum, item) => sum + (getProduct(item.slug)?.weight ?? 1) * item.qty,
    0,
  );
  const factor = weight <= 1 ? 1 : weight <= 2 ? 1.15 : weight <= 4 ? 1.28 : 1.4;
  return [
    { id: "pac", name: "PAC", price: cents(base.pac * factor), min: base.pacDays[0], max: base.pacDays[1] },
    { id: "sedex", name: "SEDEX", price: cents(base.sedex * factor), min: base.sedexDays[0], max: base.sedexDays[1] },
  ];
}

interface ApiRate {
  serviceId: number;
  name: string;
  company: string;
  priceCents: number;
  minDays: number;
  maxDays: number;
}

async function request(cep: string, items: FreteItem[]): Promise<FreteRate[]> {
  const response = await fetch(`${API}/api/shipping/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Haru-Request": "1" },
    body: JSON.stringify({
      cep,
      items: items.map((item) => ({ slug: item.slug, quantity: item.qty })),
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("frete");
  const data: { rates: ApiRate[] } = await response.json();
  return data.rates.map((rate) => ({
    id: String(rate.serviceId),
    name: rate.company ? `${rate.company} ${rate.name}` : rate.name,
    price: rate.priceCents / 100,
    min: rate.minDays,
    max: rate.maxDays,
  }));
}

// O cabeçalho monta duas gavetas (desktop e celular): a mesma consulta sai uma vez só.
const pending = new Map<string, Promise<FreteRate[]>>();

export async function quoteFrete(
  cep: string,
  uf: string,
  items: FreteItem[],
): Promise<FreteRate[]> {
  if (!FRETE_REAL) return estimate(uf, items);
  const key = freteKey(cep, uf, items);
  let current = pending.get(key);
  if (!current) {
    current = request(cep, items).finally(() => pending.delete(key));
    pending.set(key, current);
  }
  return current;
}

export function freteKey(cep: string, uf: string, items: FreteItem[]): string {
  return [cep, uf, ...items.map((item) => `${item.slug}:${item.qty}`)].join("|");
}

export const moneyBr = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
