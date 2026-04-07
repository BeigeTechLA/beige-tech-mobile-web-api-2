
# Search Algorithm API Documentation

The Search Algorithm API is a part of the Settings module, designed to allow users to configure and customize search algorithm parameters for optimizing search results. This API provides endpoints for retrieving and updating these parameters.

## Table of Contents

1. [Endpoints](#endpoints)
4. [Error Handling](#error-handling)

## Endpoints

### Get Search Algorithm Parameters

- **URL**: `/v1/settings/algo/search`
- **Method**: `GET`
- **Description**: Retrieves the current search algorithm parameters.

#### Request Headers

- None

#### Response

- **Success Response**:
    - **Status Code**: `200 OK`
    - **Content**: JSON object containing search algorithm parameters.

```json
{
  "search": {
    "content_type": 4,
    "content_vertical": 4,
    "vst": 4,
    "avg_rating": 4,
    "avg_response_time": 4
  }
}
```

- **Error Responses**:
    - **Status Code**: `404 Not Found`
    - **Content**: Error message if the parameters have not been configured:

      ```json
      {
        "message": "Search algorithm parameters are not configured. Please configure the search algorithm parameters to enable this feature."
      }
      ```

### Update Search Algorithm Parameters

- **URL**: `/v1/settings/algo/search`
- **Method**: `PATCH`
- **Description**: Updates the search algorithm parameters with the provided values.

#### Request Headers

- `Content-Type: application/json`

#### Request Body

- JSON object containing the updated search algorithm parameters:

```json
{
  "content_type": 6,
  "content_vertical": 4,
  "vst": 4,
  "avg_rating": 6,
  "avg_response_time": 5
}
```

#### Response

- **Success Response**:
    - **Status Code**: `200 OK`
    - **Content**: JSON object containing the updated search algorithm parameters.

```json
{
  "search": {
    "content_type": 6,
    "content_vertical": 4,
    "vst": 4,
    "avg_rating": 6,
    "avg_response_time": 5
  }
}
```

## Error Handling

In case of an error, the API will respond with the appropriate HTTP status code and a JSON error message indicating the issue.