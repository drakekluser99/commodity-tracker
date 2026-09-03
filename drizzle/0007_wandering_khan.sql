CREATE TABLE "weekly_narratives" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_of" timestamp NOT NULL,
	"kind" varchar(32) NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_narratives_week_kind_unique" ON "weekly_narratives" USING btree ("week_of","kind");--> statement-breakpoint
CREATE INDEX "weekly_narratives_week_of_idx" ON "weekly_narratives" USING btree ("week_of");