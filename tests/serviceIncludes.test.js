const request = require('supertest');
const app = require('../src/app');
const { ServiceIncludes, CP, User } = require('../src/models');

// Mock data
const mockUser = {
  name: 'Test CP User',
  email: 'testcp@example.com',
  password: 'password123',
  location: 'Test City',
  role: 'cp'
};

const mockCP = {
  city: 'Test City',
  neighborhood: 'Test Neighborhood',
  content_type: ['photography'],
  rate: '100'
};

const mockServiceIncludes = {
  title: ['Photography Service', 'Video Editing', 'Drone Shots']
};

describe('Service Includes API', () => {
  let userId;
  let cpId;
  let authToken;

  beforeAll(async () => {
    // Clean up any existing test data
    await User.deleteMany({ email: mockUser.email });
    await ServiceIncludes.deleteMany({});
  });

  afterAll(async () => {
    // Clean up test data
    await User.deleteMany({ email: mockUser.email });
    await ServiceIncludes.deleteMany({});
  });

  describe('POST /v1/service-includes', () => {
    it('should create service includes successfully', async () => {
      // First create a user and CP for testing
      const userResponse = await request(app)
        .post('/v1/auth/register')
        .send(mockUser)
        .expect(201);

      userId = userResponse.body.user.id;
      authToken = userResponse.body.tokens.access.token;

      // Create CP
      const cpData = { ...mockCP, userId };
      const cpResponse = await request(app)
        .post('/v1/cp')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cpData)
        .expect(201);

      cpId = cpResponse.body._id;

      // Create service includes
      const serviceData = { ...mockServiceIncludes, cpId: userId };
      const response = await request(app)
        .post('/v1/service-includes')
        .set('Authorization', `Bearer ${authToken}`)
        .send(serviceData)
        .expect(201);

      expect(response.body.message).toBe('Service includes created successfully');
      expect(response.body.data).toHaveLength(3);
      expect(response.body.count).toBe(3);
    });

    it('should return 400 for invalid CP ID', async () => {
      const invalidData = { ...mockServiceIncludes, cpId: 'invalid-id' };
      
      await request(app)
        .post('/v1/service-includes')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidData)
        .expect(400);
    });
  });

  describe('GET /v1/service-includes/cp/:cpId', () => {
    it('should get service includes by CP ID', async () => {
      const response = await request(app)
        .get(`/v1/service-includes/cp/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.results).toBeDefined();
      expect(response.body.results.length).toBeGreaterThan(0);
    });
  });


});
