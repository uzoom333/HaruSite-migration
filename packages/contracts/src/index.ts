/** Contratos HTTP compartilhados. Dinheiro sempre em centavos, nunca ponto flutuante. */
export interface Product {
  id: string;
  slug: string;
  name: string;
  image: string;
  priceCents: number;
  sku: string;
  stock: number | null;
  maxQuantity: number;
}
export interface CartItem extends Product {
  quantity: number;
  lineTotalCents: number;
}
export interface Cart {
  items: CartItem[];
  quantity: number;
  subtotalCents: number;
  checkoutAvailable: false;
}
export interface PostalAddress {
  cep: string;
  city: string;
  state: string;
  shippingAvailable: false;
}
export interface ShippingRate {
  /** Id do serviço no Melhor Envio. */
  serviceId: number;
  name: string;
  company: string;
  priceCents: number;
  minDays: number;
  maxDays: number;
}
export interface ShippingQuote {
  rates: ShippingRate[];
}
