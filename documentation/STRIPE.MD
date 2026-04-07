# Payment API Documentation

The Payment API Collection consists of endpoints that allow interaction with payment-related data and functionality.
This collection provides methods to retrieve payment details, update payment statuses, and retrieve payment intent
information. The endpoints facilitate seamless integration with payment systems and offer essential functionalities for
managing payments within an application.

## Payment System Overview

- Client Places an order `POST {{beige_localhost}}/orders`
- The response from `POST {{beige_localhost}}/orders` will include

  ```json
  {
    "order_payment_status": "pending",
    "ordered_by": "6437937c90b9c577739729ca",
    "payment_ids": [
      {
        "intent_id": "pi_3NLLIlDkrb6iYi292vrUjSwm",
        "amount": 1200,
        "currency": "USD",
        "client_secret": "pi_3NLLIlDkrb6iYi292vrUjSwm_secret_5mB1IfR3vx8NFtAL5zO8RNIHC",
        "description": "Ad Shoot Service",
        "status": "requires_payment_method",
        "id": "6492a42ccccbb7453bd5d11a"
      }
    ]
  }
  ```

- Use the `client secret` in the front-end Stripe SDK to charge the client
- After successful payment, the payment status on the order will be updated automatically in the backend {with webhook}

- Note: The payment status is updated on the backend. So you can view the latest status of the payment again by calling:
    1. `GET {{beige_localhost}}/orders/:{{orderId}}` 
    1. `GET /v1/payments/:payment_id`

## API Endpoints

1. **GET Payment Data**

- Endpoint: `GET /v1/payments/:payment_id`
- Description: Retrieves detailed information about a specific payment based on the provided payment ID. It includes
  data such as the payment intent ID, amount, currency, client secret, description, and current status of the
  payment.

2. **GET Payment Intent Data**

- Endpoint: `GET /v1/payments/intent/:payment_intent_id`
- Description: Retrieves detailed information about a specific payment intent based on the provided payment intent
  ID. It provides comprehensive data related to the payment intent, including the payment ID, amount, currency,
  client secret, description, status, payment method, and more.

3. **PATCH Request Payment Status Update**

- Endpoint: `PATCH /v1/payments/:payment_id`
- Description: Updates the status of a specific payment based on the provided payment ID. It allows for the
  modification of the payment status to reflect changes in the payment process, such as transitioning from "
  requires_payment_method" to "succeeded" status.

**Usage:**

The Payment API Collection enables developers to integrate payment functionality into their applications. By utilizing
the provided endpoints, developers can access payment details, retrieve payment intent data, and update payment statuses
as required. This collection is designed to facilitate seamless payment management and integration with payment systems,
ensuring a smooth payment experience for users.

1. **GET - Payment Data**

- Endpoint: `GET /v1/payments/:payment_id`
- Description: Retrieves payment data for a specific payment based on the payment ID.
- Path Variables:
  - `payment_id`: The ID of the payment to retrieve.
- Example:

  - Request:
    `GET /v1/payments/6492a42ccccbb7453bd5d11a`

  - Successful Response:
    ```json
    {
      "intent_id": "pi_3NLLIlDkrb6iYi292vrUjSwm",
      "amount": 1200,
      "currency": "USD",
      "client_secret": "pi_3NLLIlDkrb6iYi292vrUjSwm_secret_5mB1IfR3vx8NFtAL5zO8RNIHC",
      "description": "Ad Shoot Service",
      "status": "requires_payment_method",
      "id": "6492a42ccccbb7453bd5d11a"
    }
    ```

2. **GET - Payment Intent Data**

- Endpoint: `GET /v1/payments/intent/:payment_intent_id`
- Description: Retrieves payment intent data for a specific payment intent based on the payment intent ID.
- Path Variables:
  - `payment_intent_id`: The ID of the payment intent to retrieve.
- Example:

  - Request:
    `GET /v1/payments/intent/pi_3NLLGKDkrb6iYi290ioLcSYw`

  - Successful Response:

    ```json
    {
      "id": "pi_3NLLGKDkrb6iYi290ioLcSYw",
      "object": "payment_intent",
      "amount": 1200,
      "status": "succeeded"
    }
    ```

3. **PATCH - Request Payment Status Update**

- Endpoint: `PATCH /v1/payments/:payment_id`
- Description: Updates the status of a specific payment based on the payment ID.
- Path Variables:
  - `payment_id`: The ID of the payment to update.
- Example:

  - Request:
    `PATCH /v1/payments/6492a42ccccbb7453bd5d11a`

  - Successful Response:
    ```json
    {
      "intent_id": "pi_3NLLIlDkrb6iYi292vrUjSwm",
      "amount": 1200,
      "currency": "USD",
      "client_secret": "pi_3NLLIlDkrb6iYi292vrUjSwm_secret_5mB1IfR3vx8NFtAL5zO8RNIHC",
      "description": "Ad Shoot Service",
      "status": "succeeded",
      "id": "6492a42ccccbb7453bd5d11a"
    }
    ```

Please note that the provided examples show the expected structure of the request and response bodies, along with the
corresponding HTTP status codes.

To implement Stripe payment in the front-end application, follow these steps:

1. After placing an order, a payment intent will be automatically created as a payment. The API response from the create
   order request will include the payment ID.

2. Save the payment ID in the front-end application, as it will be used to fetch the payment data later on.

3. Retrieve the payment data by making an API call using the payment ID. This will allow you to obtain the client secret
   from the payment data.

4. Utilize the client secret in the front-end Stripe SDK to charge the client. The client secret is required to
   authenticate and process the payment using the payment intent.

**Example using Javascript and jQuery**

```javascript
// Initialize Stripe.js with your publishable key
const stripe = Stripe(
  "pk_test_51NKDGmDkrb6iYi29j3QujBZlxxmtssu8UnpjJXpO2Nip40eEfniYkU3mNg6E0Kj6tTqqITNBWkKZLu8AMGxkw7mC00eOSP3g4s"
);

const clientSecret =
  "pi_3NLLGKDkrb6iYi290ioLcSYw_secret_YCcSAfrzmeZrLhPRKeCYmNLAu";

// Create a card element using Stripe Elements
const elements = stripe.elements();
const cardElement = elements.create("card");
cardElement.mount("#card-element");

// Handle payment form submission
const form = document.getElementById("payment-form");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  // Disable the submit button to prevent multiple clicks
  document.getElementById("submit-button").disabled = true;

  // Confirm the payment with the client secret obtained from the server
  const { paymentIntent, error } = await stripe.confirmCardPayment(
    clientSecret,
    {
      payment_method: {
        card: cardElement,
      },
    }
  );

  if (error) {
    // Handle payment error
    console.error(error);
    // Display error message to the user
  } else if (paymentIntent.status === "succeeded") {
    // Payment succeeded, process the order
    console.log(paymentIntent);
    console.log("Payment succeeded");
    // Redirect to a success page or display a success message
  } else if (paymentIntent.status === "requires_action") {
    // Additional authentication is required
    // Handle next steps like 3D Secure authentication
    stripe.handleCardAction(paymentIntent.client_secret).then((result) => {
      if (result.error) {
        // Handle authentication error
        console.error(result.error);
      } else if (result.paymentIntent.status === "succeeded") {
        // Authentication successful, process the order
        console.log("Payment succeeded");
        // Redirect to a success page or display a success message
      }
    });
  }
});
```

By following these steps, you can seamlessly integrate Stripe payment functionality into your front-end application.
Remember to handle errors and ensure the secure handling of payment data throughout the process.

**Testing Webhook functionality in localhost**
```bash
stripe listen --forward-to localhost:5000/v1/payments/webhook
```
