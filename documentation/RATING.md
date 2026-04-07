## Rating API Documentation

The Rating API allows you to manage ratings between buyers and sellers. Ratings provide valuable feedback and help build
trust within the marketplace. The API provides endpoints for both buyer-to-seller and seller-to-buyer ratings.

**Background**

The Rating API is built using a Node.js runtime environment and leverages the Express.js framework for handling HTTP requests and responses. The API endpoints are designed to efficiently handle rating-related operations, such as retrieving ratings, submitting ratings, and querying ratings by specific criteria. The Rating API utilizes a MongoDB database to store and manage rating-related data. Within the database, there is a dedicated collection named "ratings" that stores individual rating records. Each rating record consists of essential information, including the rating value, review text, the user who provided the rating, the user or seller being rated, and the associated order.

To establish relationships and enable efficient data retrieval, the rating records maintain references to the users, sellers, and orders they are associated with. This design allows for seamless navigation and retrieval of rating information based on different criteria, such as specific users, sellers, or orders. For example, when a user wants to rate a seller or buyer, they would submit a rating request with the required data, including the rating value, review text, and the associated order. The API validates the request, creates a new rating record in the "ratings" collection, and establishes the necessary references to the user, seller/buyer, and order.

**Frontend Implementation**

While the documentation primarily focuses on the Rating API itself, integrating the API endpoints into frontend applications is an essential part of utilizing its functionality. Frontend developers can interact with the Rating API by making HTTP requests to the relevant endpoints using libraries or frameworks such as Fetch API, Axios, or jQuery.ajax.

To ensure secure access to the API, appropriate authorization headers should be included in the requests. Handling the responses received from the API is also crucial for displaying feedback or performing further actions in the frontend application.

### GET - Get All Ratings

Retrieves all ratings.

- **Endpoint:** `/v1/rating/`
- **Method:** GET

**Query Parameters**

- `sortBy` (optional): Sort the ratings by the creation date in descending order. Example: `createdAt:desc`
- `limit` (optional): Limit the number of ratings per page. Example: `4`
- `page` (optional): Specify the page number. Example: `1`

**Example Request**

```javascript
var requestOptions = {
    method: 'GET',
    redirect: 'follow'
};

fetch("https://api.beigecorporation.io/v1/rating/", requestOptions)
    .then(response => response.json())
    .then(result => console.log(result))
    .catch(error => console.log('error', error));
  ``` 

**Successful Response**

- **Status:** 200 OK
- **Body:**

```json
{
  "results": [
    {
      "rating": 3,
      "review": "The buyer is overall good but not responsive",
      "rating_by": {
        "role": "cp",
        "isEmailVerified": false,
        "name": "Beige Studio",
        "email": "studio@beige.com",
        "id": "64897d2d58e8e97d0df27bb6"
      },
      "order_id": "6492a2194ef06a428f1766e9",
      "rating_type": "seller_to_buyer",
      "rating_to": {
        "role": "user",
        "isEmailVerified": false,
        "name": "Rohsin Al Razi",
        "email": "alrazi900@gmail.com",
        "id": "64a91cee89bcdb4d6361d995"
      },
      "id": "64afdcb12777d5328a4c3eb2"
    },
    {
      "rating": 5,
      "review": "The buyer is very co-operative",
      "rating_by": {
        "role": "cp",
        "isEmailVerified": false,
        "name": "Beige Studio",
        "email": "studio@beige.com",
        "id": "64897d2d58e8e97d0df27bb6"
      },
      "order_id": "6492a2194ef06a428f1766e9",
      "rating_type": "seller_to_buyer",
      "rating_to": {
        "role": "user",
        "isEmailVerified": false,
        "name": "Rohsin Al Razi",
        "email": "alrazi900@gmail.com",
        "id": "64a91cee89bcdb4d6361d995"
      },
      "id": "64afd2672777d5328a4c3e86"
    },
    {
      "rating": 4,
      "review": "The seller is experienced and talented",
      "rating_by": {
        "role": "user",
        "isEmailVerified": false,
        "name": "Rohsin Al Razi",
        "email": "alrazi900@gmail.com",
        "id": "64a91cee89bcdb4d6361d995"
      },
      "order_id": "6492a2194ef06a428f1766e9",
      "rating_to": {
        "role": "cp",
        "isEmailVerified": false,
        "name": "Beige Studio",
        "email": "studio@beige.com",
        "id": "64897d2d58e8e97d0df27bb6"
      },
      "rating_type": "buyer_to_seller",
      "id": "64afd5422777d5328a4c3e94"
    },
    {
      "rating": 5,
      "review": "Very responsible seller",
      "rating_by": {
        "role": "user",
        "isEmailVerified": false,
        "name": "Rohsin Al Razi",
        "email": "alrazi900@gmail.com",
        "id": "64a91cee89bcdb4d6361d995"
      },
      "order_id": "6492a2194ef06a428f1766e9",
      "rating_to": {
        "role": "cp",
        "isEmailVerified": false,
        "name": "Beige Studio",
        "email": "studio@beige.com",
        "id": "64897d2d58e8e97d0df27bb6"
      },
      "rating_type": "buyer_to_seller",
      "id": "64afb8f24e5d26728d772ca9"
    }
  ],
  "page": 1,
  "limit": 10,
  "totalPages": 1,
  "totalResults": 4
}
``` 

### GET - Get Rating By Id

Retrieves a specific rating by its ID.

- **Endpoint:** `/v1/rating/:id`
- **Method:** GET

**Path Variables**

- `id`: ID of the rating

**Example Request**

```javascript
var requestOptions = {
    method: 'GET',
    redirect: 'follow'
};

fetch("https://api.beigecorporation.io/v1/rating/64afd2672777d5328a4c3e86", requestOptions)
    .then(response => response.json())
    .then(result => console.log(result))
    .catch(error => console.log('error', error));
``` 

**Successful Response**

- **Status:** 200 OK
- **Body:**

```json
{
  "rating": 5,
  "review": "The buyer is very co-operative",
  "rating_by": {
    "role": "cp",
    "isEmailVerified": false,
    "name": "Beige Studio",
    "email": "studio@beige.com",
    "id": "64897d2d58e8e97d0df27bb6"
  },
  "order_id": "6492a2194ef06a428f1766e9",
  "rating_type": "seller_to_buyer",
  "rating_to": {
    "role": "user",
    "isEmailVerified": false,
    "name": "Rohsin Al Razi",
    "email": "alrazi900@gmail.com",
    "id": "64a91cee89bcdb4d6361d995"
  },
  "id": "64afd2672777d5328a4c3e86"
}
```

### Buyer to Seller

The Buyer to Seller section of the API focuses on ratings provided by buyers for their experience with sellers. Buyers
can rate sellers based on their interactions, product quality, and overall satisfaction. This section provides endpoints
to retrieve seller ratings, rate a specific seller, and get ratings filtered by seller ID.

#### GET - Get Seller Ratings

Retrieves the ratings of sellers.

- **Endpoint:** `/v1/rating/seller`
- **Method:** GET

**Query Parameters**

- `sortBy` (optional): Sort the ratings by the creation date in descending order. Example: `createdAt:desc`
- `limit` (optional): Limit the number of ratings per page. Example: `4`
- `page` (optional): Specify the page number. Example: `1`

**Example Request**

```javascript
var requestOptions = {
    method: 'GET',
    redirect: 'follow'
};

fetch("https://api.beigecorporation.io/v1/rating/seller", requestOptions)
    .then(response => response.json())
    .then(result => console.log(result))
    .catch(error => console.log('error', error));
``` 

**Successful Response**

- **Status:** 200 OK
- **Body:**

 ```json
{
  "results": [
    {
      "rating": 5,
      "review": "Very responsible seller",
      "rating_by": {
        "role": "user",
        "isEmailVerified": false,
        "name": "Rohsin Al Razi",
        "email": "alrazi900@gmail.com",
        "id": "64a91cee89bcdb4d6361d995"
      },
      "order_id": "6492a2194ef06a428f1766e9",
      "rating_to": {
        "role": "cp",
        "isEmailVerified": false,
        "name": "Beige Studio",
        "email": "studio@beige.com",
        "id": "64897d2d58e8e97d0df27bb6"
      },
      "rating_type": "buyer_to_seller",
      "id": "64afb8f24e5d26728d772ca9"
    },
    {
      "rating": 4,
      "review": "The seller is experienced and talented",
      "rating_by": {
        "role": "user",
        "isEmailVerified": false,
        "name": "Rohsin Al Razi",
        "email": "alrazi900@gmail.com",
        "id": "64a91cee89bcdb4d6361d995"
      },
      "order_id": "6492a2194ef06a428f1766e9",
      "rating_to": {
        "role": "cp",
        "isEmailVerified": false,
        "name": "Beige Studio",
        "email": "studio@beige.com",
        "id": "64897d2d58e8e97d0df27bb6"
      },
      "rating_type": "buyer_to_seller",
      "id": "64afd5422777d5328a4c3e94"
    }
  ],
  "page": 1,
  "limit": 10,
  "totalPages": 1,
  "totalResults": 2
}
``` 

#### GET - Get Seller Ratings By Seller Id

Retrieves the ratings of a specific seller by their ID.

- **Endpoint:** `/v1/rating/seller/:id`
- **Method:** GET

**Path Variables**

- `id`: ID of the seller/CP

**Query Parameters**

- `sortBy` (optional): Sort the ratings by the creation date in descending order. Example: `createdAt:desc`
- `limit` (optional): Limit the number of ratings per page. Example: `4`
- `page` (optional): Specify the page number. Example: `1`

**Example Request**

```javascript
var requestOptions = {
    method: 'GET',
    redirect: 'follow'
};

fetch("https://api.beigecorporation.io/v1/rating/seller/64897d2d58e8e97d0df27bb6", requestOptions)
    .then(response => response.json())
    .then(result => console.log(result))
    .catch(error => console.log('error', error));
```

**Successful Response**

- **Status:** 200 OK
- **Body:**

```json
{
  "results": [
    {
      "rating": 5,
      "review": "Very responsible seller",
      "rating_by": {
        "role": "user",
        "isEmailVerified": false,
        "name": "Rohsin Al Razi",
        "email": "alrazi900@gmail.com",
        "id": "64a91cee89bcdb4d6361d995"
      },
      "order_id": "6492a2194ef06a428f1766e9",
      "rating_to": {
        "role": "cp",
        "isEmailVerified": false,
        "name": "Beige Studio",
        "email": "studio@beige.com",
        "id": "64897d2d58e8e97d0df27bb6"
      },
      "rating_type": "buyer_to_seller",
      "id": "64afb8f24e5d26728d772ca9"
    },
    {
      "rating": 4,
      "review": "The seller is experienced and talented",
      "rating_by": {
        "role": "user",
        "isEmailVerified": false,
        "name": "Rohsin Al Razi",
        "email": "alrazi900@gmail.com",
        "id": "64a91cee89bcdb4d6361d995"
      },
      "order_id": "6492a2194ef06a428f1766e9",
      "rating_to": {
        "role": "cp",
        "isEmailVerified": false,
        "name": "Beige Studio",
        "email": "studio@beige.com",
        "id": "64897d2d58e8e97d0df27bb6"
      },
      "rating_type": "buyer_to_seller",
      "id": "64afd5422777d5328a4c3e94"
    }
  ],
  "page": 1,
  "limit": 10,
  "totalPages": 1,
  "totalResults": 2
}
``` 

#### POST - Rate Seller

Rates a seller.

- **Endpoint:** `/v1/rating/seller/:id`
- **Method:** POST

**Path Variables**

- `id`: ID of the seller/CP

**Request Body**

- `rating` (required): Rating value (1-5).
- `review` (required): Review text.
- `rating_by` (required): ID of the user providing the rating.
- `order_id` (required): ID of the order associated with the rating.

**Example Request**

```javascript
var raw = JSON.stringify({
    "rating": 4,
    "review": "The seller is experienced and talented",
    "rating_by": "64a91cee89bcdb4d6361d995",
    "order_id": "6492a2194ef06a428f1766e9"
});

var requestOptions = {
    method: 'POST',
    body: raw,
    redirect: 'follow'
};

fetch("https://api.beigecorporation.io/v1/rating/seller/64897d2d58e8e97d0df27bb6", requestOptions)
    .then(response => response.json())
    .then(result => console.log(result))
    .catch(error => console.log('error', error));
``` 

**Successful Response**

- **Status:** 201 CREATED
- **Body:**

```json
{
  "rating": 4,
  "review": "The seller is experienced and talented",
  "rating_by": "64a91cee89bcdb4d6361d995",
  "order_id": "6492a2194ef06a428f1766e9",
  "rating_to": "64897d2d58e8e97d0df27bb6",
  "rating_type": "buyer_to_seller",
  "id": "64afd5422777d5328a4c3e94"
}
``` 

### Seller to Buyer

The Seller to Buyer section of the API focuses on ratings provided by sellers for their experience with buyers. Sellers
can rate buyers based on their cooperation, responsiveness, and overall satisfaction. This section provides endpoints to
retrieve buyer ratings, rate a specific buyer, and get ratings filtered by buyer ID.

#### GET - Get Buyer Ratings

Retrieves the ratings of buyers.

- **Endpoint:** `/v1/rating/buyer`
- **Method:** GET

**Query Parameters**

- `sortBy` (optional): Sort the ratings by the creation date in descending order. Example: `createdAt:desc`
- `limit` (optional): Limit the number of ratings per page. Example: `4`
- `page` (optional): Specify the page number. Example: `1`

**Example Request**

```javascript
var requestOptions = {
    method: 'GET',
    redirect: 'follow'
};

fetch("https://api.beigecorporation.io/v1/rating/buyer", requestOptions)
    .then(response => response.json())
    .then(result => console.log(result))
    .catch(error => console.log('error', error));
``` 

**Successful Response**

- **Status:** 200 OK
- **Body:**

```json
{
  "results": [
    {
      "rating": 5,
      "review": "The buyer is very co-operative",
      "rating_by": {
        "role": "cp",
        "isEmailVerified": false,
        "name": "Beige Studio",
        "email": "studio@beige.com",
        "id": "64897d2d58e8e97d0df27bb6"
      },
      "order_id": "6492a2194ef06a428f1766e9",
      "rating_type": "seller_to_buyer",
      "rating_to": {
        "role": "user",
        "isEmailVerified": false,
        "name": "Rohsin Al Razi",
        "email": "alrazi900@gmail.com",
        "id": "64a91cee89bcdb4d6361d995"
      },
      "id": "64afd2672777d5328a4c3e86"
    },
    {
      "rating": 3,
      "review": "The buyer is overall good but not responsive",
      "rating_by": {
        "role": "cp",
        "isEmailVerified": false,
        "name": "Beige Studio",
        "email": "studio@beige.com",
        "id": "64897d2d58e8e97d0df27bb6"
      },
      "order_id": "6492a2194ef06a428f1766e9",
      "rating_type": "seller_to_buyer",
      "rating_to": {
        "role": "user",
        "isEmailVerified": false,
        "name": "Rohsin Al Razi",
        "email": "alrazi900@gmail.com",
        "id": "64a91cee89bcdb4d6361d995"
      },
      "id": "64afdcb12777d5328a4c3eb2"
    }
  ],
  "page": 1,
  "limit": 10,
  "totalPages": 1,
  "totalResults": 2
}
``` 

#### GET - Get Buyer Ratings By Buyer Id

Retrieves the ratings of a specific buyer by their ID.

- **Endpoint:** `/v1/rating/buyer/:id`
- **Method:** GET

**Path Variables**

- `id`: ID of the buyer/client

**Query Parameters**

- `sortBy` (optional): Sort the ratings by the creation date in descending order. Example: `createdAt:desc`
- `limit` (optional): Limit the number of ratings per page. Example: `4`
- `page` (optional): Specify the page number. Example: `1`

**Example Request**

```javascript
var requestOptions = {
    method: 'GET',
    redirect: 'follow'
};

fetch("https://api.beigecorporation.io/v1/rating/buyer/64a91cee89bcdb4d6361d995", requestOptions)
    .then(response => response.json())
    .then(result => console.log(result))
    .catch(error => console.log('error', error));
``` 

**Successful Response**

- **Status:** 200 OK
- **Body:**

```json
{
  "results": [
    {
      "rating": 5,
      "review": "The buyer is very co-operative",
      "rating_by": {
        "role": "cp",
        "isEmailVerified": false,
        "name": "Beige Studio",
        "email": "studio@beige.com",
        "id": "64897d2d58e8e97d0df27bb6"
      },
      "order_id": "6492a2194ef06a428f1766e9",
      "rating_type": "seller_to_buyer",
      "rating_to": {
        "role": "user",
        "isEmailVerified": false,
        "name": "Rohsin Al Razi",
        "email": "alrazi900@gmail.com",
        "id": "64a91cee89bcdb4d6361d995"
      },
      "id": "64afd2672777d5328a4c3e86"
    }
  ],
  "page": 1,
  "limit": 1,
  "totalPages": 2,
  "totalResults": 2
}
``` 

#### POST - Rate Buyer

Rates a buyer.

- **Endpoint:** `/v1/rating/buyer/:id`
- **Method:** POST

**Path Variables**

- `id`: ID of the buyer/client

**Request Body**

- `rating` (required): Rating value (1-5).
- `review` (required): Review text.
- `rating_by` (required): ID of the user providing the rating.
- `order_id` (required): ID of the order associated with the rating.

**Example Request**

```javascript
var raw = JSON.stringify({
    "rating": 3,
    "review": "The buyer is overall good but not responsive",
    "rating_by": "64897d2d58e8e97d0df27bb6",
    "order_id": "6492a2194ef06a428f1766e9"
});

var requestOptions = {
    method: 'POST',
    body: raw,
    redirect: 'follow'
};

fetch("https://api.beigecorporation.io/v1/rating/buyer/64a91cee89bcdb4d6361d995", requestOptions)
    .then(response => response.json())
    .then(result => console.log(result))
    .catch(error => console.log('error', error));
``` 

**Successful Response**

- **Status:** 201 CREATED
- **Body:**

```json
{
  "rating": 3,
  "review": "The buyer is overall good but not responsive",
  "rating_by": "64897d2d58e8e97d0df27bb6",
  "order_id": "6492a2194ef06a428f1766e9",
  "rating_type": "seller_to_buyer",
  "rating_to": "64a91cee89bcdb4d6361d995",
  "id": "64afdcb12777d5328a4c3eb2"
}
```