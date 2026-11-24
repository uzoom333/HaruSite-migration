"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/app/_lib/i18n";
import { FRETE_REAL, moneyBr, quoteFrete, type FreteRate } from "@/app/_lib/frete";

const maskCep = (value: string) =>
  value
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/^(\d{5})(\d)/, "$1-$2");

interface Result {
  error?: string;
  city?: string;
  uf?: string;
  rates?: FreteRate[];
}

export default function Shipping({ slug }: { slug: string }) {
  const { t } = useI18n();
  const [cep, setCep] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const [loading, setLoading] = useState(false);

  async function lookup(cepDigits: string) {
    let located = false;
    setLoading(true);
    try {
      const response = await fetch(
        `https://viacep.com.br/ws/${cepDigits}/json/`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) throw new Error("network");
      const data = await response.json();
      if (!data || data.erro) throw new Error("miss");
      const uf = String(data.uf || "").toUpperCase();
      located = true;
      const rates = await quoteFrete(cepDigits, uf, [{ slug, qty: 1 }]);
      setResult(
        rates.length
          ? { city: data.localidade || "", uf, rates }
          : { error: "ship.none" },
      );
    } catch (error) {
      setResult({
        error:
          error instanceof Error && error.message === "miss"
            ? "product.cepMiss"
            : located
              ? "ship.err"
              : "product.cepNet",
      });
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      setResult({ error: "product.cepErr" });
      return;
    }
    setResult(null);
    void lookup(digits);
  }

  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <h2 className="text-sm font-light uppercase">{t("product.ship")}</h2>
      <form className="flex flex-col gap-2" onSubmit={submit} noValidate>
        <label htmlFor="cepInput" className="sr-only">
          {t("product.cep")}
        </label>
        <span className="flex gap-2">
          <input
            id="cepInput"
            name="cep"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={9}
            value={cep}
            onChange={(event) => setCep(maskCep(event.target.value))}
            placeholder={t("product.cepPh")}
            className="input focus:outline-0"
          />
          <button
            type="submit"
            disabled={loading}
            className="btn bg-olive-deep font-light text-sm uppercase tracking-widest text-white"
          >
            {t("product.cepGo")}
          </button>
        </span>
      </form>

      {loading && (
        <p className="text-sm font-light text-muted">{t("ship.loading")}</p>
      )}

      {result?.error && (
        <p className="text-sm font-light text-muted">{t(result.error)}</p>
      )}

      {result?.rates && (
        <>
          <p className="text-sm font-light">
            {t("product.cepWhere", { city: result.city ?? "", uf: result.uf ?? "" })}
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {result.rates.map((rate) => (
              <li key={rate.id} className="flex justify-between gap-4">
                <span>{rate.name}</span>
                <span className="font-light text-muted">
                  {t("product.daysRange", { a: rate.min, b: rate.max })}
                </span>
                <span>{moneyBr(rate.price)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs font-light text-muted">
            {t(FRETE_REAL ? "ship.note" : "product.shipNote")}
          </p>
        </>
      )}
    </section>
  );
}
