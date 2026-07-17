const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_PROJECT_KEY = process.env.FIREBASE_PROJECT_KEY || 'default';

const normalizePrivateKey = (value) => value?.replace(/\\n/g, '\n');

const getFirebaseProject = () => {
  const project = {
    key: DEFAULT_PROJECT_KEY,
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  };

  if (!project.projectId || !project.clientEmail || !project.privateKey) {
    const error = new Error('Firebase HTTP v1 environment variables are not configured.');
    error.code = 'FIREBASE_PROJECT_CONFIG_INCOMPLETE';
    throw error;
  }

  return project;
};

module.exports = {
  FCM_SCOPE,
  GOOGLE_OAUTH_TOKEN_URL,
  DEFAULT_PROJECT_KEY,
  getFirebaseProject,
};
