# pelibotti

Discord-botti viikoittaisen pelisaatavuuskyselyn lähettämiseen ja hallintaan.

## Mitä botti tekee

- lähettää viikoittaisen saatavuuskyselyn Discord-kanavalle
- näyttää kuluvan viikon vastustajat ja map poolit
- antaa pelaajien merkitä saatavuutensa painikkeilla
- antaa ehdottaa uusia peliaikoja modaalin kautta
- sisältää `/testi`-slash-komennon kyselyn testaamiseen

## Vaatimukset

- Node.js
- Discord-sovellus ja bottitoken

## Asennus

1. Asenna riippuvuudet:

   ```bash
   npm install discord.js dotenv moment-timezone cron
   ```

2. Luo projektin juureen `.env`-tiedosto:

   ```env
   DISCORD_TOKEN=your_discord_bot_token
   CHANNEL_ID=your_channel_id
   ```

3. Käynnistä botti:

   ```bash
   node bot.js
   ```

## Toiminta

- Botti lähettää viikoittaisen kyselyn lauantaisin klo 10:00 (`Europe/Helsinki`).
- Kyselyn sisältö, joukkueen nimi, ottelut ja map poolit on määritelty tiedostossa `/home/runner/work/pelibotti/pelibotti/bot.js`.
- Nykyinen toteutus on kovakoodattu joukkueelle `Radio Silence` ja viikoille 1–7.

## Muokattavat asetukset

Jos haluat käyttää bottia toiselle joukkueelle tai eri kaudelle, päivitä tiedostosta `/home/runner/work/pelibotti/pelibotti/bot.js` ainakin:

- `TEAM_NAME`
- `MAP_POOLS`
- `ALL_FIXTURES`
- `getCurrentWeek()`-funktion kauden aloituspäivä
