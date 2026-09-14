# pelibotti

Discord bot for posting a weekly availability poll with fixtures and map pools.

## Features

- Posts a weekly availability poll to a Discord channel
- Shows current week's fixtures and map pools
- Lets players toggle availability with buttons
- Lets players suggest extra time slots via modal
- Includes `/testi` to send a test poll
- Supports locale files (default: English)
- Supports configuring default team and league start date via Discord commands
- Supports updating fixtures/map pools from JSON text or JSON file

## Requirements

- Node.js 18.17+
- Discord application and bot token

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

3. Configure `.env`:

   ```env
   DISCORD_TOKEN=your_discord_bot_token
   CHANNEL_ID=your_channel_id
   BOT_LOCALE=en
   ```

4. Start the bot:

   ```bash
   npm start
   ```

## Runtime data files

- `data/config.json`
  - `teamName`: team used to resolve that team's weekly matchups from league-wide fixtures
  - `leagueStartDate`: used to calculate current week (`YYYY-MM-DD`)
  - `locale`: locale file name in `locales/`
- `data/schedule.json`
  - `mapPools`: map pool text by week and pool key
  - `fixtures`: fixtures by week (supports legacy `opponent` format and league-wide team-vs-team format)

If `data/config.json` contains invalid JSON, or `data/schedule.json` contains invalid JSON/schema, the bot resets that file to defaults at startup to recover safely. Invalid schedule payloads submitted through `/setschedulejson` or `/loadschedule` are rejected and do not overwrite existing schedule data.

## Discord commands

- `/testi`
  - Sends a test poll to the current channel.
- `/setteam name:<team>`
  - Updates default team name.
- `/setstartdate date:<YYYY-MM-DD>`
  - Updates league start date for week calculation.
- `/setschedulejson json:<json>`
  - Loads fixtures and map pools from JSON text.
- `/loadschedule file:<json-file>`
  - Loads fixtures and map pools from attached JSON file.

## Schedule JSON format

```json
{
  "mapPools": {
    "1": {
      "A": "G1 • Mode — Map...",
      "B": "...",
      "C": "..."
    }
  },
  "fixtures": {
    "1": [
      { "match_set": 1, "teams": ["Radio Silence", "HSK"], "pool": "A" },
      { "match_set": 2, "teamA": "Souls Club", "teamB": "Spawn Trap", "pool": "B" }
    ]
  }
}
```

When `teamName` is changed with `/setteam`, the bot automatically picks only the fixtures where that team appears and shows its opponent.

The bot also accepts legacy keys `MAP_POOLS` and `ALL_FIXTURES`, and legacy fixture entries with `opponent`, and normalizes them to the same internal format. Legacy `opponent` entries are team-agnostic, so for strict team-specific filtering use `teams` or `teamA`/`teamB`.
