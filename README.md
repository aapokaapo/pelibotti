# pelibotti

Discord bot for posting a weekly availability poll with fixtures and map pools.

## Features

- Posts a weekly availability poll to a Discord channel
- Shows current week's fixtures and map pools
- Lets players toggle availability with buttons
- Lets players suggest extra time slots via modal
- Includes `/testi` to send a test poll
- Supports locale files (default: English)
- Supports per-channel locale and league start date via Discord commands
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
  - `teamName`: global fallback team used for fixture filtering
  - `leagueStartDate`: global fallback used to calculate current week (`YYYY-MM-DD`)
  - `locale`: global fallback locale file name in `locales/`
  - `channelSettings`: per-channel overrides for `teamName`, `locale`, and `leagueStartDate`
- `data/schedule.json`
  - `mapPools`: map pool text by week and pool key
  - `fixtures`: fixtures by week (supports legacy `opponent` format and league-wide team-vs-team format)

If `data/config.json` contains invalid JSON, or `data/schedule.json` contains invalid JSON/schema, the bot resets that file to defaults at startup to recover safely. Invalid schedule payloads submitted through `/setschedulejson` or `/loadschedule` are rejected and do not overwrite existing schedule data.

## Discord commands

- `/testi`
  - Sends a test poll to the current channel.
- `/setteam name:<team>`
  - Updates fixture-filter team for the current channel.
- `/setstartdate date:<YYYY-MM-DD>`
  - Updates league start date for the current channel.
- `/setlocale locale:<code>`
  - Updates locale for the current channel (e.g. `en`).
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

When `teamName` is changed with `/setteam`, the bot automatically picks only the fixtures where that team appears and shows its opponent for the current channel.

Each channel can set its own locale and league start date; weekly automated messages use that channel-specific configuration.

The bot also accepts legacy keys `MAP_POOLS` and `ALL_FIXTURES`, and legacy fixture entries with `opponent`, and normalizes them to the same internal format. Schedule imports are global for the bot, so legacy `opponent` entries in imported JSON must include explicit `team` values.

For legacy entries, include `team` with `opponent` to make team filtering unambiguous, for example: `{ "match_set": 1, "team": "Radio Silence", "opponent": "HSK", "pool": "A" }`.
