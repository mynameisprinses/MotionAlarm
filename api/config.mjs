export const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'motionalarm-560cd';
export const apiKey = process.env.FIREBASE_API_KEY || 'AIzaSyBRhIPLOxb2l2_0vdona6t3-qd34mXp4Ds';

const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
export const testing = process.argv.includes('--test');

if (testing && (!projectId.startsWith('demo-') || !authEmulator || !firestoreEmulator)) {
  throw new Error('API tests require a demo project and both Firebase emulators.');
}

export const authUrl = authEmulator
  ? `http://${authEmulator}/identitytoolkit.googleapis.com/v1`
  : 'https://identitytoolkit.googleapis.com/v1';
export const tokenUrl = authEmulator
  ? `http://${authEmulator}/securetoken.googleapis.com/v1/token`
  : 'https://securetoken.googleapis.com/v1/token';
export const databaseName = `projects/${projectId}/databases/(default)`;
export const documentsUrl = `${firestoreEmulator ? `http://${firestoreEmulator}` : 'https://firestore.googleapis.com'}/v1/${databaseName}/documents`;
export const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  'http://localhost:4200,http://localhost:8100,http://127.0.0.1:4200,http://127.0.0.1:4201,https://localhost,capacitor://localhost'
)
  .split(',')
  .map((origin) => origin.trim());
