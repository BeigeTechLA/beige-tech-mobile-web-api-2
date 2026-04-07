# Meeting API Documentation

The Meeting API Collection provides a comprehensive set of endpoints for managing meetings within an application. It
allows clients to create new meetings, retrieve information about existing meetings, and perform various operations on
meetings.

**Background:**

The meetings functionality in our API is supported by an isolated collection in the database named **meetings**. To
handle the storage and retrieval of meeting data, we have a dedicated model located at `src/models/meeting.model.js`
within our API application.

When creating a meeting using the `Create Meeting` API, it is essential to include the **order_id** as part of the
request body. This allows us to establish a connection between the meeting and a specific order in our system. However,
instead of directly referencing the **order_id** within the **meetings** collection, we adopt a different approach.

All meetings associated with an order are stored in the **orders** collection. More specifically,
the `meeting_date_times` field within the **orders** collection serves as an array that holds references to the meeting
records. Each meeting record consists of relevant details about the meeting. Consequently, when querying order data
using the Order APIs, the associated meeting records will be returned as well, providing a comprehensive view of the
order along with its associated meetings.

This design ensures a logical and efficient organization of meeting data within our system, facilitating streamlined
access and retrieval of meeting information when working with order-related APIs.

**Endpoints:**

1. **Create Meeting**

- **Endpoint**: POST /v1/meetings
- **Description**: Creates a new meeting with the provided details. This API endpoint allows the client to schedule a
  meeting by specifying the meeting date and time, meeting status, meeting type, and associated order ID. The meeting is
  created and stored in the system for future reference.

2. **Get Meetings**

- **Endpoint**: GET /v1/meetings
- **Description**: Retrieves a list of all meetings. This API endpoint allows the client to fetch a paginated list of
  meetings, providing details such as the meeting status, meeting date and time, meeting type, and unique meeting ID.
  The response includes pagination information to navigate through the list of meetings.

3. **Get Meeting By ID**

- **Endpoint**: GET /v1/meetings/:meeting_id
- **Description**: Retrieves detailed information about a specific meeting based on the provided meeting ID. It includes
  data such as the meeting status, meeting date and time, meeting type, and unique meeting ID. This API endpoint allows
  the client to fetch specific details of a meeting for display or further processing.

4. **Get Meeting By Order ID**

- **Endpoint**: GET /v1/meetings/order/:order_id
- **Description**: Retrieves a list of meetings associated with a specific order based on the provided order ID. This
  API endpoint allows the client to fetch all meetings that are related to a particular order. The response includes
  details such as the meeting status, meeting date and time, meeting type, and unique meeting ID.

5. **Update Meeting Status**

- **Endpoint**: PATCH /v1/meetings/:meeting_id
- **Description**: Updates the status of a specific meeting based on the provided meeting ID. This API endpoint allows
  the client to update the data of a meeting.

6. **Delete Meeting**

- **Endpoint**: DELETE /v1/meetings/:meeting_id
- **Description**: Deletes a specific meeting based on the provided meeting ID. This API endpoint allows the client to
  remove a meeting from the system. Once deleted, the meeting and its associated data will no longer be accessible.

**Usage:**

The Meeting API provides various endpoints to manage meetings. Here's how you can use the Meeting API for meeting
operations. By making requests to the appropriate endpoints and providing the required parameters and data, you can
perform operations such as retrieving meeting details, creating new meetings, retrieving lists of meetings, and updating
meetings.

1. **POST - Create Meeting**

    - Endpoint: `POST /v1/meetings`
    - Description: Creates a new meeting with the provided details.
    - Request Body:
        - `meeting_date_time` (string): The date and time of the meeting in ISO 8601 format.
        - `meeting_status` (string): The status of the meeting.
        - `meeting_type` (string): The type of the meeting.
        - `order_id` (string): The ID of the associated order.

    - Example:
        - Request:
          ```json
          {
              "meeting_date_time": "2022-06-30T10:00:00Z",
              "meeting_status": "pending",
              "meeting_type": "post_production",
              "order_id": "64a3aad6b6095dd20ae8ae2f"
          }
          ``` 

        - Successful Response:
          ```json
          {
              "meeting_status": "pending",
              "meeting_date_time": "2023-06-30T10:00:00.000Z",
              "meeting_type": "post_production",
              "id": "64a268000b2f5e51fcec77df"
          }
          ```

2. **Get - Get Meetings**

    - Endpoint: `GET /v1/meetings`
    - Description: Retrieves a list of all meetings.
    - Query Parameters:
        - `sortBy` (optional): Specifies the sorting order of the meetings based on their creation timestamp.
        - `limit` (optional): Specifies the maximum number of meetings to be returned per page.
        - `page` (optional): Specifies the page number of meetings to be fetched.
    - Example:
        - Request: `GET /v1/meetings?sortBy=createdAt:desc&limit=4&page=1`
        - Successful Response:
          ```json
          {
              "results": [
                  {
                      "meeting_status": "pending",
                      "meeting_date_time": "2023-06-30T10:00:00.000Z",
                      "meeting_type": "pre_production",
                      "id": "64995c45ad30f34030bae2e2"
                  },
                  {
                      "meeting_status": "pending",
                      "meeting_date_time": "2023-06-30T10:00:00.000Z",
                      "meeting_type": "pre_production",
                      "id": "64995d8dc360374409753bbf"
                  }
              ],
              "page": 1,
              "limit": 10,
              "totalPages": 2,
              "totalResults": 16
          }
          ```

3. **GET - Get Meeting**

    - Endpoint: `GET /v1/meetings/:meeting_id`
    - Description: Retrieves detailed information about a specific meeting based on the provided meeting ID.
    - Path Variables:
        - `meeting_id`: The ID of the meeting to retrieve.
    - Example:
        - Request: `GET /v1/meetings/64a3b590d7f63f355eaa391a`
        - Successful Response:
          ```json
          {
              "meeting_status": "pending",
              "meeting_date_time": "2023-06-30T10:00:00.000Z",
              "meeting_type": "pre_production",
              "id": "64a3b590d7f63f355eaa391a"
          }
          ```

4. **Get - Get Meeting By Order Id**
    - Endpoint: `GET /v1/meetings/order/:order_id`
    - Description: Retrieves meetings associated with a specific order based on the order ID.
    - Path Variables:
        - `order_id`: The ID of the order to retrieve meetings for.
    - Example:
        - Request: `GET /v1/meetings/order/6492a42bcccbb7453bd5d116`
        - Successful Response:

          ```json
          {
              "meeting_status": "pending",
              "meeting_date_time": "2023-06-30T10:00:00.000Z",
              "meeting_type": "pre_production",
              "id": "64a251c0eec804244193f278"
          },
          {
              "meeting_status": "completed",
              "meeting_date_time": "2023-06-30T10:00:00.000Z",
              "meeting_type": "post_production",
              "id": "64a265c91287ff4ebdb17e38"
          },
          {
              "meeting_status": "pending",
              "meeting_date_time": "2023-06-30T10:00:00.000Z",
              "meeting_type": "pre_production",
              "id": "64a3b3a4d7f63f355eaa390e"
          }
          ```

5. **Update Meeting**

    - Endpoint: `PATCH /v1/meetings/:meeting_id`
    - Description: Updates the details of a specific meeting based on the meeting ID.
    - Path Variables:
        - `meeting_id`: The ID of the meeting to update.
    - Request Body: Provide the updated details of the meeting
    - Example:
        - Request: `PATCH /v1/meetings/64a3b590d7f63f355eaa391a`
        - Request Body:

          ```json
          {
              "meeting_status": "completed",
              "meeting_date_time": "2023-07-01T14:00:00.000Z",
              "meeting_type": "post_production"
          }
          ```

        - Successful Response:

          ```json
          {
              "meeting_status": "completed",
              "meeting_date_time": "2023-07-01T14:00:00.000Z",
              "meeting_type": "post_production",
              "id": "64a3b590d7f63f355eaa391a"
          }
          ```

6. **Delete Meeting**

    - Endpoint: `DELETE /v1/meetings/:meeting_id`
    - Description: Deletes a specific meeting based on the meeting ID.
    - Path Variables:
        - `meeting_id`: The ID of the meeting to delete.
    - Example:
        - Request: `DELETE /v1/meetings/64a3b590d7f63f355eaa391a`
        - Successful Response: Status code 204 (No Content)

These are the APIs available for managing meetings. You can use them to retrieve meetings by order ID, update meeting
details, and delete meetings based on their IDs.