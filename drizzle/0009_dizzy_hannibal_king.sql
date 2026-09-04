CREATE TABLE "provinces" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(2) NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "provinces_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "retail_fuel_prices_it" (
	"id" serial PRIMARY KEY NOT NULL,
	"province_id" integer NOT NULL,
	"fuel_type" varchar(32) NOT NULL,
	"price_self_avg" numeric(10, 4),
	"price_served_avg" numeric(10, 4),
	"self_station_count" integer,
	"served_station_count" integer,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"unit" varchar(16) DEFAULT 'liter' NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"retrieved_at" timestamp,
	"source" varchar(64) DEFAULT 'mimit' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retail_fuel_prices_it" ADD CONSTRAINT "retail_fuel_prices_it_province_id_provinces_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."provinces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "retail_fuel_it_province_date_idx" ON "retail_fuel_prices_it" USING btree ("province_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "retail_fuel_it_province_fuel_recorded_at_unique" ON "retail_fuel_prices_it" USING btree ("province_id","fuel_type","recorded_at");