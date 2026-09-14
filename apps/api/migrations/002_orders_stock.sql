-- Pedidos e histórico de estoque. Só estrutura ditada pelo domínio: nada aqui
-- decide regra comercial pendente (cupom, cadastro, fiscal ficam para outra migração).
-- Dialeto SQLite/D1, mesmas convenções da 001: dinheiro em centavos, tempo em
-- texto UTC de largura fixa, booleano como 0/1.

-- id é texto opaco, não sequencial: número de pedido crescente revela ao público
-- quantas vendas a loja fez. Quem gera o id é a aplicação.
CREATE TABLE orders (
  id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('pending','paid','cancelled','shipped','delivered','refunded')),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents integer NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  discount_cents integer NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now')),
  -- Restrição de tabela: precisa vir depois de todas as colunas que ela usa.
  -- O banco confere a aritmética: um total divergente do somatório não entra.
  -- Erro de cálculo na aplicação vira falha de escrita, não relatório errado.
  CHECK (total_cents = subtotal_cents + shipping_cents - discount_cents)
);

-- Cópia do que foi vendido, não referência ao catálogo atual: reajustar preço
-- não pode reescrever o histórico de vendas passadas.
-- sku é texto sem chave estrangeira de propósito. Com FK, retirar uma variante do
-- catálogo exigiria apagar ou travar pedidos antigos. O custo é que o banco não
-- garante o join com variants; em troca, o pedido sobrevive ao fim do produto.
CREATE TABLE order_items (
  order_id text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku text NOT NULL,
  product_name text NOT NULL,
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total_cents integer NOT NULL CHECK (line_total_cents = unit_price_cents * quantity),
  PRIMARY KEY (order_id, sku)
);

-- Livro-razão do estoque: toda alteração de saldo vira uma linha, nunca um UPDATE
-- silencioso. Responde "por que sumiu estoque" com data, motivo e pedido.
-- id integer PRIMARY KEY é apelido do rowid no SQLite: numera sozinho e a ordem
-- de inserção preserva a ordem do histórico.
CREATE TABLE stock_movements (
  id integer PRIMARY KEY,
  sku text NOT NULL,
  delta integer NOT NULL CHECK (delta <> 0),
  reason text NOT NULL CHECK (reason IN ('entrada','venda','cancelamento','ajuste','perda')),
  order_id text REFERENCES orders(id),
  note text,
  created_at text NOT NULL DEFAULT (datetime('now'))
);

-- variants.stock continua sendo o saldo autoritativo, porque é ele que permite a
-- baixa atômica sem transação interativa:
--   UPDATE variants SET stock = stock - ?1 WHERE sku = ?2 AND stock >= ?1
-- stock_movements explica como o saldo chegou ali. Como são duas fontes, elas
-- podem divergir por bug: a consulta de reconciliação existe para detectar isso.

CREATE INDEX orders_created_idx ON orders(created_at);       -- receita por período
CREATE INDEX orders_status_idx ON orders(status);            -- filtrar venda confirmada
CREATE INDEX order_items_sku_idx ON order_items(sku);        -- mais vendidos por produto
CREATE INDEX stock_movements_sku_idx ON stock_movements(sku, created_at);
