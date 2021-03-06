//////////// Sector 0x0 ////////////

const fetch = require('node-fetch');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const { clientID, messageLimit } = require('./config.json');
const port = process.env['PORT'] || 3000;
const clientSecret = process.env['OAUTH_CLIENT_SECRET'];
const admins = JSON.parse(process.env['ADMIN_ID_LIST']);

const app = express();
const server = http.createServer(app);
app.use(bodyParser.json());


//////////// Sector 0x1 ////////////

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const dataObj = JSON.parse(message);
    console.log('[WSS] Recieved message: ', dataObj);
    if (dataObj && dataObj.type) {
      if (dataObj.type % 2 === 0) {
        ws.send(JSON.stringify({ type: 2, data: { message: 'This message type is reserved for server use only.' } }));
      } else {
        switch (dataObj.type) {
          case 1:
            ws.send(JSON.stringify({ type: 0, data: { message: 'pong' } }));
            break;
          case 3:
            console.log('[WSS] Error: ' + dataObj.data.message);
            break;
          default:
            ws.send(JSON.stringify({ type: 2, data: { message: `Unknown message type '${dataObj.type}'` } }));
            break;
        }
      }
    } else {
      ws.send(JSON.stringify({ type: 2, data: { message: 'Unsupported data structure used. Structure {type: number, data: object} expected.' } }));
    }
  });
  ws.send(JSON.stringify({ type: 0, data: { message: 'Connection to WebSocket acknowledged.' } }));
});

const ws = {
  send: (message) => {
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
};

const hasFlag = (flags, flag) => {
  switch ((flags >> flag) % 2) {
    case 1:
      return true;
      break;
    case 2:
    default:
      return false;
      break;
  }
};

const hasCookie = (request, name) => {
  const { headers } = request;
  const { cookie } = headers;
  let exists = false;
  if (cookie) exists = cookie.split(';').some((item) => item.trim().startsWith(`${name}=`));
  let isSet = false;
  if (exists) isSet = cookie.split(';').find(row => row.trim().startsWith(`${name}=`)).split('=')[1] !== '';
  return (exists && isSet);
};

const getCookie = (request, name) => {
  const { headers } = request;
  const { cookie } = headers;
  if (!hasCookie(request, name)) return false;
  return cookie.split(';').find(row => row.trim().startsWith(`${name}=`)).split('=')[1];
};

const validateCookies = (request, response, next) => {
  const { headers } = request;
  const { cookie } = headers;
  if (!hasCookie(request, 'name') || !hasCookie(request, 'flags')) {
    response.redirect('/');
  } else {
    response.cookie('name', getCookie(request, 'name'));
    response.cookie('id', getCookie(request, 'id') || '');
    response.cookie('flags', (admins.includes(parseInt(getCookie(request, 'id'))) ? '1' : '0'));
    (admins.includes(parseInt(getCookie(request, 'id'))) ? '1' : '0') === '0' && getCookie(request, 'flags') === '1' && response.setHeader('X-Should-Update', 'true');
    next();
  }
};

const initialMessages = [
  { author: 'SYSTEM', content: 'Loaded!', timestamp: Date.now(), system: true }
];
let messages = initialMessages;

const getMessages = () => {
  slimArr = messages.slice(-messageLimit);
  return {
    messages: slimArr
  }
};

const clearMessages = (user) => {
  messages = [{ author: 'SYSTEM', content: `${decodeURIComponent(user)} cleared all messages.`, timestamp: Date.now(), system: true }];
  ws.send(JSON.stringify({ type: 4, data: { message: 'Messages cleared.' } }));
};

const postMessage = (message) => {
  messages.push(message);
  ws.send(JSON.stringify({ type: 4, data: { message: 'New message.' } }));
};


//////////// Sector 0x2 ////////////

const pages = {
  landing: 'landing.html',
  login: 'login.html',
  chat: 'chat.html',
};

const scripts = {
  landing: 'landing.js',
  login: 'login.js',
  chat: 'chat.js'
};

const styles = {
  landing: 'landing.css',
  login: 'login.css',
  chat: 'chat.css'
};


//////////// Sector 0x3 ////////////

app.get('/', async (request, response) => {
  const { headers, query } = request;
  const { cookie } = headers;
  const { code } = query;

  if (code) {
    try {
      const oauthResult = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
          client_id: clientID,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: `https://${request.hostname}`,
          scope: 'identify',
        }),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      });
      const oauthData = await oauthResult.json();
      const userResult = await (await fetch('https://discord.com/api/users/@me', {
        headers: {
          authorization: `${oauthData.token_type} ${oauthData.access_token}`,
        }
      })).json();
      response.cookie('name', userResult.username);
      response.cookie('id', userResult.id);
      response.cookie('flags', (admins.includes(parseInt(userResult.id)) ? '1' : '0'));
      return response.redirect('/chat');
    } catch (error) {
      // NOTE: An unauthorized token will not throw an error;
      // it will return a 401 Unauthorized response in the try block above
      console.error(error);
    }
  }
  if (hasCookie(request, 'name') && hasCookie(request, 'id') && hasCookie(request, 'flags')) {
    return response.redirect('/chat');
  }
  return response.sendFile(pages['landing'], { root: '.' });
});

app.get('/scripts/landing', async ({ }, response) => {
  return response.sendFile(scripts['landing'], { root: '.' });
});

app.get('/styles/landing', async ({ }, response) => {
  return response.sendFile(styles['landing'], { root: '.' });
});


//////////// Sector 0x4 ////////////

app.get('/login', async ({ }, response) => {
  return response.sendFile(pages['login'], { root: '.' });
});

app.get('/scripts/login', async ({ }, response) => {
  return response.sendFile(scripts['login'], { root: '.' });
});

app.get('/styles/login', async ({ }, response) => {
  return response.sendFile(styles['login'], { root: '.' });
});


//////////// Sector 0x5 ////////////

app.use('/chat', validateCookies);
app.use('/messages', validateCookies);

app.get('/chat', async ({ }, response) => {
  return response.sendFile(pages['chat'], { root: '.' });
});

app.get('/scripts/chat', async ({ }, response) => {
  return response.sendFile(scripts['chat'], { root: '.' });
});

app.get('/styles/chat', async ({ }, response) => {
  return response.sendFile(styles['chat'], { root: '.' });
});


//////////// Sector 0x6 ////////////

app.get('/messages', async ({ }, response) => {
  return response.send(getMessages());
});

app.post('/messages', async (request, response) => {
  const { headers, body } = request;
  const isAdmin = () => hasFlag(getCookie(request, 'flags'), 0);
  try {
    if (headers['content-type'] != 'application/json') {
      console.log('Sent response \'415\'.', headers, body);
      return response.sendStatus(415);
    }

    reqJSON = body;
    if (!reqJSON.author || !reqJSON.content || !reqJSON.timestamp) {
      console.log('Sent response \'400\'.', reqJSON);
      return response.sendStatus(400);
    }

    if ((
      reqJSON.content[0] == '/' &&
      (
        !(reqJSON.content == `/clear` && isAdmin()) &&
        !reqJSON.content.startsWith('/setname')
      )
    )) {
      console.log('Sent response \'403\'.', reqJSON);
      return response.sendStatus(403);
    }

    if (reqJSON.content == `/clear` && isAdmin()) {
      clearMessages(reqJSON.author);
    } else if (reqJSON.content.startsWith('/setname ')) {
      // tbf this is handled client side, but having a handler here isn't a terrible idea, just in case i want to do this server-side at some point
      let newName = '';
      reqJSON.content.split(' ').slice(1).forEach(v => {
        newName += v;
      });
      response.setHeader('Set-Cookie', `name=${newName}`);
      response.setHeader('X-Should-Update', 'true');
    } else {
      newMessage = {
        author: reqJSON.author,
        content: reqJSON.content,
        timestamp: reqJSON.timestamp
      };
      newMessage.system = reqJSON.system || false;
      newMessage.admin = reqJSON.admin || false;
      postMessage(newMessage);
    }
    console.log('Sent response \'200\'.', reqJSON);
    return response.send(getMessages());
  } catch (e) {
    console.error('Sent response \'500\'.', e);
    return response.sendStatus(500);
  }
});


//////////// Sector 0xF ////////////

server.listen(port, () => console.log(`App listening at port ${port}`));
