-- FK commodity_id / region_id: da `serial` a `integer`.
-- `SET DATA TYPE integer` è di fatto un no-op (serial È già un integer),
-- ma `serial` porta con sé un DEFAULT nextval(): è quello il problema
-- (un INSERT senza il valore prenderebbe un id di sequenza invece di
-- fallire). Lo togliamo esplicitamente — drizzle-kit non lo genera da solo.
ALTER TABLE "price_history" ALTER COLUMN "commodity_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "price_history" ALTER COLUMN "commodity_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "retail_fuel_prices" ALTER COLUMN "region_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "retail_fuel_prices" ALTER COLUMN "region_id" DROP DEFAULT;--> statement-breakpoint
-- Le sequenze orfane (price_history_commodity_id_seq,
-- retail_fuel_prices_region_id_seq) restano: sono innocue e rimuoverle
-- aggiungerebbe solo rischio se il nome non combaciasse.
