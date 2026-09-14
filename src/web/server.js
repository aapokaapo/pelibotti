const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');

const { prisma } = require('../lib/prisma');
const { getBotInviteUrl, getTimezone, getWebPort, isAdminKeyValid } = require('../utils/env');
const { importFixtures, importMapPools, importTeams } = require('../utils/importers');
const { resolveUpcomingWeekNumber } = require('../utils/schedule');
const { parseUploadedPayload } = require('../utils/uploadPayload');
const { renderAdminPage, renderHomePage } = require('./render');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1
  }
});

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce((cookies, entry) => {
    const [name, ...valueParts] = entry.trim().split('=');
    cookies[name] = decodeURIComponent(valueParts.join('='));
    return cookies;
  }, {});
}

function isAdminAuthenticated(request) {
  const cookies = parseCookies(request.headers.cookie);
  return cookies.pelibotti_admin_session === createAdminSessionToken();
}

function createAdminSessionToken() {
  return crypto.createHash('sha256').update(process.env.ADMIN_API_KEY).digest('hex');
}

function requireAdmin(request, response, next) {
  if (!isAdminAuthenticated(request)) {
    response.status(401).send(renderAdminPage({
      isAuthenticated: false,
      message: 'Admin login required.',
      isError: true
    }));
    return;
  }

  next();
}

function redirectToAdmin(response, message, isError = false) {
  const params = new URLSearchParams({
    message,
    status: isError ? 'error' : 'ok'
  });
  response.redirect(`/admin?${params.toString()}`);
}

async function startWebServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false }));

  app.get('/', async (request, response, next) => {
    try {
      const weekNumber = resolveUpcomingWeekNumber();
      let fixturesWithPools = [];
      let notice = '';

      try {
        const [fixtures, mapPools] = await Promise.all([
          prisma.fixture.findMany({
            where: { weekNumber },
            include: {
              teamA: true,
              teamB: true
            },
            orderBy: [
              { guildId: 'asc' },
              { teamA: { name: 'asc' } },
              { teamB: { name: 'asc' } }
            ]
          }),
          prisma.mapPool.findMany({
            where: { weekNumber }
          })
        ]);

        const mapPoolByGuild = new Map(mapPools.map((mapPool) => [`${mapPool.guildId}:${mapPool.weekNumber}`, mapPool]));
        fixturesWithPools = fixtures.map((fixture) => ({
          ...fixture,
          mapPool: mapPoolByGuild.get(`${fixture.guildId}:${fixture.weekNumber}`) || null
        }));
      } catch (error) {
        console.error('Failed to load fixtures for the web portal:', error);
        notice = 'Current fixtures are temporarily unavailable.';
      }

      response.send(renderHomePage({
        inviteUrl: getBotInviteUrl(),
        fixtures: fixturesWithPools,
        weekNumber,
        timezone: getTimezone(),
        notice
      }));
    } catch (error) {
      next(error);
    }
  });

  app.get('/invite', (request, response) => {
    response.redirect(getBotInviteUrl());
  });

  app.get('/admin', (request, response) => {
    response.send(renderAdminPage({
      isAuthenticated: isAdminAuthenticated(request),
      message: request.query.message,
      isError: request.query.status === 'error'
    }));
  });

  app.post('/admin/login', (request, response) => {
    if (!isAdminKeyValid(request.body.adminKey)) {
      response.status(401).send(renderAdminPage({
        isAuthenticated: false,
        message: 'Invalid admin key.',
        isError: true
      }));
      return;
    }

    response.setHeader('Set-Cookie', `pelibotti_admin_session=${createAdminSessionToken()}; HttpOnly; Path=/; SameSite=Lax`);
    redirectToAdmin(response, 'Admin portal unlocked.');
  });

  app.post('/admin/logout', (request, response) => {
    response.setHeader('Set-Cookie', 'pelibotti_admin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    redirectToAdmin(response, 'Logged out.');
  });

  async function handleUpload(request, response, importer, expectedKey, successLabel) {
    if (!request.file) {
      redirectToAdmin(response, 'Choose a CSV or JSON file to upload.', true);
      return;
    }

    const guildId = typeof request.body.guildId === 'string' ? request.body.guildId.trim() : '';
    if (!guildId) {
      redirectToAdmin(response, 'Discord guild ID is required.', true);
      return;
    }

    const rows = parseUploadedPayload({
      fileName: request.file.originalname,
      rawText: request.file.buffer.toString('utf8'),
      expectedKey
    });
    const count = await importer(guildId, rows);
    redirectToAdmin(response, `${successLabel}: imported ${count} row(s) for guild ${guildId}.`);
  }

  app.post('/admin/upload/teams', requireAdmin, upload.single('file'), async (request, response, next) => {
    try {
      await handleUpload(request, response, importTeams, 'teams', 'Teams upload complete');
    } catch (error) {
      next(error);
    }
  });

  app.post('/admin/upload/fixtures', requireAdmin, upload.single('file'), async (request, response, next) => {
    try {
      await handleUpload(request, response, importFixtures, 'fixtures', 'Fixtures upload complete');
    } catch (error) {
      next(error);
    }
  });

  app.post('/admin/upload/map-pools', requireAdmin, upload.single('file'), async (request, response, next) => {
    try {
      await handleUpload(request, response, importMapPools, 'mapPools', 'Map pools upload complete');
    } catch (error) {
      next(error);
    }
  });

  app.use((error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const isAdminRequest = request.path.startsWith('/admin');

    if (isAdminRequest) {
      response.status(400).send(renderAdminPage({
        isAuthenticated: isAdminAuthenticated(request),
        message: error.message || 'Unexpected web error.',
        isError: true
      }));
      return;
    }

    response.status(500).send('Unexpected web error.');
  });

  const port = getWebPort();

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`Web portal listening on port ${port}`);
      resolve(server);
    });
  });
}

module.exports = {
  startWebServer
};
