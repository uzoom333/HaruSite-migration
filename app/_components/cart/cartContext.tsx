"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ProductShape } from "@/app/_data/products";

export interface CartLine {
  slug: string;
  price: number;
  image: string;
  qty: number;
}

export type CheckoutStep = "email" | "code" | "address" | "pay" | "done";

export interface CheckoutData {
  email: string;
  code: string;
  verified: boolean;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  uf: string;
  /** Id do serviço de envio e o nome mostrado ao cliente. */
  service: string;
  serviceName: string;
  shippingPrice: number;
  method: "pix" | "apple" | "card" | "boleto";
}

interface CartContextValue {
  items: CartLine[];
  count: number;
  total: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  view: "cart" | "check";
  setView: (view: "cart" | "check") => void;
  step: CheckoutStep;
  setStep: (step: CheckoutStep) => void;
  checkData: CheckoutData;
  updateCheckData: (patch: Partial<CheckoutData>) => void;
  add: (product: ProductShape) => void;
  remove: (slug: string) => void;
  increase: (slug: string) => void;
  decrease: (slug: string) => void;
  openCart: () => void;
  openCheckout: (product?: ProductShape) => void;
}

const KEY_CART = "haru-cart";
const KEY_CHECK = "haru-checkout";

const DEFAULT_CHECK: CheckoutData = {
  email: "",
  code: "",
  verified: false,
  cep: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  uf: "",
  service: "",
  serviceName: "",
  shippingPrice: 0,
  method: "pix",
};

const CartContext = createContext<CartContextValue | null>(null);

function loadCart(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY_CART);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return (parsed as CartLine[])
        .filter(
          (line) =>
            line &&
            typeof line.slug === "string" &&
            Number.isFinite(line.price) &&
            Number.isInteger(line.qty) &&
            line.qty > 0,
        )
        .map((line) => ({
          slug: line.slug,
          price: line.price,
          image: line.image,
          qty: Math.min(line.qty, 9),
        }));
    }
  } catch {
    /* storage bloqueado */
  }
  return [];
}

function loadCheck(): CheckoutData {
  if (typeof window === "undefined") return DEFAULT_CHECK;
  try {
    const raw = window.localStorage.getItem(KEY_CHECK);
    if (!raw) return DEFAULT_CHECK;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CHECK, ...parsed };
  } catch {
    return DEFAULT_CHECK;
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"cart" | "check">("cart");
  const [step, setStep] = useState<CheckoutStep>("email");
  const [checkData, setCheckData] = useState<CheckoutData>(DEFAULT_CHECK);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(loadCart());
    setCheckData(loadCheck());
  }, []);

  // Sincroniza abas
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY_CART) {
        setItems(loadCart());
      } else if (event.key === KEY_CHECK) {
        setCheckData(loadCheck());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY_CART, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items]);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY_CHECK, JSON.stringify(checkData));
    } catch {
      /* ignore */
    }
  }, [checkData]);

  const updateCheckData = useCallback((patch: Partial<CheckoutData>) => {
    setCheckData((prev) => ({ ...prev, ...patch }));
  }, []);

  const add = useCallback((product: ProductShape) => {
    setItems((prev) => {
      const line = prev.find((l) => l.slug === product.slug);
      if (line) {
        return prev.map((l) =>
          l.slug === product.slug
            ? { ...l, qty: Math.min(l.qty + 1, 9) }
            : l,
        );
      }
      return [
        ...prev,
        {
          slug: product.slug,
          price: product.price,
          image: product.gallery[0],
          qty: 1,
        },
      ];
    });
  }, []);

  const remove = useCallback((slug: string) => {
    setItems((prev) => prev.filter((l) => l.slug !== slug));
  }, []);

  const increase = useCallback((slug: string) => {
    setItems((prev) =>
      prev.map((l) =>
        l.slug === slug ? { ...l, qty: Math.min(l.qty + 1, 9) } : l,
      ),
    );
  }, []);

  const decrease = useCallback((slug: string) => {
    setItems((prev) =>
      prev
        .map((l) => (l.slug === slug ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0),
    );
  }, []);

  const openCart = useCallback(() => {
    setView("cart");
    setIsOpen(true);
  }, []);

  const openCheckout = useCallback(
    (product?: ProductShape) => {
      if (product) {
        add(product);
      }
      setView("check");
      if (checkData.verified && checkData.email) {
        setStep("address");
      } else if (checkData.email) {
        setStep("code");
      } else {
        setStep("email");
      }
      setIsOpen(true);
    },
    [add, checkData.email, checkData.verified],
  );

  const { count, total } = useMemo(
    () => ({
      count: items.reduce((sum, l) => sum + l.qty, 0),
      total: items.reduce((sum, l) => sum + l.qty * l.price, 0),
    }),
    [items],
  );

  const value = useMemo(
    () => ({
      items,
      count,
      total,
      isOpen,
      setIsOpen,
      view,
      setView,
      step,
      setStep,
      checkData,
      updateCheckData,
      add,
      remove,
      increase,
      decrease,
      openCart,
      openCheckout,
    }),
    [
      items,
      count,
      total,
      isOpen,
      view,
      step,
      checkData,
      updateCheckData,
      add,
      remove,
      increase,
      decrease,
      openCart,
      openCheckout,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
