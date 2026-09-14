require('dotenv').config();
const {
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
    TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    LabelBuilder, Events
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const cron = require('cron');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is missing from .env!');

const CHANNEL_ID = process.env.CHANNEL_ID;
if (!CHANNEL_ID) throw new Error('CHANNEL_ID is missing from .env!');

const HELSINKI_TZ = 'Europe/Helsinki';
const MAX_SCHEDULE_FILE_SIZE_BYTES = 512 * 1024;

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const LOCALES_DIR = path.join(ROOT_DIR, 'locales');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const SCHEDULE_PATH = path.join(DATA_DIR, 'schedule.json');

const DEFAULT_CONFIG = {
    teamName: 'Radio Silence',
    leagueStartDate: '2026-08-13',
    locale: process.env.BOT_LOCALE || 'en'
};

const DEFAULT_SCHEDULE = {
    mapPools: {
        1: {
            A: 'G1 • Oddball — Recharge\nG2 • Slayer — Solitude\nG3 • Strongholds — Live Fire\nG4 • CTF — Aquarius\nG5 • Slayer — Origin\nG6 • KOTH — Streets\nG7 • Slayer — Recharge',
            B: 'G1 • KOTH — Live Fire\nG2 • Slayer — Streets\nG3 • CTF — Empyrean\nG4 • Strongholds — Recharge\nG5 • Slayer — Solitude\nG6 • Oddball — Streets\nG7 • Slayer — Live Fire',
            C: 'G1 • Strongholds — Live Fire\nG2 • Slayer — Recharge\nG3 • Oddball — Streets\nG4 • KOTH — Recharge\nG5 • Slayer — Origin\nG6 • CTF — Origin\nG7 • Slayer — Solitude'
        },
        2: {
            A: 'G1 • CTF — Empyrean\nG2 • Slayer — Streets\nG3 • KOTH — Lattice\nG4 • Oddball — Live Fire\nG5 • Slayer — Solitude\nG6 • Strongholds — Recharge\nG7 • Slayer — Live Fire',
            B: 'G1 • Oddball — Recharge\nG2 • Slayer — Origin\nG3 • Strongholds — Live Fire\nG4 • CTF — Aquarius\nG5 • Slayer — Solitude\nG6 • KOTH — Streets\nG7 • Slayer — Recharge',
            C: 'G1 • KOTH — Recharge\nG2 • Slayer — Solitude\nG3 • CTF — Origin\nG4 • Strongholds — Live Fire\nG5 • Slayer — Streets\nG6 • Oddball — Lattice\nG7 • Slayer — Origin'
        },
        3: {
            A: 'G1 • Strongholds — Recharge\nG2 • Slayer — Live Fire\nG3 • KOTH — Streets\nG4 • CTF — Empyrean\nG5 • Slayer — Solitude\nG6 • Oddball — Lattice\nG7 • Slayer — Recharge',
            B: 'G1 • CTF — Aquarius\nG2 • Slayer — Live Fire\nG3 • Oddball — Streets\nG4 • KOTH — Lattice\nG5 • Slayer — Origin\nG6 • Strongholds — Recharge\nG7 • Slayer — Solitude',
            C: 'G1 • Oddball — Lattice\nG2 • Slayer — Solitude\nG3 • Strongholds — Recharge\nG4 • CTF — Origin\nG5 • Slayer — Streets\nG6 • KOTH — Live Fire\nG7 • Slayer — Recharge'
        },
        4: {
            A: 'G1 • KOTH — Live Fire\nG2 • Slayer — Recharge\nG3 • CTF — Empyrean\nG4 • Oddball — Streets\nG5 • Slayer — Solitude\nG6 • Strongholds — Live Fire\nG7 • Slayer — Origin',
            B: 'G1 • Strongholds — Recharge\nG2 • Slayer — Live Fire\nG3 • KOTH — Recharge\nG4 • CTF — Origin\nG5 • Slayer — Streets\nG6 • Oddball — Lattice\nG7 • Slayer — Solitude',
            C: 'G1 • CTF — Aquarius\nG2 • Slayer — Streets\nG3 • Oddball — Recharge\nG4 • Strongholds — Live Fire\nG5 • Slayer — Solitude\nG6 • KOTH — Lattice\nG7 • Slayer — Recharge'
        },
        5: {
            A: 'G1 • Oddball — Streets\nG2 • Slayer — Origin\nG3 • Strongholds — Recharge\nG4 • KOTH — Streets\nG5 • Slayer — Recharge\nG6 • CTF — Empyrean\nG7 • Slayer — Solitude',
            B: 'G1 • KOTH — Live Fire\nG2 • Slayer — Solitude\nG3 • CTF — Aquarius\nG4 • Oddball — Live Fire\nG5 • Slayer — Origin\nG6 • Strongholds — Live Fire\nG7 • Slayer — Streets',
            C: 'G1 • Strongholds — Recharge\nG2 • Slayer — Live Fire\nG3 • Oddball — Lattice\nG4 • CTF — Origin\nG5 • Slayer — Solitude\nG6 • KOTH — Recharge\nG7 • Slayer — Streets'
        },
        6: {
            A: 'G1 • CTF — Empyrean\nG2 • Slayer — Live Fire\nG3 • KOTH — Lattice\nG4 • Strongholds — Recharge\nG5 • Slayer — Solitude\nG6 • Oddball — Streets\nG7 • Slayer — Origin',
            B: 'G1 • Oddball — Live Fire\nG2 • Slayer — Streets\nG3 • CTF — Aquarius\nG4 • Strongholds — Live Fire\nG5 • Slayer — Recharge\nG6 • KOTH — Streets\nG7 • Slayer — Solitude',
            C: 'G1 • KOTH — Live Fire\nG2 • Slayer — Solitude\nG3 • Strongholds — Recharge\nG4 • Oddball — Streets\nG5 • Slayer — Recharge\nG6 • CTF — Origin\nG7 • Slayer — Streets'
        },
        7: {
            A: 'G1 • Strongholds — Live Fire\nG2 • Slayer — Solitude\nG3 • CTF — Aquarius\nG4 • Oddball — Streets\nG5 • Slayer — Recharge\nG6 • KOTH — Live Fire\nG7 • Slayer — Origin',
            B: 'G1 • KOTH — Lattice\nG2 • Slayer — Origin\nG3 • Oddball — Live Fire\nG4 • Strongholds — Recharge\nG5 • Slayer — Solitude\nG6 • CTF — Empyrean\nG7 • Slayer — Live Fire',
            C: 'G1 • CTF — Empyrean\nG2 • Slayer — Recharge\nG3 • KOTH — Streets\nG4 • Strongholds — Live Fire\nG5 • Slayer — Solitude\nG6 • Oddball — Lattice\nG7 • Slayer — Origin'
        }

    },
    fixtures: {
        1: [
            { match_set: 1, opponent: 'HSK', pool: 'B' },
            { match_set: 2, opponent: 'Souls Club', pool: 'A' }
        ],
        2: [
            { match_set: 1, opponent: 'Spawn Trap', pool: 'B' },
            { match_set: 2, opponent: 'Reverse Sweeps', pool: 'A' }
        ],
        3: [
            { match_set: 1, opponent: 'Respawn Crew', pool: 'A' },
            { match_set: 2, opponent: 'Locked In', pool: 'C' }
        ],
        4: [
            { match_set: 1, opponent: 'HSK', pool: 'C' },
            { match_set: 2, opponent: 'Wilson Appreciation Society', pool: 'B' }
        ],
        5: [
            { match_set: 1, opponent: 'Reverse Sweeps', pool: 'B' },
            { match_set: 2, opponent: 'Souls Club', pool: 'A' }
        ],
        6: [
            { match_set: 1, opponent: 'Respawn Crew', pool: 'B' },
            { match_set: 2, opponent: 'Wilson Appreciation Society', pool: 'A' }
        ],
        7: [
            { match_set: 1, opponent: 'Reverse Sweeps', pool: 'B' },
            { match_set: 2, opponent: 'Locked In', pool: 'B' }
        ]
    }
};

function ensureDataFiles() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const defaultConfigJson = JSON.stringify(DEFAULT_CONFIG, null, 2);
    const defaultScheduleJson = JSON.stringify(DEFAULT_SCHEDULE, null, 2);

    try {
        fs.writeFileSync(CONFIG_PATH, defaultConfigJson, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }

    try {
        fs.writeFileSync(SCHEDULE_PATH, defaultScheduleJson, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
    }
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonWithFallback(filePath, fallbackValue, warningMessage) {
    try {
        return readJson(filePath);
    } catch (error) {
        console.error(`${warningMessage}: ${error.message}`);
        writeJson(filePath, fallbackValue);
        return fallbackValue;
    }
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function loadRuntimeConfig() {
    const fileConfig = readJsonWithFallback(
        CONFIG_PATH,
        DEFAULT_CONFIG,
        `Invalid JSON in ${CONFIG_PATH}, resetting to defaults`
    );
    return {
        ...DEFAULT_CONFIG,
        ...fileConfig,
        locale: fileConfig.locale || DEFAULT_CONFIG.locale || 'en'
    };
}

function saveRuntimeConfig(newConfig) {
    writeJson(CONFIG_PATH, newConfig);
}

function normalizeScheduleData(raw) {
    const mapPools = raw.mapPools || raw.MAP_POOLS;
    const fixtures = raw.fixtures || raw.ALL_FIXTURES;

    return { mapPools, fixtures };
}

function validateScheduleData(schedule) {
    if (!schedule || typeof schedule !== 'object') {
        return { ok: false, error: 'invalidScheduleSchema' };
    }

    if (!schedule.mapPools || typeof schedule.mapPools !== 'object') {
        return { ok: false, error: 'invalidScheduleSchema' };
    }

    if (!schedule.fixtures || typeof schedule.fixtures !== 'object') {
        return { ok: false, error: 'invalidScheduleSchema' };
    }

    for (const [week, matches] of Object.entries(schedule.fixtures)) {
        if (!Array.isArray(matches)) {
            return { ok: false, error: 'invalidScheduleSchema' };
        }

        for (const match of matches) {
            if (
                typeof match !== 'object' ||
                typeof match.match_set !== 'number' ||
                typeof match.opponent !== 'string' ||
                typeof match.pool !== 'string'
            ) {
                return { ok: false, error: 'invalidScheduleSchema' };
            }

            const weekPools = schedule.mapPools[week] || schedule.mapPools[String(week)];
            if (!weekPools || typeof weekPools !== 'object' || !weekPools[match.pool]) {
                return { ok: false, error: 'invalidScheduleSchema' };
            }
        }
    }

    return { ok: true };
}

function loadScheduleData() {
    const raw = readJsonWithFallback(
        SCHEDULE_PATH,
        DEFAULT_SCHEDULE,
        `Invalid JSON in ${SCHEDULE_PATH}, resetting to defaults`
    );
    const normalized = normalizeScheduleData(raw);
    const validation = validateScheduleData(normalized);

    if (!validation.ok) {
        console.error(`Invalid schedule schema in ${SCHEDULE_PATH}, resetting to defaults`);
        writeJson(SCHEDULE_PATH, DEFAULT_SCHEDULE);
        return normalizeScheduleData(DEFAULT_SCHEDULE);
    }

    return normalized;
}

function saveScheduleData(newSchedule) {
    writeJson(SCHEDULE_PATH, newSchedule);
}

function getLocale(localeName) {
    const requestedPath = path.join(LOCALES_DIR, `${localeName}.json`);
    const fallbackPath = path.join(LOCALES_DIR, 'en.json');

    if (fs.existsSync(requestedPath)) {
        return readJson(requestedPath);
    }

    return readJson(fallbackPath);
}

function resolveKey(bundle, key) {
    return key.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), bundle);
}

function formatMessage(template, values = {}) {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
        const value = values[key];
        return value === undefined || value === null ? `{${key}}` : String(value);
    });
}

function isAllowedDiscordAttachmentUrl(urlValue) {
    try {
        const parsed = new URL(urlValue);
        const allowedHosts = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
        return allowedHosts.has(parsed.hostname.toLowerCase());
    } catch {
        return false;
    }
}

ensureDataFiles();
let runtimeConfig = loadRuntimeConfig();
let scheduleData = loadScheduleData();
let localeBundle = getLocale(runtimeConfig.locale);

function t(key, values = {}) {
    const value = resolveKey(localeBundle, key);
    if (value === undefined) {
        return key;
    }

    if (typeof value === 'string') {
        return formatMessage(value, values);
    }

    return value;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function createButtonRows(buttons) {
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    return rows;
}

function getCurrentWeek() {
    const today = moment.tz(HELSINKI_TZ);
    const seasonStart = moment.tz(runtimeConfig.leagueStartDate, 'YYYY-MM-DD', HELSINKI_TZ);

    if (!seasonStart.isValid()) {
        return 1;
    }

    const weekNumber = Math.floor(today.diff(seasonStart, 'days') / 7) + 1;
    const weekKeys = [
        ...Object.keys(scheduleData.fixtures || {}),
        ...Object.keys(scheduleData.mapPools || {})
    ].map((key) => Number.parseInt(key, 10))
        .filter((key) => Number.isInteger(key) && key > 0);

    const maxWeek = weekKeys.length > 0 ? Math.max(...weekKeys) : 1;

    return Math.max(1, Math.min(maxWeek, weekNumber));
}

function getDayShortNames() {
    const names = t('daysShort');
    return Array.isArray(names) && names.length === 7
        ? names
        : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
}

async function sendAvailabilityMessage(channel) {
    const today = moment.tz(HELSINKI_TZ).startOf('day');
    const currentWeek = getCurrentWeek();
    const weekFixtures = scheduleData.fixtures[String(currentWeek)] || [];
    const weekMapPools = scheduleData.mapPools[String(currentWeek)] || {};

    const embed = new EmbedBuilder()
        .setTitle(t('titles.weeklyAvailability'))
        .setDescription(t('descriptions.whoCanPlay'))
        .setColor(0x5865F2);

    const opponentsText = weekFixtures.length > 0
        ? weekFixtures.map((match) => {
            const mapPool = weekMapPools[match.pool] || t('mapPoolMissing', { pool: match.pool });
            return `**Match Set ${match.match_set}** - ${runtimeConfig.teamName} 🆚 ${match.opponent}\n\`\`\`\n${mapPool}\n\`\`\``;
        }).join('\n')
        : t('noFixturesForWeek', { week: currentWeek });

    embed.addFields({
        name: t('fields.thisWeeksOpponents', { week: currentWeek }),
        value: opponentsText,
        inline: false
    });

    const buttons = [];
    const dayShort = getDayShortNames();

    for (let i = 0; i < 7; i++) {
        const currentDay = today.clone().add(i, 'days');
        currentDay.hour(21).minute(0).second(0);

        const dayName = `${dayShort[currentDay.day()]} ${currentDay.format('DD.MM.')}`;
        const unixTime = currentDay.unix();

        embed.addFields({
            name: dayName,
            value: t('fields.timeAndParticipants', { unix: unixTime }),
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
            .setLabel(t('buttons.suggestTime'))
            .setCustomId('suggest_time_btn')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🕒')
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
    console.log(t('messages.loggedInAs', { tag: client.user.tag, id: client.user.id }));

    await client.application.commands.set([
        {
            name: 'testi',
            description: t('commands.test.description')
        },
        {
            name: 'setteam',
            description: t('commands.setTeam.description'),
            options: [
                {
                    type: 3,
                    name: 'name',
                    description: t('commands.setTeam.optionName'),
                    required: true
                }
            ]
        },
        {
            name: 'setstartdate',
            description: t('commands.setStartDate.description'),
            options: [
                {
                    type: 3,
                    name: 'date',
                    description: t('commands.setStartDate.optionDate'),
                    required: true
                }
            ]
        },
        {
            name: 'setschedulejson',
            description: t('commands.setScheduleJson.description'),
            options: [
                {
                    type: 3,
                    name: 'json',
                    description: t('commands.setScheduleJson.optionJson'),
                    required: true
                }
            ]
        },
        {
            name: 'loadschedule',
            description: t('commands.loadSchedule.description'),
            options: [
                {
                    type: 11,
                    name: 'file',
                    description: t('commands.loadSchedule.optionFile'),
                    required: true
                }
            ]
        }
    ]);

    if (!weeklyJob.running) {
        weeklyJob.start();
    }
});

async function applyScheduleFromText(jsonText) {
    const parsed = JSON.parse(jsonText);
    const normalized = normalizeScheduleData(parsed);
    const validation = validateScheduleData(normalized);

    if (!validation.ok) {
        return { ok: false, messageKey: validation.error };
    }

    scheduleData = normalized;
    saveScheduleData(scheduleData);
    return { ok: true };
}

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'testi') {
            await interaction.reply({ content: t('messages.sendingTestSurvey'), flags: 64 });
            await sendAvailabilityMessage(interaction.channel);
            return;
        }

        if (interaction.commandName === 'setteam') {
            const teamName = interaction.options.getString('name', true).trim();
            runtimeConfig.teamName = teamName;
            saveRuntimeConfig(runtimeConfig);
            await interaction.reply({ content: t('messages.teamUpdated', { teamName }), flags: 64 });
            return;
        }

        if (interaction.commandName === 'setstartdate') {
            const dateInput = interaction.options.getString('date', true).trim();
            if (!moment(dateInput, 'YYYY-MM-DD', true).isValid()) {
                await interaction.reply({ content: t('errors.invalidDateFormat'), flags: 64 });
                return;
            }

            runtimeConfig.leagueStartDate = dateInput;
            saveRuntimeConfig(runtimeConfig);
            await interaction.reply({ content: t('messages.startDateUpdated', { date: dateInput }), flags: 64 });
            return;
        }

        if (interaction.commandName === 'setschedulejson') {
            const jsonText = interaction.options.getString('json', true);
            try {
                const result = await applyScheduleFromText(jsonText);
                if (!result.ok) {
                    await interaction.reply({ content: t(`errors.${result.messageKey}`), flags: 64 });
                    return;
                }

                await interaction.reply({ content: t('messages.scheduleUpdatedFromJson'), flags: 64 });
            } catch {
                await interaction.reply({ content: t('errors.invalidJson'), flags: 64 });
            }
            return;
        }

        if (interaction.commandName === 'loadschedule') {
            const attachment = interaction.options.getAttachment('file', true);
            const fileName = (attachment.name || '').toLowerCase();
            const contentType = (attachment.contentType || '').toLowerCase();
            const isJsonByName = fileName.endsWith('.json');
            const isJsonByType = contentType.includes('application/json') || contentType.includes('text/json');

            if (!isJsonByName && !isJsonByType) {
                await interaction.reply({ content: t('errors.invalidJsonFileType'), flags: 64 });
                return;
            }

            if (typeof attachment.size === 'number' && attachment.size > MAX_SCHEDULE_FILE_SIZE_BYTES) {
                await interaction.reply({ content: t('errors.jsonFileTooLarge', { maxKb: MAX_SCHEDULE_FILE_SIZE_BYTES / 1024 }), flags: 64 });
                return;
            }

            try {
                const fileUrl = attachment.proxyURL || attachment.url;
                if (!isAllowedDiscordAttachmentUrl(fileUrl)) {
                    await interaction.reply({ content: t('errors.invalidJsonFileType'), flags: 64 });
                    return;
                }
                const response = await fetch(fileUrl);
                if (!response.ok) {
                    throw new Error('File download failed');
                }

                const jsonText = await response.text();
                const result = await applyScheduleFromText(jsonText);
                if (!result.ok) {
                    await interaction.reply({ content: t(`errors.${result.messageKey}`), flags: 64 });
                    return;
                }

                await interaction.reply({ content: t('messages.scheduleUpdatedFromFile', { fileName: attachment.name || 'schedule.json' }), flags: 64 });
            } catch {
                await interaction.reply({ content: t('errors.unableToReadJsonFile'), flags: 64 });
            }
            return;
        }

        return;
    }

    if (interaction.isButton()) {
        const customId = interaction.customId;

        if (customId.startsWith('availability_')) {
            const dayIndex = parseInt(customId.split('_')[1], 10);
            const userMention = `<@${interaction.user.id}>`;

            const embed = EmbedBuilder.from(interaction.message.embeds[0]);

            const fieldIndex = dayIndex + 1;
            if (fieldIndex >= embed.data.fields.length) return;

            const field = embed.data.fields[fieldIndex];
            const lines = field.value.split('\n');

            let participantsStr = lines[1].replace('✅ ', '').replace('✅', '').trim();
            let participants = participantsStr === '-' ? [] : participantsStr.split(' ');

            if (participants.includes(userMention)) {
                participants = participants.filter((p) => p !== userMention);
            } else {
                participants.push(userMention);
            }

            const newParticipantsStr = participants.length > 0 ? participants.join(' ') : '-';
            lines[1] = `✅ ${newParticipantsStr}`;

            embed.data.fields[fieldIndex].value = lines.join('\n');

            await interaction.update({ embeds: [embed] });
        } else if (customId === 'suggest_time_btn') {
            const today = moment.tz(HELSINKI_TZ).startOf('day');

            const modal = new ModalBuilder()
                .setCustomId('suggest_time_modal')
                .setTitle(t('modal.title'));

            const daySelect = new StringSelectMenuBuilder()
                .setCustomId('day_select')
                .setPlaceholder(t('modal.selectDayPlaceholder'))
                .setRequired(true);

            const dayShort = getDayShortNames();
            for (let i = 0; i < 7; i++) {
                const targetDay = today.clone().add(i, 'days');
                daySelect.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${dayShort[targetDay.day()]} ${targetDay.format('DD.MM.')}`)
                        .setValue(i.toString())
                );
            }

            const dayLabel = new LabelBuilder()
                .setLabel(t('modal.selectDayLabel'))
                .setStringSelectMenuComponent(daySelect);

            const hoursInput = new TextInputBuilder()
                .setCustomId('hours_input')
                .setPlaceholder('21')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(2);

            const hoursLabel = new LabelBuilder()
                .setLabel(t('modal.hoursLabel'))
                .setTextInputComponent(hoursInput);

            const minutesInput = new TextInputBuilder()
                .setCustomId('minutes_input')
                .setPlaceholder('00')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(2);

            const minutesLabel = new LabelBuilder()
                .setLabel(t('modal.minutesLabel'))
                .setTextInputComponent(minutesInput);

            modal.addLabelComponents(dayLabel, hoursLabel, minutesLabel);

            await interaction.showModal(modal);
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'suggest_time_modal') {
            try {
                const daySelectValues = interaction.fields.getStringSelectValues('day_select');
                const dayOffset = parseInt(daySelectValues[0], 10);

                const hoursStr = interaction.fields.getTextInputValue('hours_input');
                const hours = parseInt(hoursStr, 10);

                const minutesStr = interaction.fields.getTextInputValue('minutes_input').trim();
                const minutes = minutesStr ? parseInt(minutesStr, 10) : 0;

                if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
                    await interaction.reply({ content: t('errors.invalidTime'), flags: 64 });
                    return;
                }

                const today = moment.tz(HELSINKI_TZ).startOf('day');
                const targetDate = today.clone().add(dayOffset, 'days');
                targetDate.hour(hours).minute(minutes).second(0);

                const unixTime = targetDate.unix();

                const embed = EmbedBuilder.from(interaction.message.embeds[0]);
                const totalFields = embed.data.fields.length;
                const suggestedDateIndex = totalFields - 1;

                const formattedHours = String(hours).padStart(2, '0');
                const formattedMinutes = String(minutes).padStart(2, '0');
                const dayName = t('labels.suggestedTime', {
                    day: getDayShortNames()[targetDate.day()],
                    date: targetDate.format('DD.MM.'),
                    hours: formattedHours,
                    minutes: formattedMinutes
                });

                embed.addFields({
                    name: dayName,
                    value: t('fields.timeAndParticipants', { unix: unixTime }),
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
                        .setLabel(t('buttons.suggestTime'))
                        .setCustomId('suggest_time_btn')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🕒')
                );

                await interaction.update({ embeds: [embed], components: createButtonRows(existingButtons) });
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: t('errors.modalProcessingFailed'), flags: 64 });
            }
        }
    }
});

client.login(DISCORD_TOKEN);
