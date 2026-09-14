# pelibotti

Multi-server Discord league bot with a public web portal, Prisma/PostgreSQL storage, discord.js v14 slash commands, and automated weekly scheduling.

## Features

- PostgreSQL-backed league data with Prisma
- Guild-scoped teams, fixtures, and map pools
- Slash commands for importing data, linking channels, scheduling posts, and sending manual schedule messages
- Per-channel default availability dates and automated posting times
- Public website with a bot invite button and current fixtures overview
- Admin upload portal for teams, fixtures, and map pools
- Availability tracking stored in PostgreSQL and reflected back into the scheduling embed

## Project structure

```text
prisma/
  schema.prisma
src/
  commands/
    admin/
    team/
  events/
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
   DATABASE_URL=******HOST:5432/pelibotti?schema=public
   ADMIN_API_KEY=replace-with-a-long-random-string
   WEB_PORT=3000
   DISCORD_GUILD_ID=
   BOT_TIMEZONE=UTC
   DISCORD_BOT_PERMISSIONS=274877991936
   LEAGUE_START_DATE=2026-01-05
   ```

   - `DATABASE_URL` must be a full Prisma/PostgreSQL connection URI.
   - `ADMIN_API_KEY` protects the admin upload portal.
   - `WEB_PORT` controls the built-in website port.
   - `DISCORD_GUILD_ID` is optional. When set, commands are registered only for that guild.
   - `BOT_TIMEZONE` is used for per-channel scheduled posting times.
   - `DISCORD_BOT_PERMISSIONS` lets you override the generated invite URL permissions.
   - `LEAGUE_START_DATE` is optional. When omitted, the bot falls back to the ISO week number for scheduling.

4. Generate the Prisma client and push the schema to PostgreSQL:

   ```bash
   npm run prisma:generate
   npm run prisma:push
   ```

5. Start the bot and website:

   ```bash
   npm start
   ```

## Slash commands

### Administrator commands

- `/upload_teams file:<attachment>`
- `/upload_fixtures file:<attachment>`
- `/upload_maps file:<attachment>`

### Team commands

- `/setup_team`
- `/set_default_dates dates:"Tue 20:00, Thu 20:00"`
- `/set_schedule_time weekday:<day> time:"20:00"`
- `/schedule_now`

## Website

- `/` shows the current fixture list and the Discord invite link.
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

### Map pools

CSV headers or JSON fields:

- `id` (optional)
- `weekNumber` (required)
- `maps` (required array in JSON, or a `|` / `;` / quoted comma-separated string in CSV)

## Weekly scheduling flow

- The bot checks every minute for channels whose configured weekday and time match the current `BOT_TIMEZONE` time.
- Automation only runs for channels that have a linked team and saved default dates.
- Each schedule post is marked per channel and per week to avoid duplicate automated posts.
- Each configured channel looks up the linked team, the upcoming fixture, and that week's map pool.
- The bot posts an embed with matchup details, the configured schedule time, and availability buttons.
