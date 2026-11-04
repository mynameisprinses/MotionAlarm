import { apiKey, authUrl, tokenUrl, documentsUrl, databaseName } from './config.mjs';

export class ApiError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Only this file needs to know Firebase's URLs and document format.
async function requestFirebase(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new ApiError(503, 'Could not reach Firebase. Please try again.', 'SERVICE_UNAVAILABLE');
  }
  const data = await response.json();
  if (!response.ok) {
    const code = data.error?.message?.split(' : ')[0] || data.error?.status || 'REQUEST_FAILED';
    throw new ApiError(response.status, 'Firebase could not complete the request.', code);
  }
  return data;
}

export function callAuth(action, body) {
  return requestFirebase(`${authUrl}/accounts:${action}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function refreshLogin(refreshToken) {
  const data = await requestFirebase(`${tokenUrl}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  const lookup = await callAuth('lookup', { idToken: data.id_token });
  const user = lookup.users?.[0];
  if (!user || user.disabled) throw new ApiError(401, 'Please log in again.', 'SESSION_EXPIRED');
  return makeSession({
    localId: user.localId,
    email: user.email,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  });
}

export function makeSession(data) {
  return {
    user: { uid: data.localId, email: data.email },
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + Number(data.expiresIn) * 1000,
  };
}

export async function requireLogin(req, res, next) {
  const authorization = req.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new ApiError(401, 'Log in to access your alerts.', 'UNAUTHORIZED');
  req.idToken = authorization.slice(7);
  try {
    const data = await callAuth('lookup', { idToken: req.idToken });
    const user = data.users?.[0];
    if (!user || user.disabled) throw new ApiError(401, 'Please log in again.', 'SESSION_EXPIRED');
    req.user = { uid: user.localId, email: user.email };
  } catch (error) {
    if (error.status === 503) throw error;
    throw new ApiError(401, 'Your login has expired. Please log in again.', 'SESSION_EXPIRED');
  }
  next();
}

function firestoreRequest(path, idToken, method = 'GET', body) {
  return requestFirebase(`${documentsUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function userPath(uid) {
  return `/users/${encodeURIComponent(uid)}`;
}

export async function listAlerts(uid, idToken) {
  const alerts = [];
  let pageToken = '';
  do {
    const parameters = new URLSearchParams({ pageSize: '300', orderBy: 'createdAt desc' });
    if (pageToken) parameters.set('pageToken', pageToken);
    const page = await firestoreRequest(
      `${userPath(uid)}/alerts?${parameters.toString().replaceAll('+', '%20')}`,
      idToken,
    );
    for (const document of page.documents || []) alerts.push(readAlert(document));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return alerts;
}

export async function createAlert(uid, idToken, alert) {
  const path = `${userPath(uid)}/alerts/${alert.id}`;
  const receiptPath = `${userPath(uid)}/imports/${alert.id}`;
  if (await documentExists(receiptPath, idToken)) return;
  const receipt = { name: `${databaseName}/documents${receiptPath}`, fields: { id: { stringValue: alert.id } } };
  const writes = [];
  if (!(await documentExists(path, idToken))) {
    writes.push({
      update: { name: `${databaseName}/documents${path}`, fields: writeAlert(alert) },
      currentDocument: { exists: false },
    });
  }
  // Save the alert and its receipt together. Retrying must not recreate a deleted alert.
  writes.push({ update: receipt, currentDocument: { exists: false } });
  try {
    await firestoreRequest(':commit', idToken, 'POST', { writes });
  } catch (error) {
    if (error.status !== 409 || !(await documentExists(receiptPath, idToken))) throw error;
  }
}

async function documentExists(path, idToken) {
  try {
    await firestoreRequest(path, idToken);
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

export async function updateAlert(uid, idToken, id, status) {
  try {
    await firestoreRequest(
      `${userPath(uid)}/alerts/${id}?updateMask.fieldPaths=status&currentDocument.exists=true`,
      idToken,
      'PATCH',
      { fields: { status: { stringValue: status } } },
    );
  } catch (error) {
    // Rules can deny a patch to a missing document before checking its precondition.
    if (
      (error.status === 403 || error.status === 404) &&
      !(await documentExists(`${userPath(uid)}/alerts/${id}`, idToken))
    ) {
      throw new ApiError(404, 'This alert no longer exists.', 'NOT_FOUND');
    }
    throw error;
  }
}

export async function deleteAlert(uid, idToken, id) {
  await firestoreRequest(`${userPath(uid)}/alerts/${id}`, idToken, 'DELETE');
}

export async function clearAlerts(uid, idToken) {
  const alerts = await listAlerts(uid, idToken);
  for (let start = 0; start < alerts.length; start += 450) {
    const writes = [];
    for (const alert of alerts.slice(start, start + 450)) {
      writes.push({ delete: `${databaseName}/documents${userPath(uid)}/alerts/${alert.id}` });
    }
    await firestoreRequest(':commit', idToken, 'POST', { writes });
  }
}

function writeAlert(alert) {
  return {
    id: { stringValue: alert.id },
    createdAt: { stringValue: alert.createdAt },
    source: { stringValue: alert.source },
    status: { stringValue: alert.status },
    strength: alert.strength === null ? { nullValue: null } : { doubleValue: alert.strength },
  };
}

function readAlert(document) {
  const fields = document.fields;
  return {
    id: fields.id.stringValue,
    createdAt: fields.createdAt.stringValue,
    source: fields.source.stringValue,
    status: fields.status.stringValue,
    strength:
      fields.strength.nullValue === null ? null : Number(fields.strength.doubleValue ?? fields.strength.integerValue),
  };
}
