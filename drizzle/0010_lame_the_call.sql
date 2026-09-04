CREATE TABLE "data_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"table_name" varchar(64) NOT NULL,
	"entity_label" text NOT NULL,
	"field" varchar(32) NOT NULL,
	"old_value" numeric(12, 4) NOT NULL,
	"new_value" numeric(12, 4) NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"source" varchar(64) NOT NULL,
	"run_id" integer
);
--> statement-breakpoint
ALTER TABLE "fetch_runs" ADD COLUMN "latest_recorded_at" timestamp;--> statement-breakpoint
ALTER TABLE "data_corrections" ADD CONSTRAINT "data_corrections_run_id_fetch_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."fetch_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_corrections_table_recorded_idx" ON "data_corrections" USING btree ("table_name","recorded_at");