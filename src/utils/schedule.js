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

function resolveUpcomingWeekNumber(referenceDate = new Date()) {
  const targetDate = addDays(referenceDate, 1);
  const configuredStartDate = process.env.LEAGUE_START_DATE;

  if (!configuredStartDate) {
    return getIsoWeekNumber(targetDate);
  }

  const seasonStart = startOfUtcDay(new Date(configuredStartDate));

  if (Number.isNaN(seasonStart.getTime())) {
    throw new Error('LEAGUE_START_DATE must be a valid YYYY-MM-DD value.');
  }

  const targetDay = startOfUtcDay(targetDate);
  const diffInDays = Math.floor((targetDay - seasonStart) / 86400000);

  return Math.max(1, Math.floor(diffInDays / 7) + 1);
}

module.exports = {
  resolveUpcomingWeekNumber
};
