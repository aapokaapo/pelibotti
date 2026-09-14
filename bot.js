require('dotenv').config();
const {
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
    TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    LabelBuilder, Events
} = require('discord.js');
const moment = require('moment-timezone');
const cron = require('cron');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) throw new Error("DISCORD_TOKEN puuttuu .env -tiedostosta!");

const CHANNEL_ID = process.env.CHANNEL_ID;
if (!CHANNEL_ID) throw new Error("CHANNEL_ID puuttuu .env -tiedostosta!");

const HELSINKI_TZ = "Europe/Helsinki";
const VIIKONPAIVAT = ["su", "ma", "ti", "ke", "to", "pe", "la"];
const TEAM_NAME = "Radio Silence";

// Map pools for weeks 1-7
const MAP_POOLS = {
    1: {
        A: "G1 • Oddball — Recharge\nG2 • Slayer — Solitude\nG3 • Strongholds — Live Fire\nG4 • CTF — Aquarius\nG5 • Slayer — Origin\nG6 • KOTH — Streets\nG7 • Slayer — Recharge",
        B: "G1 • KOTH — Live Fire\nG2 • Slayer — Streets\nG3 • CTF — Empyrean\nG4 • Strongholds — Recharge\nG5 • Slayer — Solitude\nG6 • Oddball — Streets\nG7 • Slayer — Live Fire",
        C: "G1 • Strongholds — Live Fire\nG2 • Slayer — Recharge\nG3 • Oddball — Streets\nG4 • KOTH — Recharge\nG5 • Slayer — Origin\nG6 • CTF — Origin\nG7 • Slayer — Solitude"
    },
    2: {
        A: "G1 • CTF — Empyrean\nG2 • Slayer — Streets\nG3 • KOTH — Lattice\nG4 • Oddball — Live Fire\nG5 • Slayer — Solitude\nG6 • Strongholds — Recharge\nG7 • Slayer — Live Fire",
        B: "G1 • Oddball — Recharge\nG2 • Slayer — Origin\nG3 • Strongholds — Live Fire\nG4 • CTF — Aquarius\nG5 • Slayer — Solitude\nG6 • KOTH — Streets\nG7 • Slayer — Recharge",
        C: "G1 • KOTH — Recharge\nG2 • Slayer — Solitude\nG3 • CTF — Origin\nG4 • Strongholds — Live Fire\nG5 • Slayer — Streets\nG6 • Oddball — Lattice\nG7 • Slayer — Origin"
    },
    3: {
        A: "G1 • Strongholds — Recharge\nG2 • Slayer — Live Fire\nG3 • KOTH — Streets\nG4 • CTF — Empyrean\nG5 • Slayer — Solitude\nG6 • Oddball — Lattice\nG7 • Slayer — Recharge",
        B: "G1 • CTF — Aquarius\nG2 • Slayer — Live Fire\nG3 • Oddball — Streets\nG4 • KOTH — Lattice\nG5 • Slayer — Origin\nG6 • Strongholds — Recharge\nG7 • Slayer — Solitude",
        C: "G1 • Oddball — Lattice\nG2 • Slayer — Solitude\nG3 • Strongholds — Recharge\nG4 • CTF — Origin\nG5 • Slayer — Streets\nG6 • KOTH — Live Fire\nG7 • Slayer — Recharge"
    },
    4: {
        A: "G1 • KOTH — Live Fire\nG2 • Slayer — Recharge\nG3 • CTF — Empyrean\nG4 • Oddball — Streets\nG5 • Slayer — Solitude\nG6 • Strongholds — Live Fire\nG7 • Slayer — Origin",
        B: "G1 • Strongholds — Recharge\nG2 • Slayer — Live Fire\nG3 • KOTH — Recharge\nG4 • CTF — Origin\nG5 • Slayer — Streets\nG6 • Oddball — Lattice\nG7 • Slayer — Solitude",
        C: "G1 • CTF — Aquarius\nG2 • Slayer — Streets\nG3 • Oddball — Recharge\nG4 • Strongholds — Live Fire\nG5 • Slayer — Solitude\nG6 • KOTH — Lattice\nG7 • Slayer — Recharge"
    },
    5: {
        A: "G1 • Oddball — Streets\nG2 • Slayer — Origin\nG3 • Strongholds — Recharge\nG4 • KOTH — Streets\nG5 • Slayer — Recharge\nG6 • CTF — Empyrean\nG7 • Slayer — Solitude",
        B: "G1 • KOTH — Live Fire\nG2 • Slayer — Solitude\nG3 • CTF — Aquarius\nG4 • Oddball — Live Fire\nG5 • Slayer — Origin\nG6 • Strongholds — Live Fire\nG7 • Slayer — Streets",
        C: "G1 • Strongholds — Recharge\nG2 • Slayer — Live Fire\nG3 • Oddball — Lattice\nG4 • CTF — Origin\nG5 • Slayer — Solitude\nG6 • KOTH — Recharge\nG7 • Slayer — Streets"
    },
    6: {
        A: "G1 • CTF — Empyrean\nG2 • Slayer — Live Fire\nG3 • KOTH — Lattice\nG4 • Strongholds — Recharge\nG5 • Slayer — Solitude\nG6 • Oddball — Streets\nG7 • Slayer — Origin",
        B: "G1 • Oddball — Live Fire\nG2 • Slayer — Streets\nG3 • CTF — Aquarius\nG4 • Strongholds — Live Fire\nG5 • Slayer — Recharge\nG6 • KOTH — Streets\nG7 • Slayer — Solitude",
        C: "G1 • KOTH — Live Fire\nG2 • Slayer — Solitude\nG3 • Strongholds — Recharge\nG4 • Oddball — Streets\nG5 • Slayer — Recharge\nG6 • CTF — Origin\nG7 • Slayer — Streets"
    },
    7: {
        A: "G1 • Strongholds — Live Fire\nG2 • Slayer — Solitude\nG3 • CTF — Aquarius\nG4 • Oddball — Streets\nG5 • Slayer — Recharge\nG6 • KOTH — Live Fire\nG7 • Slayer — Origin",
        B: "G1 • KOTH — Lattice\nG2 • Slayer — Origin\nG3 • Oddball — Live Fire\nG4 • Strongholds — Recharge\nG5 • Slayer — Solitude\nG6 • CTF — Empyrean\nG7 • Slayer — Live Fire",
        C: "G1 • CTF — Empyrean\nG2 • Slayer — Recharge\nG3 • KOTH — Streets\nG4 • Strongholds — Live Fire\nG5 • Slayer — Solitude\nG6 • Oddball — Lattice\nG7 • Slayer — Origin"
    }
};

// All fixtures for weeks 1-7 (Radio Silence matches only)
const ALL_FIXTURES = {
    1: [
        { match_set: 1, opponent: "HSK", pool: "B" },
        { match_set: 2, opponent: "Souls Club", pool: "A" }
    ],
    2: [
        { match_set: 1, opponent: "Spawn Trap", pool: "B" },
        { match_set: 2, opponent: "Reverse Sweeps", pool: "A" }
    ],
    3: [
        { match_set: 1, opponent: "Respawn Crew", pool: "A" },
        { match_set: 2, opponent: "Locked In", pool: "C" }
    ],
    4: [
        { match_set: 1, opponent: "HSK", pool: "C" },
        { match_set: 2, opponent: "Wilson Appreciation Society", pool: "B" }
    ],
    5: [
        { match_set: 1, opponent: "Reverse Sweeps", pool: "B" },
        { match_set: 2, opponent: "Souls Club", pool: "A" }
    ],
    6: [
        { match_set: 1, opponent: "Respawn Crew", pool: "B" },
        { match_set: 2, opponent: "Wilson Appreciation Society", pool: "A" }
    ],
    7: [
        { match_set: 1, opponent: "Reverse Sweeps", pool: "B" },
        { match_set: 2, opponent: "Locked In", pool: "B" }
    ]
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function createButtonRows(buttons) {
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    return rows;
}

function getCurrentWeek() {
    // Season starts on a specific date - adjust this to your season start date
    // For now, assuming week 5 is current (you can change this logic)
    const today = moment.tz(HELSINKI_TZ);
    const seasonStart = moment.tz('2026-08-13', HELSINKI_TZ); // Adjust season start date
    const weekNumber = Math.floor(today.diff(seasonStart, 'days') / 7) + 1;
    
    // Clamp to weeks 1-7
    return Math.max(1, Math.min(7, weekNumber));
}

async function sendAvailabilityMessage(channel) {
    const today = moment.tz(HELSINKI_TZ).startOf('day');
    const currentWeek = getCurrentWeek();
    const weekFixtures = ALL_FIXTURES[currentWeek];
    
    const embed = new EmbedBuilder()
        .setTitle("🎮 Viikoittainen pelikartoitus")
        .setDescription("Kuka pääsee peleihin alkavalla viikolla?")
        .setColor(0x5865F2);
    
    // Add current week's opponents with map pools
    const opponentsText = weekFixtures.map(m => {
        const mapPool = MAP_POOLS[currentWeek][m.pool];
        return `**Match Set ${m.match_set}** - ${TEAM_NAME} 🆚 ${m.opponent}\n\`\`\`\n${mapPool}\n\`\`\``;
    }).join("\n");
    
    embed.addFields({
        name: `📅 Tämän viikon vastustajat (WEEK ${currentWeek})`,
        value: opponentsText,
        inline: false
    });
    
    const buttons = [];
    
    for (let i = 0; i < 7; i++) {
        const currentDay = today.clone().add(i, 'days');
        currentDay.hour(21).minute(0).second(0);
        
        const dayName = `${VIIKONPAIVAT[currentDay.day()]} ${currentDay.format('DD.MM.')}`;
        const unixTime = currentDay.unix();
        
        embed.addFields({
            name: dayName,
            value: `🕒 <t:${unixTime}:F>\n✅ -`,
            inline: false
        });
        
        buttons.push(
            new ButtonBuilder()
                .setLabel(dayName)
                .setCustomId(`availability_${i}`)
                .setStyle(ButtonStyle.Primary)
        );
    }

    buttons.push(
        new ButtonBuilder()
            .setLabel("Ehdota aikaa")
            .setCustomId("suggest_time_btn")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🕒")
    );
    
    await channel.send({ embeds: [embed], components: createButtonRows(buttons) });
}

const weeklyJob = new cron.CronJob('0 10 * * 6', async () => {
    const channel = client.channels.cache.get(CHANNEL_ID);
    if (channel) {
        await sendAvailabilityMessage(channel);
    }
}, null, false, HELSINKI_TZ);

client.once(Events.ClientReady, async () => {
    console.log(`Kirjauduttu sisään nimellä ${client.user.tag} (ID: ${client.user.id})`);
    
    await client.application.commands.create({
        name: 'testi',
        description: 'Lähetä pelikartoituksen kyselytesti tälle kanavalle.'
    });
    
    if (!weeklyJob.running) {
        weeklyJob.start();
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    // 1. Slash-komennot
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'testi') {
            await interaction.reply({ content: "Lähetetään testikartoitus...", flags: 64 });
            await sendAvailabilityMessage(interaction.channel);
        }
        return;
    }

    // 2. Napit
    if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId.startsWith("availability_")) {
            const dayIndex = parseInt(customId.split("_")[1]);
            const userMention = `<@${interaction.user.id}>`;
            
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            
            // The opponents field is at index 0, so day fields start at index 1
            // The actual field index for the day is dayIndex + 1
            const fieldIndex = dayIndex + 1;
            
            if (fieldIndex >= embed.data.fields.length) return;
            
            const field = embed.data.fields[fieldIndex];
            const lines = field.value.split("\n");
            
            let participantsStr = lines[1].replace("✅ ", "").replace("✅", "").trim();
            let participants = participantsStr === "-" ? [] : participantsStr.split(" ");
            
            if (participants.includes(userMention)) {
                participants = participants.filter(p => p !== userMention);
            } else {
                participants.push(userMention);
            }
            
            const newParticipantsStr = participants.length > 0 ? participants.join(" ") : "-";
            lines[1] = `✅ ${newParticipantsStr}`;
            
            embed.data.fields[fieldIndex].value = lines.join("\n");
            
            await interaction.update({ embeds: [embed] });
        }
        
        else if (customId === "suggest_time_btn") {
            const today = moment.tz(HELSINKI_TZ).startOf('day');
            
            const modal = new ModalBuilder()
                .setCustomId('suggest_time_modal')
                .setTitle('Ehdota uutta peliaikaa');

            // 1. Dropdown (Select Menu) LabelBuilderillä
            const daySelect = new StringSelectMenuBuilder()
                .setCustomId('day_select')
                .setPlaceholder('Valitse päivä')
                .setRequired(true);

            for (let i = 0; i < 7; i++) {
                const targetDay = today.clone().add(i, 'days');
                daySelect.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${VIIKONPAIVAT[targetDay.day()]} ${targetDay.format('DD.MM.')}`)
                        .setValue(i.toString())
                );
            }

            const dayLabel = new LabelBuilder()
                .setLabel("Valitse päivä")
                .setStringSelectMenuComponent(daySelect);

            // 2. Tunnit TextInputBuilderillä & LabelBuilderillä
            const hoursInput = new TextInputBuilder()
                .setCustomId('hours_input')
                .setPlaceholder("21")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(2);

            const hoursLabel = new LabelBuilder()
                .setLabel("Tunnit (0-23)")
                .setTextInputComponent(hoursInput);

            // 3. Minuutit TextInputBuilderillä & LabelBuilderillä
            const minutesInput = new TextInputBuilder()
                .setCustomId('minutes_input')
                .setPlaceholder("00")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(2);

            const minutesLabel = new LabelBuilder()
                .setLabel("Minuutit (0-59)")
                .setTextInputComponent(minutesInput);

            // Lisätään Labelit modaliin
            modal.addLabelComponents(dayLabel, hoursLabel, minutesLabel);

            await interaction.showModal(modal);
        }
    }

    // 3. Modalin vastaus
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'suggest_time_modal') {
            try {
                // Haetaan dropdownin arvo suoraan fields-rajapinnan kautta
                const daySelectValues = interaction.fields.getStringSelectValues('day_select');
                const dayOffset = parseInt(daySelectValues[0]);
                
                // Haetaan tekstikenttien arvot
                const hoursStr = interaction.fields.getTextInputValue('hours_input');
                const hours = parseInt(hoursStr);
                
                const minutesStr = interaction.fields.getTextInputValue('minutes_input').trim();
                const minutes = minutesStr ? parseInt(minutesStr) : 0;
                
                if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
                    await interaction.reply({ content: "Virheellinen aika! Tarkista tunnit ja minuutit.", flags: 64 });
                    return;
                }

                const today = moment.tz(HELSINKI_TZ).startOf('day');
                const targetDate = today.clone().add(dayOffset, 'days');
                targetDate.hour(hours).minute(minutes).second(0);
                
                const unixTime = targetDate.unix();
                
                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                
                // The suggested date button needs the correct custom ID
                // It should use the total number of fields, which includes opponents + 7 days + any previous suggestions
                // We'll use a counter based on the number of fields - 1 (opponents) - 7 (days)
                const totalFields = embed.data.fields.length;
                const suggestedDateIndex = totalFields - 1; // -1 for opponents field (which is at index 0)
                
                const formattedHours = String(hours).padStart(2, '0');
                const formattedMinutes = String(minutes).padStart(2, '0');
                const dayName = `Ehd. ${VIIKONPAIVAT[targetDate.day()]} ${targetDate.format('DD.MM.')} (${formattedHours}:${formattedMinutes})`;
                
                embed.addFields({
                    name: dayName,
                    value: `🕒 <t:${unixTime}:F>\n✅ -`,
                    inline: false
                });

                const existingButtons = [];
                for (const row of interaction.message.components) {
                    for (const comp of row.components) {
                        if (comp.customId === 'suggest_time_btn') continue;
                        
                        const newBtn = new ButtonBuilder()
                            .setLabel(comp.label)
                            .setCustomId(comp.customId)
                            .setStyle(comp.style);
                            
                        if (comp.emoji) {
                            newBtn.setEmoji(comp.emoji.id || comp.emoji.name);
                        }
                            
                        existingButtons.push(newBtn);
                    }
                }
                
                existingButtons.push(
                    new ButtonBuilder()
                        .setLabel(dayName)
                        .setCustomId(`availability_${suggestedDateIndex}`)
                        .setStyle(ButtonStyle.Primary)
                );
                
                existingButtons.push(
                    new ButtonBuilder()
                        .setLabel("Ehdota aikaa")
                        .setCustomId("suggest_time_btn")
                        .setStyle(ButtonStyle.Success)
                        .setEmoji("🕒")
                );

                await interaction.update({ embeds: [embed], components: createButtonRows(existingButtons) });

            } catch (error) {
                console.error(error);
                await interaction.reply({ content: "Tapahtui virhe lomakkeen käsittelyssä.", flags: 64 });
            }
        }
    }
});

client.login(DISCORD_TOKEN);