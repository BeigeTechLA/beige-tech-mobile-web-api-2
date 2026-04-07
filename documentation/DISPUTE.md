
# Dispute System Documentation
The Dispute API Collection provides a set of endpoints to manage and handle disputes related to orders. 

## Flow of the dispute system
Order > Dispute > Resolution

- Order
- Client / CP cannot resolve the issue
- Client / CP creates a dispute
- PM views the dispute and decides on the outcome


## Dispute Model
These are the values allowed on the dispute model

 -   `status` (string): The status of the dispute.
 -   `order_id` (string): The ID of the associated order.
 -   `reason` (string): The reason for the dispute.
 -   `description` (string): The description of the dispute.
    
```js
{
    status: {
      type: String,
      default: "pending",
      required: true,
      enum: ["pending", "approved", "rejected"],
    },
    order_id: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: "Order",
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: false,
    },
  },
  {
    timestamps: true,
  }

```

> Note: The reason field is a string but it is a dropdown on the frontend. The reason field is a string to allow for custom reasons to be added in the future.

## API Endpoints:

1.  **POST - Create Dispute**

    -   Endpoint: `POST /v1/disputes`
    -   Description: Use this api to create a new dispute. Both CP and Cliet can create disputes
    -   Request Body:
        -   `status` (string): The status of the dispute.
        -   `order_id` (string): The ID of the associated order.
        -   `reason` (string): The reason for the dispute.
        -   `description` (string): The description of the dispute.
    -   Example:
        -   Request:
            -   Endpoint: `POST /v1/disputes`
            -   Request Body:

                ```json
                {
                    "status": "pending",
                    "order_id": "6492a42bcccbb7453bd5d116",
                    "reason": "Communication Delay 2",
                    "description": "The CP's contact information is not working to contact him 2"
                }
                ``` 

        -   Successful Response:
            -   Status Code: 201 (Created)
            -   Response Body:
                ```json
                {
                    "status": "pending",
                    "order_id": "6492a42bcccbb7453bd5d116",
                    "reason": "Communication Delay 2",
                    "description": "The CP's contact information is not working to contact him 2",
                    "id": "64a52a9dbdbbba2757d3c89e"
                }
                ``` 

2.  **GET - Get Disputes**

    -   Endpoint: `GET /v1/disputes`
    -   Description: This API provides a comprehensive solution for retrieving a list of disputes, allowing users to gain valuable insights into the status and details of each dispute. With flexible features such as sorting, pagination, and result limiting, this API offers convenience and customization to accommodate varying needs for dispute information retrieval.
    -   Query Parameters:
        -   `sortBy` (string): Sorts the disputes by the specified field (e.g., `createdAt:desc`).
        -   `limit` (number): Limits the number of results per page.
        -   `page` (number): Specifies the page number.
    -   Example:
        -   Request:
            -   Endpoint: `GET /v1/disputes`
        -   Successful Response:
            -   Status Code: 200 (OK)
            -   Response Body:

                ```json
                {
                    "results": [
                        {
                            "status": "pending",
                            "order_id": "6492a42bcccbb7453bd5d116",
                            "reason": "Late Delivery",
                            "description": "The CP hasn't delivered my video",
                            "id": "64a52a25bdbbba2757d3c89a"
                        },
                        {
                            "status": "pending",
                            "order_id": "6492a393a094e44457b0ab5a",
                            "reason": "Communication Delay",
                            "description": "The CP's contact information is not working to contact him",
                            "id": "64a52a9dbdbbba2757d3c89e"
                        }
                    ],
                    "page": 1,
                    "limit": 10,
                    "totalPages": 1,
                    "totalResults": 2
                }
                ``` 

3.  **GET - Get Dispute By ID**

    -   Endpoint: `GET /v1/disputes/:id`
    -   Description: Retrieves detailed information about a specific dispute based on the provided dispute ID.
    -   Path Variables:
        -   `id` (string): The ID of the dispute to retrieve.
    -   Example:
        -   Request:
            -   Endpoint: `GET /v1/disputes/64a52a9dbdbbba2757d3c89e`
        -   Successful Response:
            -   Status Code: 200 (OK)
            -   Response Body:
                ```json
                {
                    "status": "pending",
                    "order_id": "6492a393a094e44457b0ab5a",
                    "reason": "Communication Delay",
                    "description": "The CP's contact information is not working to contact him",
                    "id": "64a52a9dbdbbba2757d3c89e"
                }
                ``` 

4.  **GET - Get Disputes By Order ID**

    -   Endpoint: `GET /v1/disputes/order/:id`
    -   Description: Retrieves a list of disputes associated with a specific order ID.
    -   Path Variables:
        -   `id` (string): The ID of the order.
    -   Example:
        -   Request:
            -   Endpoint: `GET /v1/disputes/order/6492a393a094e44457b0ab5a`
            -   Description: Retrieves a list of disputes associated with a specific order ID.
        -   Successful Response:
            -   Status Code: 200 (OK)
            -   Response Body:

                ```json
                [
                    {
                        "status": "pending",
                        "order_id": "6492a393a094e44457b0ab5a",
                        "reason": "Communication Delay",
                        "description": "The CP's contact information is not working to contact him",
                        "id": "64a52a9dbdbbba2757d3c89e"
                    },
                    {
                        "status": "pending",
                        "order_id": "6492a393a094e44457b0ab5a",
                        "reason": "Communication Delay 2",
                        "description": "The CP's contact information is not working to contact him 2",
                        "id": "64a534130b3d0e30ceb36642"
                    }
                ]
                ``` 

5.  **PATCH - Update Dispute**

    -   Endpoint: `PATCH /v1/disputes/:id`

    -   Description: This API allows for the modification of specific dispute details based on the provided dispute ID. By specifying the desired dispute ID and supplying the updated parameters such as the dispute status, order ID, reason, and description, you can effectively update the existing dispute information.

    -   Path Variables:

        -   `id` (string): The ID of the dispute to update.
    -   Request Body:
        -   `status` (string): The updated status of the dispute.
        -   `order_id` (string): The updated ID of the associated order.
        -   `reason` (string): The updated reason for the dispute.
        -   `description` (string): The updated description of the dispute.

    -   Example:

        -   Request:
            -   Endpoint: `POST /v1/disputes`
            -   Request Body:

                ```json
                {
                    "status": "pending",
                    "order_id": "6492a42bcccbb7453bd5d116",
                    "reason": "Communication Delay 2",
                    "description": "The cp's contact information is not working to contact him 2"
                }
                ```

        -   Successful Response:
            -   Status Code: 200 (OK)
            -   Response Body:

                ```json
                {
                    "status": "pending",
                    "order_id": "6492a42bcccbb7453bd5d116",
                    "reason": "Communication Delay 2",
                    "description": "The cp's contact information is not working to contact him 2",
                    "id": "64a52a9dbdbbba2757d3c89e"
                }
                ```

6. **DELETE - Delete Dispute**

-   Endpoint: `DELETE /v1/disputes/:id`
-   Description: Deletes a specific dispute based on the provided dispute ID.
-   Example:
    -   Request:
        - Endpoint: `DELETE /v1/disputes/64a52a25bdbbba2757d3c89a`
    -   Successful Response:
        -   Status Code: 204 (No Content)