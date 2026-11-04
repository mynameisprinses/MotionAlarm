import express from 'express';
import cors from 'cors';
import { allowedOrigins, projectId } from './config.mjs';
import {
  ApiError,
  callAuth,
  makeSession,
  refreshLogin,
  requireLogin,
  listAlerts,
  createAlert,
  updateAlert,
  deleteAlert,
  clearAlerts,
} from './firebase.mjs';

export const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '8kb' }));
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', projectId }));

app.post('/api/auth/register', async (req, res) => {
  const { email, password } = readCredentials(req.body);
  const data = await callAuth('signUp', { email, password, returnSecureToken: true });
  res.status(201).json(makeSession(data));
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = readCredentials(req.body);
  const data = await callAuth('signInWithPassword', { email, password, returnSecureToken: true });
  res.json(makeSession(data));
});

app.post('/api/auth/refresh', async (req, res) => {
  if (typeof req.body?.refreshToken !== 'string' || !req.body.refreshToken)
    throw new ApiError(400, 'A refresh token is required.');
  res.json(await refreshLogin(req.body.refreshToken));
});

app.post('/api/auth/password-reset', async (req, res) => {
  const email = readEmail(req.body?.email);
  try {
    await callAuth('sendOobCode', { requestType: 'PASSWORD_RESET', email });
  } catch (error) {
    if (error.code !== 'EMAIL_NOT_FOUND') throw error;
  }
  res.json({ message: 'If the account exists, a reset link will be sent.' });
});

app.get('/api/auth/me', requireLogin, (req, res) => res.json({ user: req.user }));

// The user ID always comes from the verified token, never from the request body.
app.use('/api/alerts', requireLogin);

app.get('/api/alerts', async (req, res) => {
  res.json({ alerts: await listAlerts(req.user.uid, req.idToken) });
});

app.post('/api/alerts', async (req, res) => {
  const alert = readMovementAlert(req.body);
  await createAlert(req.user.uid, req.idToken, alert);
  res.status(201).json({ id: alert.id });
});

app.patch('/api/alerts/:id', async (req, res) => {
  const id = readId(req.params.id);
  if (!req.body || Object.keys(req.body).length !== 1 || !['New', 'Reviewed'].includes(req.body.status))
    throw new ApiError(400, 'Choose New or Reviewed.');
  await updateAlert(req.user.uid, req.idToken, id, req.body.status);
  res.json({ id, status: req.body.status });
});

app.delete('/api/alerts/:id', async (req, res) => {
  await deleteAlert(req.user.uid, req.idToken, readId(req.params.id));
  res.status(204).end();
});

app.delete('/api/alerts', async (req, res) => {
  await clearAlerts(req.user.uid, req.idToken);
  res.status(204).end();
});

app.use((req, res) =>
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'This API route does not exist.' } }),
);
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status =
    error instanceof ApiError
      ? error.status
      : error.type === 'entity.too.large'
        ? 413
        : error instanceof SyntaxError
          ? 400
          : 500;
  res.status(status).json({
    error: {
      code: error instanceof ApiError ? error.code : 'REQUEST_FAILED',
      message:
        error instanceof ApiError
          ? error.message
          : status === 400
            ? 'Send a valid JSON request.'
            : 'The request could not be completed.',
    },
  });
});

function readEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
    throw new ApiError(400, 'Enter a valid email address.', 'INVALID_EMAIL');
  return value.trim();
}

function readCredentials(body) {
  const email = readEmail(body?.email);
  if (typeof body?.password !== 'string' || !body.password || body.password.length > 4096)
    throw new ApiError(400, 'Enter your password.');
  return { email, password: body.password };
}

function readId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new ApiError(400, 'Choose a valid alert ID.');
  return value;
}

function readMovementAlert(body) {
  if (!body || Object.keys(body).sort().join(',') !== 'createdAt,id,source,status,strength')
    throw new ApiError(400, 'Send only the five movement alert fields.');
  readId(body.id);
  if (body.source !== 'Movement' || body.status !== 'New')
    throw new ApiError(400, 'Only new movement alerts can be saved. Test alarms are not saved.');
  if (
    typeof body.createdAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.createdAt) ||
    !Number.isFinite(Date.parse(body.createdAt))
  )
    throw new ApiError(400, 'Choose a valid alert date.');
  if (
    body.strength !== null &&
    (typeof body.strength !== 'number' || !Number.isFinite(body.strength) || body.strength < 0 || body.strength > 10000)
  )
    throw new ApiError(400, 'Choose a valid movement level.');
  return body;
}
