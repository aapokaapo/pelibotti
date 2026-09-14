const WEEKDAY_VALUES = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getIsoWeekNumber(date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
}

function parseLeagueStartDate() {
  const configuredStartDate = process.env.LEAGUE_START_DATE;

  if (!configuredStartDate) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(configuredStartDate)) {
    throw new Error('LEAGUE_START_DATE must use the YYYY-MM-DD format.');
  }

  const [year, month, day] = configuredStartDate.split('-').map((value) => Number.parseInt(value, 10));
  const seasonStart = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(seasonStart.getTime())
    || seasonStart.getUTCFullYear() !== year
    || seasonStart.getUTCMonth() !== month - 1
    || seasonStart.getUTCDate() !== day
  ) {
    throw new Error('LEAGUE_START_DATE must be a valid YYYY-MM-DD value.');
  }

  return seasonStart;
}

function resolveUpcomingWeekNumber(referenceDate = new Date()) {
  const targetDate = referenceDate;
  const seasonStart = parseLeagueStartDate();

  if (!seasonStart) {
    return getIsoWeekNumber(targetDate);
  }

  const targetDay = startOfUtcDay(targetDate);
  const diffInDays = Math.floor((targetDay - seasonStart) / 86400000);

  return Math.max(1, Math.floor(diffInDays / 7) + 1);
}

function getZonedTimeParts(timezone, referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });

  const parts = formatter.formatToParts(referenceDate);
  const weekdayLabel = parts.find((part) => part.type === 'weekday')?.value;
  const hourValue = parts.find((part) => part.type === 'hour')?.value;
  const minuteValue = parts.find((part) => part.type === 'minute')?.value;

  if (!weekdayLabel || hourValue == null || minuteValue == null || WEEKDAY_VALUES[weekdayLabel] == null) {
    throw new Error(`Unable to resolve the current time in timezone ${timezone}.`);
  }

  return {
    dayOfWeek: WEEKDAY_VALUES[weekdayLabel],
    hour: Number.parseInt(hourValue, 10),
    minute: Number.parseInt(minuteValue, 10)
  };
}

function getTimezoneReferenceDate(timezone, referenceDate = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(referenceDate);
  const year = Number.parseInt(parts.find((part) => part.type === 'year')?.value || '', 10);
  const month = Number.parseInt(parts.find((part) => part.type === 'month')?.value || '', 10);
  const day = Number.parseInt(parts.find((part) => part.type === 'day')?.value || '', 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Unable to resolve the current date in timezone ${timezone}.`);
  }

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function parseScheduleTime(rawValue) {
  const trimmed = typeof rawValue === 'string' ? rawValue.trim() : '';
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);

  if (!match) {
    throw new Error('Time must use 24-hour HH:MM format.');
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error('Time must use a valid 24-hour HH:MM value.');
  }

  return { hour, minute };
}

function formatSchedule(dayOfWeek, hour, minute) {
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
  const formattedHour = hour.toString().padStart(2, '0');
  const formattedMinute = minute.toString().padStart(2, '0');
  return `${weekday} ${formattedHour}:${formattedMinute}`;
}

function resolveChannelSchedule(channelRecord) {
  const dayOfWeek = Number.isInteger(channelRecord?.scheduleDayOfWeek) ? channelRecord.scheduleDayOfWeek : 0;
  const hour = Number.isInteger(channelRecord?.scheduleHour) ? channelRecord.scheduleHour : 12;
  const minute = Number.isInteger(channelRecord?.scheduleMinute) ? channelRecord.scheduleMinute : 0;

  return {
    dayOfWeek,
    hour,
    minute
  };
}

module.exports = {
  formatSchedule,
  getTimezoneReferenceDate,
  getZonedTimeParts,
  parseScheduleTime,
  resolveChannelSchedule,
  resolveUpcomingWeekNumber
};
