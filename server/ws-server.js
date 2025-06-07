const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let users = new Map(); // socket => { username, room }
let rooms = new Map(); // room => Set of sockets

// Utility: broadcast data to all in a room except optional socket
function broadcastToRoom(room, data, exceptSocket = null) {
  if (!rooms.has(room)) return;
  rooms.get(room).forEach(socket => {
    if (socket !== exceptSocket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  });
}

// Get current time string for message timestamps
function getCurrentTime() {
  return new Date().toLocaleTimeString();
}

// Send updated room list to a socket
function sendRoomList(socket) {
  socket.send(JSON.stringify({ type: 'roomList', rooms: Array.from(rooms.keys()) }));
}

// Check if username is taken by any connected user
function isUsernameTaken(username) {
  for (let user of users.values()) {
    if (user.username === username) return true;
  }
  return false;
}

// Sanitize & format message content
function formatMessage(text) {
  const escape = str => str.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  return escape(text)
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Send user list for a room to all users in that room
function broadcastUserList(room) {
  if (!rooms.has(room)) return;
  const userList = Array.from(rooms.get(room))
    .map(socket => users.get(socket)?.username)
    .filter(Boolean);

  broadcastToRoom(room, { type: 'userList', users: userList });
}

wss.on('connection', socket => {
  users.set(socket, { username: null, room: null });

  socket.on('message', message => {
    try {
      const data = JSON.parse(message);
      const user = users.get(socket);

      switch (data.type) {
        case 'init':
          if (!data.username || typeof data.username !== 'string' || data.username.length < 3 || data.username.length > 20) {
            socket.send(JSON.stringify({ type: 'error', message: 'Invalid username' }));
            return;
          }
          if (isUsernameTaken(data.username)) {
            socket.send(JSON.stringify({ type: 'error', message: 'Username already taken' }));
            return;
          }
          user.username = data.username;
          sendRoomList(socket);
          break;

        case 'create':
          if (!data.room || typeof data.room !== 'string' || data.room.length < 3 || data.room.length > 20) {
            socket.send(JSON.stringify({ type: 'error', message: 'Invalid room name' }));
            return;
          }
          if (!rooms.has(data.room)) {
            rooms.set(data.room, new Set());
            // Broadcast updated room list to all users
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                sendRoomList(client);
              }
            });
          }
          break;

        case 'join':
          if (!data.room || !rooms.has(data.room)) {
            socket.send(JSON.stringify({ type: 'error', message: 'Room does not exist' }));
            return;
          }
          // Remove from previous room
          if (user.room && rooms.has(user.room)) {
            rooms.get(user.room).delete(socket);
            broadcastUserList(user.room);
          }
          // Add to new room
          user.room = data.room;
          rooms.get(data.room).add(socket);

          socket.send(JSON.stringify({
            type: 'message',
            username: 'System',
            time: getCurrentTime(),
            message: `Joined room: ${data.room}`
          }));

          broadcastUserList(data.room);
          break;

        case 'message':
          if (!user.room) {
            socket.send(JSON.stringify({ type: 'error', message: 'You must join a room to send messages' }));
            return;
          }
          const hasText = data.message && typeof data.message === 'string' && data.message.trim() !== '';
          const hasImage = data.image && typeof data.image === 'string';

          if (!hasText && !hasImage) {
            socket.send(JSON.stringify({ type: 'error', message: 'Empty message' }));
            return;
          }

          const chatData = {
            type: 'message',
            username: user.username,
            time: getCurrentTime(),
          };

          if (hasText) {
            chatData.message = formatMessage(data.message);
          }

          if (hasImage) {
            chatData.image = data.image;  // base64 image string
          }

          broadcastToRoom(user.room, chatData);
          break;

        default:
          socket.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
          break;
      }

    } catch (err) {
      console.error('Failed to parse message:', err);
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  socket.on('close', () => {
    const user = users.get(socket);
    if (user) {
      if (user.room && rooms.has(user.room)) {
        rooms.get(user.room).delete(socket);
        broadcastUserList(user.room);
      }
      users.delete(socket);
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});

wss.on('error', error => {
  console.error('WebSocket error:', error);
});
