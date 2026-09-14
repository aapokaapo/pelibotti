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
const activeAdminSessions = new Map();
const ADMIN_SESSION_COOKIE = 'pelibotti_admin_session';
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

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

function timingSafeMatch(expected, received) {
  if (typeof expected !== 'string' || typeof received !== 'string' || expected.length === 0 || received.length === 0) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    const padded = Buffer.alloc(expectedBuffer.length);
    receivedBuffer.copy(padded, 0, 0, Math.min(receivedBuffer.length, expectedBuffer.length));
    crypto.timingSafeEqual(expectedBuffer, padded);
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function getAdminSession(request) {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[ADMIN_SESSION_COOKIE];

  if (typeof token !== 'string') {
    return null;
  }

  const session = activeAdminSessions.get(token);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    activeAdminSessions.delete(token);
    return null;
  }

  return {
    token,
    ...session
  };
}

function isAdminAuthenticated(request) {
  return getAdminSession(request) !== null;
}

function issueAdminSessionToken() {
  const token = crypto.randomBytes(32).toString('hex');
  activeAdminSessions.set(token, {
    csrfToken: crypto.randomBytes(32).toString('hex'),
    expiresAt: Date.now() + ADMIN_SESSION_TTL_MS
  });
  return getAdminSession({ headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` } });
}

function requireAdmin(request, response, next) {
  const session = getAdminSession(request);

  if (!session) {
    response.status(401).send(renderAdminPage({
      isAuthenticated: false,
      message: 'Admin login required.',
      isError: true
    }));
    return;
  }

  request.adminSession = session;
  next();
}

function requireCsrfToken(request, response, next) {
  const csrfToken = request.body?.csrfToken;

  if (!request.adminSession || !timingSafeMatch(request.adminSession.csrfToken, csrfToken)) {
    response.status(403).send(renderAdminPage({
      isAuthenticated: true,
      message: 'Invalid security token. Refresh the admin page and try again.',
      isError: true,
      csrfToken: request.adminSession?.csrfToken || ''
    }));
    return;
  }

  next();
}

async function startWebServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false }));
  app.use('/admin', createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 60 }));

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
    const session = getAdminSession(request);
    response.send(renderAdminPage({
      isAuthenticated: Boolean(session),
      message: '',
      isError: false,
      csrfToken: session?.csrfToken || ''
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

    const session = issueAdminSessionToken();
    const secureAttribute = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=${session.token}; HttpOnly; Path=/; SameSite=Lax${secureAttribute}`);
    response.send(renderAdminPage({
      isAuthenticated: true,
      message: 'Admin portal unlocked.',
      isError: false,
      csrfToken: session.csrfToken
    }));
  });

  app.post('/admin/logout', createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 20 }), requireAdmin, requireCsrfToken, (request, response) => {
    activeAdminSessions.delete(request.adminSession.token);

    const secureAttribute = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secureAttribute}`);
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
        isError: true,
        csrfToken: request.adminSession?.csrfToken || ''
      }));
      return;
    }

    const guildId = typeof request.body.guildId === 'string' ? request.body.guildId.trim() : '';
    if (!guildId) {
      response.status(400).send(renderAdminPage({
        isAuthenticated: true,
        message: 'Discord guild ID is required.',
        isError: true,
        csrfToken: request.adminSession?.csrfToken || ''
      }));
      return;
    }

    const rows = parseUploadedPayload({
      fileName: request.file.originalname,
      rawText: request.file.buffer.toString('utf8'),
      expectedKey
    });
    await importer(guildId, rows);
    response.send(renderAdminPage({
      isAuthenticated: true,
      message: `${successLabel}.`,
      isError: false,
      csrfToken: request.adminSession?.csrfToken || ''
    }));
  }

  const adminWriteRateLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 20 });

  app.post('/admin/upload/teams', adminWriteRateLimiter, requireAdmin, upload.single('file'), requireCsrfToken, async (request, response, next) => {
    try {
      await handleUpload(request, response, importTeams, 'teams', 'Teams upload complete');
    } catch (error) {
      next(error);
    }
  });

  app.post('/admin/upload/fixtures', adminWriteRateLimiter, requireAdmin, upload.single('file'), requireCsrfToken, async (request, response, next) => {
    try {
      await handleUpload(request, response, importFixtures, 'fixtures', 'Fixtures upload complete');
    } catch (error) {
      next(error);
    }
  });

  app.post('/admin/upload/map-pools', adminWriteRateLimiter, requireAdmin, upload.single('file'), requireCsrfToken, async (request, response, next) => {
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
    console.error('Web portal error:', error);

    if (isAdminRequest) {
      response.status(400).send(renderAdminPage({
        isAuthenticated: isAdminAuthenticated(request),
        message: 'Unexpected web error. Check the server logs.',
        isError: true,
        csrfToken: request.adminSession?.csrfToken || getAdminSession(request)?.csrfToken || ''
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
