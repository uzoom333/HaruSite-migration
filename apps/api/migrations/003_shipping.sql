-- Frete (Melhor Envio). Medidas da embalagem pronta para envio, por variante.
-- NULL é medida desconhecida: a cotação recusa o produto em vez de supor um valor.
ALTER TABLE variants ADD COLUMN weight_g integer CHECK (weight_g > 0);
ALTER TABLE variants ADD COLUMN width_cm integer CHECK (width_cm > 0);
ALTER TABLE variants ADD COLUMN height_cm integer CHECK (height_cm > 0);
ALTER TABLE variants ADD COLUMN length_cm integer CHECK (length_cm > 0);

-- Coleção da V6.2: entra a casa de quatro; o suporte foi descontinuado.
INSERT INTO products(id,slug,name,image) VALUES
 ('p4','kit-quatro','Kit da casa','/background/product-casa-1.jpg');
INSERT INTO variants(sku,product_id,price_cents,stock) VALUES
 ('HARU-KIT-QUATRO','p4',16800,NULL);
UPDATE products SET active=0 WHERE id='p3';

CREATE TABLE oauth_tokens (
  environment text PRIMARY KEY CHECK (environment IN ('sandbox','production')),
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at integer NOT NULL
);
CREATE TABLE oauth_states (
  state_hash text PRIMARY KEY,
  expires_at integer NOT NULL
);
-- reference é o número do pedido da loja: UNIQUE impede duas etiquetas para ele.
CREATE TABLE shipments (
  reference text PRIMARY KEY,
  environment text NOT NULL,
  melhor_envio_id text UNIQUE,
  status text NOT NULL,
  tracking text,
  price_cents integer,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);
