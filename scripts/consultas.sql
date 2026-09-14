-- Consultas de relatório. Rodar com: node scripts/consultar.cjs
-- Alvo: .local/haru_ficticio.db (dados INVENTADOS, ver semear-vendas-ficticias.cjs).
-- Cada bloco começa com "-- @nome". Blocos vazios são ignorados.

-- @receita-por-mes
-- RESOLVIDA, como referência de formato.
-- A armadilha: pedido 'cancelled' e 'pending' NÃO é receita. Somar tudo infla
-- o faturamento e ninguém percebe, porque o número continua parecendo plausível.
SELECT strftime('%Y-%m', created_at) AS mes,
       count(*)                      AS pedidos,
       sum(total_cents) / 100.0      AS receita_reais
FROM orders
WHERE status IN ('paid', 'shipped', 'delivered')
GROUP BY mes
ORDER BY mes;

-- @mais-vendidos
-- RF25. Quais SKUs venderam mais unidades nos últimos 90 dias?
-- Devolver: sku, nome do produto, unidades, receita da linha.
-- Pense: soma quantity ou conta pedidos? São respostas diferentes.
-- Mesmo filtro de status da consulta acima — o problema não some porque mudou a tabela.
-- Data: created_at está em orders, não em order_items. Vai precisar de JOIN.


-- @ticket-medio
-- Qual o valor médio de um pedido confirmado, por mês?
-- Cuidado: média de total_cents inclui frete. Isso é ticket ou é receita por pedido?
-- Decida qual você quer e deixe explícito no nome da coluna.


-- @produto-parado
-- Quais variantes não venderam nenhuma unidade nos últimos 60 dias?
-- Pegadinha: um INNER JOIN nunca devolve quem não vendeu — o produto some do
-- resultado em vez de aparecer com zero. Qual tipo de JOIN resolve?


-- @estoque-baixo
-- RF21. Variantes com saldo abaixo de 50 unidades.
-- Lembre que stock pode ser NULL (= desconhecido, não zero). NULL < 50 é NULL,
-- não é verdadeiro: o produto sem saldo informado sumiria do alerta silenciosamente.


-- @reconciliacao
-- A que mais importa. variants.stock é o saldo autoritativo; stock_movements é o
-- histórico que explica como ele chegou lá. Duas fontes = podem divergir por bug.
-- Listar toda variante onde stock != soma dos deltas do razão.
-- Num sistema saudável esta consulta devolve ZERO linhas. Se devolver linha,
-- algum caminho de código alterou saldo sem registrar movimento.

