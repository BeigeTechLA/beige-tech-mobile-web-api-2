# Chat API Documentation

The chat API offers comprehensive functionality for implementing real-time chat in applications. To enable chat
features, the front-end application needs to interact with two network protocols: REST API and WebSockets.

## GET : Get All Chat Rooms

**Endpoint**  
GET /v1/chats

**Description**  
This API endpoint retrieves all the available chat rooms. It enables the front-end application to fetch the list of chat
rooms for displaying them to the user. The API supports pagination through query parameters and provides filtering
options through the request body parameters.

**Query Parameters**

- sortBy (optional): Specifies the sorting order of the chat rooms based on their creation timestamp. It accepts values
  like "createdAt:desc" to sort the chat rooms in descending order of their creation time.
- limit (optional): Specifies the maximum number of chat rooms to be returned per page.
- page (optional): Specifies the page number of chat rooms to be fetched.

**Request Body**

- id (optional): Specifies the unique ID of the chat room record. If the ID is provided, other request body parameters
  are not required.
- client_id (optional): Specifies the client ID for filtering the result to match the provided client ID.
- cp_id (optional): Specifies the CP (Content Producer) ID for filtering the result to match the provided CP ID.

> Body Raw (json)

```json  
{
  "id": "6485685d0f56b3938fbee742",
  "client_id": "64855d1471ce9158221d33b3",
  "cp_id": "64855d3071ce9158221d33bc"
}  
```  

**Response**  
Upon a successful request, the API responds with a list of chat rooms that meet the specified criteria. The response is
paginated based on the query parameters, providing a limited number of chat rooms per page. Each chat room object
contains information such as the chat room ID, client ID, and CP ID.
> JSON RESPONSE BODY

```json  
{
  "results": [
    {
      "client_id": {
        "role": "user",
        "isEmailVerified": false,
        "name": "Rohsin Al Razi",
        "email": "alrazi900@gmail.com",
        "id": "64855d1471ce9158221d33b3"
      },
      "cp_id": {
        "role": "cp",
        "isEmailVerified": false,
        "name": "Luminous Creative",
        "email": "client@luminouslabsbd.com",
        "id": "64855d3071ce9158221d33bc"
      },
      "id": "64880b8231f6085c1d233a05"
    }
  ],
  "page": 1,
  "limit": 10,
  "totalPages": 1,
  "totalResults": 1
}  
```  

## POST : Create Chat Room

**Endpoint**  
POST /v1/chats

**Description**  
This API endpoint allows the creation of a new chat room. It enables the front-end application to create a chat room by
providing the necessary information in the request body.

**Request Body**

- client_id (required): Specifies the client ID associated with the chat room.
- cp_id (optional): Specifies the CP (Content Producer) ID associated with the chat room.

> Body Raw (json)

```json  
{
  "client_id": "64855d1471ce9158221d33b3",
  "cp_id": "64855d3071ce9158221d33bc"
}  
```  

**Response**  
Upon successful creation of the chat room, the API responds with a 201 CREATED status code along with the chat room
object.

> JSON RESPONSE BODY

```json  
{
  "client_id": "64855d1471ce9158221d33b3",
  "cp_id": "64855d3071ce9158221d33bc",
  "id": "64897b4d58e8e97d0df27bae"
}  
```  

## PATCH : Update Chat Room

**Endpoint**  
PATCH /v1/chats/{chat_room_id}

**Description**  
This API endpoint allows the updating of an existing chat room. It enables the front-end application to modify the chat
room details by providing the updated information in the request body.

**Request Body**

- client_id (optional): Specifies the updated client ID associated with the chat room.
- cp_id (optional): Specifies the updated CP (Content Producer) ID associated with the chat room.

> Body Raw (json)

```json  
{
  "client_id": "64855d1471ce9158221d33b3",
  "cp_id": "64897d2d58e8e97d0df27bb6"
}  
```  

**Response**  
Upon successful update of the chat room, the API responds with a 200 OK status code along with the updated chat room
object
> JSON RESPONSE BODY

```json  
{
  "client_id": "64855d1471ce9158221d33b3",
  "cp_id": "64897d2d58e8e97d0df27bb6",
  "id": "64897b4d58e8e97d0df27bae"
}  
```  

## DELETE : Delete Chat Room

**Endpoint**  
DELETE /v1/chats/{chat_room_id}

**Description**  
This API endpoint allows the deletion of a specific chat room. By sending a DELETE request to this endpoint, the
corresponding chat room will be permanently removed from the system.

**Response**  
Upon a successful request, the API responds with a 200 OK status code and does not include a response body.

> Please note that this request does not return any response body.

## GET : Get Chat Messages By Room ID

**Endpoint**  
GET /v1/chats/{chat_room_id}

**Description**  
This API endpoint retrieves chat messages associated with a specific chat room. It allows the front-end application to
fetch the chat messages for displaying them in the user interface. The API supports pagination to retrieve messages in
batches.

**Query Parameters**

- sortBy (optional): Specifies the sorting order of the chat messages based on their creation timestamp. Use the value "
  createdAt:desc" to sort in descending order of creation time.
- limit (optional): Specifies the maximum number of chat messages to be returned per page.
- page (optional): Specifies the page number of chat messages to be fetched.

**Response**  
Upon a successful request, the API responds with a JSON object

> JSON RESPONSE BODY

```json  
{
  "results": [
    {
      "status": "Delivered",
      "chat_room_id": "64880b8231f6085c1d233a05",
      "message": "Hello",
      "sent_by": {
        "role": "user",
        "isEmailVerified": false,
        "name": "Rohsin Al Razi",
        "email": "alrazi900@gmail.com",
        "id": "64855d1471ce9158221d33b3"
      },
      "id": "1ee0a90a-5623-6830-fcc1-4f902c1daa76"
    },
    {
      "status": "Delivered",
      "chat_room_id": "64880b8231f6085c1d233a05",
      "message": "Hii",
      "sent_by": {
        "role": "cp",
        "isEmailVerified": false,
        "name": "Luminous Creative",
        "email": "client@luminouslabsbd.com",
        "id": "64855d3071ce9158221d33bc"
      },
      "id": "1ee0a90a-78e8-6e10-92f9-e634d51c1a58"
    },
    {
      "status": "Delivered",
      "chat_room_id": "64880b8231f6085c1d233a05",
      "message": "I am looking for a professional photographer.",
      "sent_by": {
        "role": "user",
        "isEmailVerified": false,
        "name": "Rohsin Al Razi",
        "email": "alrazi900@gmail.com",
        "id": "64855d1471ce9158221d33b3"
      },
      "id": "1ee0a90b-54ff-6a70-f030-16cecb57e401"
    },
    {
      "status": "Delivered",
      "chat_room_id": "64880b8231f6085c1d233a05",
      "message": "I am here to help you. Let's discuss your requirement.",
      "sent_by": {
        "role": "cp",
        "isEmailVerified": false,
        "name": "Luminous Creative",
        "email": "client@luminouslabsbd.com",
        "id": "64855d3071ce9158221d33bc"
      },
      "id": "1ee0a90c-479d-6070-9e44-3f67f849fbfa"
    }
  ],
  "page": 1,
  "limit": 10,
  "totalPages": 1,
  "totalResults": 4
}  
```  

## DELETE : Delete Chat Message

**Endpoint**  
DELETE /v1/chats/message/{chat_message_id}

**Description**  
This API endpoint allows the deletion of a specific chat message. By sending a DELETE request to this endpoint with the
corresponding message ID, the chat message will be permanently removed from the system.

**Response**  
Upon a successful request, the API responds with a 200 OK status code and does not include a response body.

> Please note that this request doesn't return any response body.

# Web Socket Documentation

This documentation provides guidance on implementing chat functionality in front-end application using Socket.IO. This
documentation is required for implementing real time functionalities in the application chat functionality.

## Step 1: Connect to the Socket Server

Create a socket connection to the server by using the `io()` function. Make sure to
replace `'http://socket-server-url'` & `'port'` with the URL and port of your socket server.

```javascript
const socket = io('http://socket-server-url:port');
```  

## Step 2: Join the Chat Room

To join the chat room, you need to emit the `joinRoom` event to the socket server along with the required user and room
information. This can be achieved by calling the `socket.emit()` method with the appropriate parameters.

```javascript
socket.emit('joinRoom', {
    roomId: 'your-room-id',
    userId: 'your-user-id',
    userName: 'your-user-name',
});
```

By sending this event to the server, you inform it that a user is joining the specified chat room. Make sure to
replace `'your-room-id'`, `'your-user-id'`, and `'your-user-name'` with the actual values representing the room ID, user
ID, and user name respectively. This step is crucial for establishing the connection between the user and the chat room,
enabling communication between them.

## Step 3: Listen for Room Join Event

Listen for the `roomJoined` event emitted by the socket server to confirm that the user has successfully joined the chat
room. The data parameter passed to the callback function will contain the message and user information sent by the
server.

```javascript
socket.on('roomJoined', (data) => {
    // Handle room join event
    const {userName, userId, message} = data;
});
```

## Step 4: Send and Receive Messages

To send a message, emit the `message` event to the socket server with the message content:

```javascript
socket.emit('message', {
    message: 'your-message-content',
});
```

To receive messages, listen for the `message` event emitted by the socket server. The data parameter passed to the
callback function will contain the message and user information sent by the server

```javascript
socket.on('message', (data) => {
    const {senderId, senderName, messageId, message} = data;
});  
```

## Step 5: Send Message Received Acknowledgement

Upon receiving a new message from the socket server by listening to the `message` event, it is crucial to notify the
server that the message has been successfully received by the recipient. To accomplish this, you need to emit
the `receivedMessage` event to the socket server, including the message ID and the ID of the message sender. Optionally,
you can include the `messageStatus` key in the event data to set the message status as **Seen** if the recipient has
viewed the message.

> Before sending the message received acknowledgement to the server, ensure that the `userId` of the message sender is
> different from the ID of the current user. Although this validation is performed on the server-side, it is recommended
> to verify the `userId` locally to minimize unnecessary network traffic.

```javascript
socket.on('message', (data) => {

    // Extract the received message data
    const {userId, userName, messageId, message} = data;

    // Handle the received message

    // Finally, send a received message acknowledgement to the server
    socket.emit('receivedMessage', {
        userId: userId,
        messageId: messageId,
        messageStatus: 'Seen'
    });

});
```

By following this step, you ensure that the server is informed about the successful reception of a message.

## Step 6: Listen for Message Status Update

After emitting the `receivedMessage` event to the server and completing the validation and message status update on the
server side, you can listen for the `updateMessageStatus` event emitted by the socket server to receive updates on the
message status.

```javascript
socket.on('updateMessageStatus', (data) => {
    // Handle message status updates
    const {senderId, messageId, messageStatus} = data;
});
```

By listening for the `updateMessageStatus` event, you can perform any necessary actions based on the updated message
status. For example, you can update the UI to reflect the new status or trigger any relevant notifications or alerts.
Customize the implementation according to your specific requirements to ensure seamless handling of message status
updates in your front-end application.

## Step 7: Handle Disconnect or Leave Event

To handle situations where a user leaves the chat room or disconnects from the socket server, you can listen for
the `leftChat` event emitted by the server. This event provides information about the user who left and any accompanying
message.

```javascript
socket.on('leftChat', (data) => {
    // Handle user leaving the chat or disconnecting  
    const {userId, userName, message} = data;
});
```

By listening for the `leftChat` event, you can implement appropriate actions in your front-end application when a user
leaves the chat. This can include updating the user interface, displaying notifications, or performing any necessary
cleanup tasks. Adapt the code as per your specific requirements to ensure smooth handling of user disconnections or
departures in your application.

## Step 8: Clean Up on Page Unload

To ensure proper cleanup and avoid unnecessary socket connections when the page or component is unloaded, you can add an
event listener to the `beforeunload` event. Within this event listener, you can disconnect the socket connection.

```javascript
window.addEventListener('beforeunload', () => {
    socket.disconnect();
});
```

By implementing this code, the socket connection will be properly closed when the page or component is unloaded. This
helps in maintaining efficient resource usage and preventing any lingering connections. Make sure to include this code
in your application to handle the cleanup process effectively.

## Conclusion

By following these steps, you can implement chat functionality in your front-end application using Socket