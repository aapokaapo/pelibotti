# pelibotti

Multi-server Discord league bot with a public web portal, Prisma storage for PostgreSQL or SQLite, discord.js v14 slash commands, and automated weekly scheduling.

## Features

- PostgreSQL- or SQLite-backed league data with Prisma
- Guild-scoped teams with channel-scoped fixtures and map pools
- Slash commands for importing data, linking channels, scheduling posts, and sending manual schedule messages
- Per-channel default availability dates, optional automated posting, and manual scheduling triggers
- Public website with a bot invite button and current fixtures overview
- Admin upload portal for teams, fixtures, and map pools
- Availability tracking stored in the configured Prisma database and reflected back into the scheduling embed

## Project structure

```text
prisma/
  schema.prisma
  schema.sqlite.prisma
src/
  commands/
    admin/
    team/
  events/
  generated/
  jobs/
  lib/
  utils/
  web/
index.js
```

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

3. Configure the environment values in `.env`:

   ```env
   DISCORD_TOKEN=your_discord_bot_token
   DISCORD_CLIENT_ID=your_discord_application_client_id
   DATABASE_PROVIDER=postgresql
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pelibotti?schema=public
   ADMIN_API_KEY=replace-with-a-long-random-string
   WEB_PORT=3000
   DISCORD_GUILD_ID=
   BOT_TIMEZONE=UTC
   AUTO_SCHEDULE_CRON=0 12 * * 0
   DISCORD_BOT_PERMISSIONS=274877991936
   LEAGUE_START_DATE=2026-01-05
   ```

   - `DATABASE_PROVIDER` defaults to `postgresql`. Set it to `sqlite` to use SQLite instead.
   - `DATABASE_URL` must be a full Prisma connection string for the selected provider. For SQLite you can use `file:./prisma/dev.db`.
   - `ADMIN_API_KEY` protects the admin upload portal.
   - `WEB_PORT` controls the built-in website port.
   - `DISCORD_GUILD_ID` is optional. When set, commands are registered only for that guild.
   - `BOT_TIMEZONE` is used when formatting schedule dates and when evaluating the weekly automation cron.
   - `AUTO_SCHEDULE_CRON` controls the weekly automation schedule and defaults to `0 12 * * 0`.
   - `DISCORD_BOT_PERMISSIONS` lets you override the generated invite URL permissions.
   - `LEAGUE_START_DATE` is optional. When omitted, the bot falls back to the ISO week number for scheduling.

4. Generate the Prisma clients and initialize your database:

   ```bash
   npm run prisma:generate
   npm run prisma:push
   ```

   `npm run prisma:push` and `npm run prisma:migrate` automatically pick the Prisma schema that matches `DATABASE_PROVIDER`.

   For SQLite, switch the environment first and run:

   ```bash
   npm run prisma:generate
   DATABASE_PROVIDER=sqlite DATABASE_URL=file:./prisma/dev.db npm run prisma:push
   ```

   For PostgreSQL migrations, keep using:

   ```bash
   npm run prisma:migrate
   ```

   If you want migration files for local SQLite development, use:

   ```bash
   DATABASE_PROVIDER=sqlite DATABASE_URL=file:./prisma/dev.db npm run prisma:migrate
   ```

5. Start the bot and website:

   ```bash
   npm start
   ```

## Slash commands

### Administrator commands

- `/upload_teams file:<attachment>`
- `/upload_fixtures file:<attachment>` (applies to all configured channels)
- `/upload_maps file:<attachment>` (applies to all configured channels)

### Team commands

- `/setup_team`
- `/set_default_dates dates:"Tue 20:00, Thu 20:00"` (up to 23 options)
- `/set_auto_schedule enabled:true`
- `/schedule_time`
- `/schedule_now`

## Website

- `/` shows the current week fixture list and the Discord invite link.
- `/invite` redirects straight to the Discord bot invite flow.
- `/admin` provides an admin login and upload forms for teams, fixtures, and map pools.

## Import formats

### Teams

CSV headers or JSON fields:

- `id` (optional)
- `name` (required)
- `logoUrl` (optional)

### Fixtures

CSV headers or JSON fields:

- `id` (optional)
- `weekNumber` (required)
- `teamAId` or `teamAName` (required)
- `teamBId` or `teamBName` (required)

Fixture uploads apply to every configured channel.

### Map pools

CSV headers or JSON fields:

- `id` (optional)
- `weekNumber` (required)
- `maps` (required array in JSON, or a `|` / `;` / quoted comma-separated string in CSV)

Map pool uploads apply to every configured channel.

## Weekly scheduling flow

- The bot runs a weekly cron job (`AUTO_SCHEDULE_CRON`) and automatically posts one scheduling message for each channel that has automation enabled.
- Automation only runs for channels that have a linked team, saved default dates, and `/set_auto_schedule enabled:true`.
- Each schedule post is marked per channel and per week to avoid duplicate automated posts.
- Each configured channel looks up the linked team, the current week fixture, and that week's map pool for that channel.
- The bot posts an embed with matchup details, that week's map pool, the configured schedule time, availability buttons, and a text-input suggest-date flow for proposing custom times.
