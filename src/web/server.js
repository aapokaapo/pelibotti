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
const activeAdminSessions = new Set();
const ADMIN_SESSION_COOKIE = 'pelibotti_admin_session';

function createRateLimiter({ windowMs, maxRequests }) {
  const attempts = new Map();

  return (request, response, next) => {
    const key = `${request.ip}:${request.path}`;
    const now = Date.now();
    const existing = attempts.get(key);

    if (!existing || existing.expiresAt <= now) {
      attempts.set(key, {
        count: 1,
        expiresAt: now + windowMs
      });
      next();
      return;
    }

    if (existing.count >= maxRequests) {
      const isAdminRequest = request.path.startsWith('/admin');
      const payload = {
        isAuthenticated: isAdminAuthenticated(request),
        message: 'Too many requests. Please try again later.',
        isError: true
      };

      if (isAdminRequest) {
        response.status(429).send(renderAdminPage(payload));
      } else {
        response.status(429).send('Too many requests.');
      }
      return;
    }

    existing.count += 1;
    next();
  };
}

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
  return typeof cookies[ADMIN_SESSION_COOKIE] === 'string' && activeAdminSessions.has(cookies[ADMIN_SESSION_COOKIE]);
}

function issueAdminSessionToken() {
  const token = crypto.randomBytes(32).toString('hex');
  activeAdminSessions.add(token);
  return token;
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
      message: '',
      isError: false
    }));
  });

  app.post('/admin/login', createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 10 }), (request, response) => {
    if (!isAdminKeyValid(request.body.adminKey)) {
      response.status(401).send(renderAdminPage({
        isAuthenticated: false,
        message: 'Invalid admin key.',
        isError: true
      }));
      return;
    }

    const secureAttribute = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=${issueAdminSessionToken()}; HttpOnly; Path=/; SameSite=Lax${secureAttribute}`);
    response.send(renderAdminPage({
      isAuthenticated: true,
      message: 'Admin portal unlocked.',
      isError: false
    }));
  });

  app.post('/admin/logout', (request, response) => {
    const cookies = parseCookies(request.headers.cookie);
    if (cookies[ADMIN_SESSION_COOKIE]) {
      activeAdminSessions.delete(cookies[ADMIN_SESSION_COOKIE]);
    }

    response.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
    response.send(renderAdminPage({
      isAuthenticated: false,
      message: 'Logged out.',
      isError: false
    }));
  });

  async function handleUpload(request, response, importer, expectedKey, successLabel) {
    if (!request.file) {
      response.status(400).send(renderAdminPage({
        isAuthenticated: true,
        message: 'Choose a CSV or JSON file to upload.',
        isError: true
      }));
      return;
    }

    const guildId = typeof request.body.guildId === 'string' ? request.body.guildId.trim() : '';
    if (!guildId) {
      response.status(400).send(renderAdminPage({
        isAuthenticated: true,
        message: 'Discord guild ID is required.',
        isError: true
      }));
      return;
    }

    const rows = parseUploadedPayload({
      fileName: request.file.originalname,
      rawText: request.file.buffer.toString('utf8'),
      expectedKey
    });
    const count = await importer(guildId, rows);
    response.send(renderAdminPage({
      isAuthenticated: true,
      message: `${successLabel}: imported ${count} row(s) for guild ${guildId}.`,
      isError: false
    }));
  }

  const adminWriteRateLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 20 });

  app.post('/admin/upload/teams', adminWriteRateLimiter, requireAdmin, upload.single('file'), async (request, response, next) => {
    try {
      await handleUpload(request, response, importTeams, 'teams', 'Teams upload complete');
    } catch (error) {
      next(error);
    }
  });

  app.post('/admin/upload/fixtures', adminWriteRateLimiter, requireAdmin, upload.single('file'), async (request, response, next) => {
    try {
      await handleUpload(request, response, importFixtures, 'fixtures', 'Fixtures upload complete');
    } catch (error) {
      next(error);
    }
  });

  app.post('/admin/upload/map-pools', adminWriteRateLimiter, requireAdmin, upload.single('file'), async (request, response, next) => {
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
