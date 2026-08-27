CREATE TABLE "commodities" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"category" varchar(32) NOT NULL,
	"unit" varchar(32) NOT NULL,
	CONSTRAINT "commodities_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"commodity_id" serial NOT NULL,
	"price" numeric(12, 4) NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"source" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country_code" varchar(2),
	"continent" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retail_fuel_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_id" serial NOT NULL,
	"fuel_type" varchar(32) NOT NULL,
	"price" numeric(10, 4) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"unit" varchar(16) DEFAULT 'liter' NOT NULL,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"source" varchar(64) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_commodity_id_commodities_id_fk" FOREIGN KEY ("commodity_id") REFERENCES "public"."commodities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_fuel_prices" ADD CONSTRAINT "retail_fuel_prices_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_history_commodity_date_idx" ON "price_history" USING btree ("commodity_id","recorded_at");--> statement-breakpoint
CREATE INDEX "retail_fuel_region_date_idx" ON "retail_fuel_prices" USING btree ("region_id","recorded_at");