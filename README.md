# Beige Backend API

![Beige Logo](https://via.placeholder.com/150x50?text=Beige+Logo)

Backend service for Beige platform, handling content provider management, file operations, and user authentication.

## ✨ Features

- **User Authentication** - Secure JWT-based authentication
- **Content Provider Management** - Onboard and manage content creators
- **File Management** - Secure file uploads and downloads using Google Cloud Storage
- **API Documentation** - Comprehensive API documentation with Swagger
- **Role-based Access Control** - Different access levels for admins and users

## 🚀 Quick Start

1. Clone the repository
2. Install dependencies: `pnpm install` or `npm install`
3. Set up environment variables (see [SETUP_GUIDE.md](./SETUP_GUIDE.md))
4. Start the server: `pnpm dev`

## 📚 Documentation

### API Reference

Explore the API documentation:
- Development: `http://localhost:3000/api-docs`
- Production: `https://your-production-url.com/api-docs`

### Content Provider API

#### Create Content Provider

```http
POST /cp
```

**Request Body:**
```json
{
    "content_verticals": [],
    "successful_beige_shoots": 0,
    "trust_score": 0,
    "average_rating": 0,
    "avg_response_time": 0,
    "equipment": [],
    "portfolio": [],
    "total_earnings": 0,
    "transportation_methods": [],
    "travel_to_distant_shoots": false,
    "experience_with_post_production_edit": false,
    "customer_service_skills_experience": false,
    "team_player": true,
    "avg_response_time_to_new_shoot_inquiry": 0,
    "num_declined_shoots": 0,
    "num_accepted_shoots": 0,
    "num_no_shows": 0,
    "userId": "user_id_here",
    "city": "City Name"
}
```

## 🔧 Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MongoDB
- **Storage**: Google Cloud Storage
- **Authentication**: JWT
- **API Docs**: Swagger/OpenAPI

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
