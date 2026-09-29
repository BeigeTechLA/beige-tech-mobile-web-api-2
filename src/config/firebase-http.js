const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_PROJECT_KEY = process.env.FIREBASE_PROJECT_KEY || 'default';
const DEFAULT_FIREBASE_PROJECT_ENV = process.env.FIREBASE_PROJECT_ENV || process.env.NODE_ENV;

const normalizePrivateKey = (value) => value?.replace(/\\n/g, '\n');
const normalizeString = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
};

const getServiceAccountFromFile = (filePath) => {
  const normalizedPath = normalizeString(filePath);
  if (!normalizedPath) return {};

  try {
    // This supports development-only, gitignored service-account files. Production
    // deployments should continue to provide credentials through environment secrets.
    return require(require('path').resolve(normalizedPath));
  } catch (error) {
    console.error(`Unable to load Firebase service-account file ${normalizedPath}: ${error.message}`);
    return {};
  }
};

const normalizeProject = (project = {}) => {
  const serviceAccount = getServiceAccountFromFile(project.service_account_file || project.serviceAccountFile);

  return {
    key: normalizeString(project.key || project.project_key) || DEFAULT_PROJECT_KEY,
    env: normalizeString(project.env || project.environment || DEFAULT_FIREBASE_PROJECT_ENV)?.toLowerCase(),
    appUserType: normalizeString(project.app_user_type || project.appUserType),
    deviceTypes: Array.isArray(project.device_types || project.deviceTypes)
      ? (project.device_types || project.deviceTypes).map((item) => normalizeString(item)?.toLowerCase()).filter(Boolean)
      : [],
    projectId: normalizeString(project.project_id || project.projectId || serviceAccount.project_id),
    clientEmail: normalizeString(project.client_email || project.clientEmail || serviceAccount.client_email),
    privateKey: normalizePrivateKey(project.private_key || project.privateKey || serviceAccount.private_key),
  };
};

const parseProjectList = (rawValue, variableName) => {
  if (!rawValue) return [];

  try {
    const parsedProjects = JSON.parse(rawValue);
    if (!Array.isArray(parsedProjects)) {
      console.error(`${variableName} must be a JSON array.`);
      return [];
    }
    return parsedProjects.map(normalizeProject);
  } catch (error) {
    console.error(`Invalid ${variableName}: ${error.message}`);
    return [];
  }
};

const parseFirebaseProjects = () => {
  const primaryProjects = parseProjectList(process.env.FIREBASE_PROJECTS_JSON, 'FIREBASE_PROJECTS_JSON');
  const additionalProjects = parseProjectList(
    process.env.FIREBASE_ADDITIONAL_PROJECTS_JSON,
    'FIREBASE_ADDITIONAL_PROJECTS_JSON'
  );

  if (primaryProjects.length || additionalProjects.length) {
    return [...primaryProjects, ...additionalProjects];
  }

  return [
    normalizeProject({
      key: DEFAULT_PROJECT_KEY,
      env: DEFAULT_FIREBASE_PROJECT_ENV,
      app_user_type: process.env.FIREBASE_APP_USER_TYPE,
      device_types: process.env.FIREBASE_DEVICE_TYPES
        ? process.env.FIREBASE_DEVICE_TYPES.split(',')
        : [],
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY,
    }),
  ];
};

const firebaseProjects = parseFirebaseProjects();

console.log('Firebase project mappings loaded:', firebaseProjects.map((project) => ({
  key: project.key,
  env: project.env,
  appUserType: project.appUserType,
  deviceTypes: project.deviceTypes,
  hasProjectId: !!project.projectId,
  hasClientEmail: !!project.clientEmail,
  hasPrivateKey: !!project.privateKey,
})));

const validateFirebaseProject = (project) => {
  if (!project.projectId || !project.clientEmail || !project.privateKey) {
    const error = new Error(`Firebase HTTP v1 config is incomplete for project key: ${project.key}`);
    error.code = 'FIREBASE_PROJECT_CONFIG_INCOMPLETE';
    throw error;
  }

  return project;
};

const getFirebaseProjects = () => firebaseProjects.map(validateFirebaseProject);

const getFirebaseProjectForToken = ({ appUserType, deviceType }) => {
  const currentEnv = normalizeString(DEFAULT_FIREBASE_PROJECT_ENV)?.toLowerCase();
  const normalizedAppUserType = normalizeString(appUserType);
  const normalizedDeviceType = normalizeString(deviceType)?.toLowerCase();

  const project = firebaseProjects.find((item) => (
    (!item.env || item.env === currentEnv) &&
    (!item.appUserType || item.appUserType === normalizedAppUserType) &&
    (!item.deviceTypes.length || item.deviceTypes.includes(normalizedDeviceType))
  ));

  if (!project) {
    console.warn('Firebase project mapping not found:', {
      currentEnv,
      appUserType: normalizedAppUserType,
      deviceType: normalizedDeviceType,
      availableMappings: firebaseProjects.map((item) => ({
        key: item.key,
        env: item.env,
        appUserType: item.appUserType,
        deviceTypes: item.deviceTypes,
        hasProjectId: !!item.projectId,
        hasClientEmail: !!item.clientEmail,
        hasPrivateKey: !!item.privateKey,
      })),
    });

    const error = new Error('Firebase project config not found for token app_user_type/device_type.');
    error.code = 'FIREBASE_PROJECT_TOKEN_MAPPING_MISSING';
    throw error;
  }

  console.log('Firebase project mapping selected:', {
    key: project.key,
    currentEnv,
    appUserType: normalizedAppUserType,
    deviceType: normalizedDeviceType,
  });

  return validateFirebaseProject(project);
};

module.exports = {
  FCM_SCOPE,
  GOOGLE_OAUTH_TOKEN_URL,
  DEFAULT_PROJECT_KEY,
  getFirebaseProjects,
  getFirebaseProjectForToken,
};
