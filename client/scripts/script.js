const username = localStorage.getItem('username');
if (!username) {
  window.location.href = 'index.html';
}

const socket = new WebSocket('wss://chat-application-2-lqzg.onrender.com');

const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const roomList = document.getElementById('roomList');
const createRoomForm = document.getElementById('createRoomForm');
const newRoomInput = document.getElementById('newRoom');
const currentRoom = document.getElementById('currentRoom');
const userList = document.getElementById('userList');
const emojiBtn = document.getElementById('emojiBtn');
const emojiPicker = document.getElementById('emojiPicker');
const imageBtn = document.getElementById('imageBtn');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');

let activeRoom = '';
let windowFocused = true;
let rooms = [];

const emojis = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏'];

// ✅ Safe send wrapper
function safeSend(data) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  } else {
    console.warn("⚠️ WebSocket not open, skipping send.", data);
  }
}

// Initialize emoji picker
function initEmojiPicker() {
  emojiPicker.innerHTML = '';
  emojis.forEach(e => {
    const span = document.createElement('span');
    span.textContent = e;
    span.title = e;
    span.addEventListener('click', () => {
      messageInput.value += e;
      messageInput.focus();
      emojiPicker.classList.remove('open');
    });
    emojiPicker.appendChild(span);
  });
}

initEmojiPicker();

// Toggle emoji picker display
emojiBtn.addEventListener('click', () => {
  emojiPicker.classList.toggle('open');
});

// Hide emoji picker if clicked outside
document.addEventListener('click', (e) => {
  if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
    emojiPicker.classList.remove('open');
  }
});

// Image upload
imageBtn.addEventListener('click', () => {
  imageInput.click();
});

imageInput.addEventListener('change', () => {
  const file = imageInput.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('Please select a valid image file');
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    imagePreview.src = e.target.result;
    imagePreview.style.display = 'block';
  };
  reader.readAsDataURL(file);
});

// ✅ Message send
messageForm.addEventListener('submit', e => {
  e.preventDefault();

  if (!activeRoom) {
    alert('Please select a room first!');
    return;
  }

  const text = messageInput.value.trim();
  const hasText = text.length > 0;
  const hasImage = imagePreview.style.display === 'block';

  if (!hasText && !hasImage) {
    alert('Cannot send empty message!');
    return;
  }

  if (hasImage) {
    safeSend({
      type: 'message',
      image: imagePreview.src
    });
    imagePreview.src = '';
    imagePreview.style.display = 'none';
  }

  if (hasText) {
    safeSend({
      type: 'message',
      message: text
    });
    messageInput.value = '';
  }
});

// Socket handlers
socket.addEventListener('open', () => {
  safeSend({ type: 'init', username });
});

socket.addEventListener('message', event => {
  const data = JSON.parse(event.data);

  if (data.type === 'message') {
    displayMessage(data);
    if (!windowFocused && data.username !== username) {
      notifyUser(data);
    }
  } else if (data.type === 'roomList') {
    updateRoomList(data.rooms);
  } else if (data.type === 'error') {
    alert(data.message);
  } else if (data.type === 'userList') {
    updateUserList(data.users);
  }
});

// Room handling
function updateRoomList(roomsArray) {
  rooms = roomsArray;
  roomList.innerHTML = '';
  rooms.forEach(room => {
    const li = document.createElement('li');
    li.textContent = room;
    li.onclick = () => {
      if (room === activeRoom) return;
      joinRoom(room);
    };
    roomList.appendChild(li);
  });
}

function joinRoom(room) {
  activeRoom = room;
  currentRoom.textContent = room;
  messagesDiv.innerHTML = '';
  userList.innerHTML = '';
  safeSend({ type: 'join', room });
}

function updateUserList(users) {
  userList.innerHTML = '';
  users.forEach(u => {
    const li = document.createElement('li');
    li.textContent = u;
    userList.appendChild(li);
  });
}

// Display message
function displayMessage(data) {
  const msg = document.createElement('div');
  let content = '';

  if (data.username === 'System') {
    content = `<em>${escapeHTML(data.message)}</em>`;
  } else {
    content = `<strong>${escapeHTML(data.username)}</strong> <span class="time">[${data.time}]</span>: `;

    if (data.message) {
      content += formatMessage(data.message);
    }

    if (data.image) {
      content += `<br/><img src="${data.image}" alt="sent image" style="max-width:200px; max-height:200px; border-radius:5px; margin-top:5px;" />`;
    }
  }

  msg.innerHTML = content;
  messagesDiv.appendChild(msg);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Format and sanitize
function escapeHTML(str) {
  return str.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function formatMessage(text) {
  const escape = str => str.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  return escape(text)
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Notifications
function notifyUser(data) {
  if (Notification.permission === 'granted') {
    new Notification(`New message from ${data.username}`, {
      body: data.message || 'Image',
      icon: 'chat-icon.png'
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
}

// Window focus detection
window.addEventListener('focus', () => { windowFocused = true; });
window.addEventListener('blur', () => { windowFocused = false; });

// Room creation
createRoomForm.addEventListener('submit', e => {
  e.preventDefault();
  const room = newRoomInput.value.trim();
  if (!room) return alert('Room name cannot be empty');
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(room)) {
    return alert('Room name must be 3-20 chars: letters, numbers, _ or -');
  }
  if (rooms.includes(room)) {
    return alert('Room already exists! Please choose another name.');
  }
  safeSend({ type: 'create', room });
  newRoomInput.value = '';
});

// Dark mode toggle
document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('toggleTheme');
  if (!themeToggle) return;

  const currentTheme = localStorage.getItem('theme');

  if (currentTheme === 'dark') {
    document.body.classList.add('dark');
    themeToggle.textContent = '☀️ Light Mode';
  } else {
    themeToggle.textContent = '🌙 Dark Mode';
  }

  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeToggle.textContent = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
  });
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('username');
  window.location.href = 'index.html';
});
