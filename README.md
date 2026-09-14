# pelibotti

Multi-server Discord bot scaffold for league management with discord.js v14, Prisma, PostgreSQL, and node-cron.

## Features

- PostgreSQL-backed league data with Prisma
- Slash commands for importing teams, fixtures, and map pools
- Channel-to-team linking with select menus
- Per-channel default scheduling dates
- Weekly Sunday cron job that posts matchup embeds with availability buttons
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
   DATABASE_URL=postgresql://postgres:replace-me@HOST:5432/pelibotti?schema=public
   DISCORD_GUILD_ID=
   BOT_TIMEZONE=UTC
   LEAGUE_START_DATE=2026-01-05
   ```

   - `DATABASE_URL` must be a full Prisma/PostgreSQL connection URI.
   - `DISCORD_GUILD_ID` is optional. When set, commands are registered only for that guild.
   - `BOT_TIMEZONE` controls the Sunday 12:00 cron timezone.
   - `LEAGUE_START_DATE` is optional. When omitted, the bot falls back to the ISO week number for scheduling.

4. Generate the Prisma client and push the schema to PostgreSQL:

   ```bash
   npm run prisma:generate
   npm run prisma:push
   ```

5. Start the bot:

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
- `/schedule_now`

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

- Every Sunday at 12:00 PM (`BOT_TIMEZONE`), the bot scans all configured channels.
- Each configured channel looks up the linked team, the upcoming fixture, and that week's map pool.
- The bot posts an embed with matchup details and buttons for the channel's saved date options plus `Not Available`.
- Button clicks upsert user availability and refresh the embed's availability summary.
