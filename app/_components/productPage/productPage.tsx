"use client";

import { useState, useRef, type MouseEvent, type TouchEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, QrCode, CreditCard, ShieldCheck } from "lucide-react";
import { useCart } from "../cart/cartContext";
import { useI18n, money } from "@/app/_lib/i18n";
import Shipping from "../shipping/shipping";
import { SPECS, type ProductShape } from "@/app/_data/products";

interface ProductPageProps {
  product: ProductShape;
  collection: ProductShape[];
}

export default function ProductPage({ product, collection }: ProductPageProps) {
  const [active, setActive] = useState(0);
  const [isFading, setIsFading] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");

  const frameRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const { add, openCart, openCheckout } = useCart();
  const { t } = useI18n();

  const others = collection.filter((p) => p.slug !== product.slug && p.slug !== "suporte");
  const specs = SPECS[product.slug] ?? [];

  const handleThumbClick = (index: number) => {
    if (index === active) return;
    setIsFading(true);
    setTimeout(() => {
      setActive(index);
      setIsFading(false);
    }, 180);
  };

  // Zoom no desktop seguindo o cursor
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    setZoomOrigin(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
    setIsZoomed(true);
  };

  const handleMouseLeave = () => {
    setIsZoomed(false);
    setZoomOrigin("50% 50%");
  };

  // Suporte a swipe no mobile
  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.changedTouches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        // swipe esquerda -> próxima foto
        handleThumbClick((active + 1) % product.gallery.length);
      } else {
        // swipe direita -> foto anterior
        handleThumbClick(
          (active - 1 + product.gallery.length) % product.gallery.length,
        );
      }
    }
  };

  return (
    <main id="conteudo" className="max-w-7xl mx-auto px-6 md:px-12 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
        {/* Galeria de Fotos */}
        <section className="flex flex-col gap-4">
          <div
            ref={frameRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="relative overflow-hidden rounded-xl bg-black/5 aspect-square select-none cursor-zoom-in"
          >
            <Image
              src={product.gallery[active]}
              alt={t(`${product.prefix}.alt`)}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
              style={{
                transformOrigin: zoomOrigin,
                transform: isZoomed ? "scale(1.4)" : "scale(1)",
              }}
              className={`object-cover transition-transform duration-200 ease-out ${
                isFading ? "opacity-40" : "opacity-100"
              }`}
            />
          </div>

          {/* Miniaturas */}
          <div className="grid grid-cols-4 gap-3">
            {product.gallery.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => handleThumbClick(i)}
                aria-label={`Foto ${i + 1}`}
                aria-current={i === active ? "true" : undefined}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                  i === active
                    ? "border-olive-deep shadow-md opacity-100 ring-2 ring-olive/20"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        </section>

        {/* Informações do Produto */}
        <section className="flex flex-col gap-6 text-olive-deep">
          <Link
            href="/#loja"
            className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted hover:text-olive-deep font-light w-fit"
          >
            <ChevronLeft size={16} />
            {t("product.back")}
          </Link>

          <div>
            <p className="text-xs uppercase tracking-widest text-muted font-light mb-1">
              {t("product.kicker")}
            </p>
            <h1 className="font-[Cormorant_Garamond_Variable] text-4xl md:text-5xl font-medium">
              {t(`${product.prefix}.name`)}
            </h1>
            <p className="text-2xl font-normal text-olive-deep mt-2">
              {money(product.price)}
            </p>
          </div>

          <p className="font-light text-base leading-relaxed text-text/90">
            {t(`${product.prefix}.desc`)}
          </p>

          {/* Botões de Ação */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                add(product);
                openCart();
              }}
              className="btn btn-outline border-olive-deep text-olive-deep hover:bg-olive-deep hover:text-white font-light text-xs uppercase tracking-widest px-8 py-3.5 flex-1"
            >
              {t("cart.add")}
            </button>
            <button
              type="button"
              onClick={() => openCheckout(product)}
              className="btn bg-olive-deep text-white hover:bg-forest font-light text-xs uppercase tracking-widest px-8 py-3.5 flex-1 shadow-sm"
            >
              {t("product.order")}
            </button>
          </div>

          {/* Linha de Confiança */}
          <div className="flex items-center gap-2 text-xs text-muted font-light border-y py-3 my-2">
            <ShieldCheck size={18} className="text-olive flex-shrink-0" />
            <span>{t("trust.line")}</span>
          </div>

          {/* Tabela de Especificações */}
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            {specs.map((spec) => (
              <div key={spec.label} className="border-b border-black/5 pb-2">
                <dt className="text-xs uppercase tracking-widest text-muted font-light">
                  {t(spec.label)}
                </dt>
                <dd className="text-sm font-normal text-text mt-0.5">
                  {t(spec.value)}
                </dd>
              </div>
            ))}
          </dl>

          {/* Calculadora de Frete */}
          <div className="pt-2">
            <Shipping slug={product.slug} />
          </div>

          {/* Métodos de Pagamento */}
          <section className="border-t pt-6 flex flex-col gap-3">
            <h2 className="text-xs uppercase tracking-widest text-muted font-medium">
              {t("product.pay")}
            </h2>
            <p className="text-xs text-muted font-light leading-relaxed">
              {t("product.payLead")}
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs font-light text-text/80 pt-1">
              <span className="flex items-center gap-1.5 border px-2.5 py-1.5 rounded bg-white/40">
                <QrCode size={16} />
                {t("product.pix")}
              </span>
              <span className="flex items-center gap-1.5 border px-2.5 py-1.5 rounded bg-white/40">
                <CreditCard size={16} />
                {t("product.applePay")}
              </span>
              <span className="flex items-center gap-1.5 border px-2.5 py-1.5 rounded bg-white/40">
                <CreditCard size={16} />
                {t("product.cardPay")}
              </span>
            </div>
          </section>
        </section>
      </div>

      {/* Seção "Na coleção" */}
      {others.length > 0 && (
        <section className="mt-24 pt-16 border-t border-black/10">
          <div className="mb-10 text-center md:text-left">
            <p className="text-xs uppercase tracking-widest text-muted font-light">
              {t("product.also")}
            </p>
            <h2 className="font-[Cormorant_Garamond_Variable] text-3xl md:text-4xl font-medium mt-1">
              {t("shop.title")}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
            {others.map((item) => (
              <Link
                key={item.slug}
                href={`/products/${item.slug}`}
                className="group flex flex-col gap-3"
              >
                <div className="relative aspect-square rounded-lg overflow-hidden bg-black/5">
                  <Image
                    src={item.gallery[0]}
                    alt={t(`${item.prefix}.alt`)}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div>
                  <h3 className="font-[Cormorant_Garamond_Variable] text-xl font-medium group-hover:underline underline-offset-4">
                    {t(`${item.prefix}.name`)}
                  </h3>
                  <p className="text-xs text-muted font-light mt-0.5">
                    {t(`${item.prefix}.meta`)}
                  </p>
                  <p className="text-sm font-medium text-olive-deep mt-1">
                    {money(item.price)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
