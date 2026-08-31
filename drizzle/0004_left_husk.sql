CREATE TABLE "fetch_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" varchar(64) NOT NULL,
	"job" varchar(64) NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"ok" boolean,
	"points_saved" integer,
	"error_text" text
);
--> statement-breakpoint
CREATE INDEX "fetch_runs_source_started_idx" ON "fetch_runs" USING btree ("source","started_at");