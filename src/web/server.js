const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');
const rateLimit = require('express-rate-limit');

const { prisma } = require('../lib/prisma');
const { getBotInviteUrl, getTimezone, getWebPort, isAdminKeyValid } = require('../utils/env');
const { importFixtures, importMapPools, importTeams } = require('../utils/importers');
const { getTimezoneReferenceDate, resolveUpcomingWeekNumber } = require('../utils/schedule');
const { MAX_UPLOAD_BYTES, parseUploadedPayload } = require('../utils/uploadPayload');
const { renderAdminPage, renderHomePage } = require('./render');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1
  }
});
const ADMIN_SESSION_COOKIE = 'pelibotti_admin_session';
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

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

  const [expiresAtValue, csrfToken, signature] = token.split('.');
  const expiresAt = Number.parseInt(expiresAtValue, 10);

  if (!Number.isInteger(expiresAt) || typeof csrfToken !== 'string' || typeof signature !== 'string') {
    return null;
  }

  const payload = `${expiresAt}.${csrfToken}`;
  const expectedSignature = crypto.createHmac('sha256', process.env.ADMIN_API_KEY).update(payload).digest('hex');
  if (!timingSafeMatch(expectedSignature, signature)) {
    return null;
  }

  if (expiresAt <= Date.now()) {
    return null;
  }

  return {
    token,
    csrfToken,
    expiresAt
  };
}

function isAdminAuthenticated(request) {
  return getAdminSession(request) !== null;
}

function issueAdminSessionToken() {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  const payload = `${expiresAt}.${csrfToken}`;
  const signature = crypto.createHmac('sha256', process.env.ADMIN_API_KEY).update(payload).digest('hex');
  const token = `${payload}.${signature}`;

  return {
    token,
    csrfToken,
    expiresAt
  };
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
  const csrfToken = request.get('x-csrf-token') || request.body?.csrfToken;

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

  const adminPortalRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler(request, response) {
      response.status(429).send(renderAdminPage({
        isAuthenticated: isAdminAuthenticated(request),
        message: 'Too many requests. Please try again later.',
        isError: true,
        csrfToken: request.adminSession?.csrfToken || getAdminSession(request)?.csrfToken || ''
      }));
    }
  });

  const adminLoginRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler(request, response) {
      response.status(429).send(renderAdminPage({
        isAuthenticated: false,
        message: 'Too many login attempts. Please try again later.',
        isError: true
      }));
    }
  });

  const adminWriteRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler(request, response) {
      response.status(429).send(renderAdminPage({
        isAuthenticated: isAdminAuthenticated(request),
        message: 'Too many admin actions. Please try again later.',
        isError: true,
        csrfToken: request.adminSession?.csrfToken || getAdminSession(request)?.csrfToken || ''
      }));
    }
  });

  app.use('/admin', adminPortalRateLimiter);

  app.get('/', async (request, response, next) => {
    try {
      const timezone = getTimezone();
      const weekNumber = resolveUpcomingWeekNumber(getTimezoneReferenceDate(timezone));
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

        const mapPoolByScope = new Map(
          mapPools.map((mapPool) => [`${mapPool.guildId}:${mapPool.channelId || ''}:${mapPool.weekNumber}`, mapPool])
        );
        fixturesWithPools = fixtures.map((fixture) => ({
          ...fixture,
          mapPool: mapPoolByScope.get(`${fixture.guildId}:${fixture.channelId || ''}:${fixture.weekNumber}`)
            || mapPoolByScope.get(`${fixture.guildId}::${fixture.weekNumber}`)
            || null
        }));
      } catch (error) {
        console.error('Failed to load fixtures for the web portal:', error);
        notice = 'Current fixtures are temporarily unavailable.';
      }

      response.send(renderHomePage({
        inviteUrl: getBotInviteUrl(),
        fixtures: fixturesWithPools,
        weekNumber,
        timezone,
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

  app.post('/admin/login', adminLoginRateLimiter, (request, response) => {
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
    response.setHeader(
      'Set-Cookie',
      `${ADMIN_SESSION_COOKIE}=${session.token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(ADMIN_SESSION_TTL_MS / 1000)}${secureAttribute}`
    );
    response.send(renderAdminPage({
      isAuthenticated: true,
      message: 'Admin portal unlocked.',
      isError: false,
      csrfToken: session.csrfToken
    }));
  });

  app.post('/admin/logout', adminWriteRateLimiter, requireAdmin, requireCsrfToken, (request, response) => {
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

    const rows = parseUploadedPayload({
      fileName: request.file.originalname,
      rawText: request.file.buffer.toString('utf8'),
      expectedKey
    });
    await importer(rows);
    response.send(renderAdminPage({
      isAuthenticated: true,
      message: `${successLabel}.`,
      isError: false,
      csrfToken: request.adminSession?.csrfToken || ''
    }));
  }

  app.post('/admin/upload/teams', adminWriteRateLimiter, requireAdmin, requireCsrfToken, upload.single('file'), async (request, response, next) => {
    try {
      await handleUpload(request, response, importTeams, 'teams', 'Teams upload complete');
    } catch (error) {
      next(error);
    }
  });

  app.post('/admin/upload/fixtures', adminWriteRateLimiter, requireAdmin, requireCsrfToken, upload.single('file'), async (request, response, next) => {
    try {
      await handleUpload(request, response, importFixtures, 'fixtures', 'Fixtures upload complete');
    } catch (error) {
      next(error);
    }
  });

  app.post('/admin/upload/map-pools', adminWriteRateLimiter, requireAdmin, requireCsrfToken, upload.single('file'), async (request, response, next) => {
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
