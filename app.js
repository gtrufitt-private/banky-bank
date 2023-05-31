const fetch = require("node-fetch");
const Monzo = require('monzo-js');
const express = require("express");
const app = express();
const fs = require('fs');
app.use(express.json());

require('dotenv').config();

const port = process.env.PORT || 3001;

app.get("/", (req, res) => res.type('html').send(html));

app.listen(port, () => console.log(`Example app listening on port ${port}!`));

let accessToken = process.env.ACCESS_TOKEN;
let bacsIds = [];

const catPotMap = {
  "groceries": "pot_0000AJkWVwi5TF9qQM7fnN",
  "eating_out": "pot_0000A5wRB36ZgRNvDIIgi3",
  "transport": "pot_00009metzAzd3Dwp938E0v",
  "entertainment": "pot_00009metsoPA7XLSswZIMT",
  "bills": "pot_00009metsoPA7XLSswZIMT"
}

const exchangeCode = async (code) => {
  console.log('Got auth code: ', code)
  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('client_id', process.env.CLIENT_ID);
  params.append('client_secret', process.env.CLIENT_SECRET);
  params.append('code', code);
  params.append('redirect_uri', encodeURI(process.env.REDIRECT_URI));
  const response = await fetch('https://api.monzo.com/oauth2/token', { method: 'post', body: params });

  const data = await response.json();
  accessToken = data.access_token;
  console.log('oauth data', data);
  await setRefreshToken(data.refresh_token)
}

const getRefreshToken = async () => {

  const response = await fetch('https://api.jsonbin.io/v3/b/62966133449a1f3821f825ef/latest',
    {
      headers:
      {
        "X-Master-Key": process.env.JSON_BIN_MASTER_KEY,
        "X-Access-Key": process.env.JSON_BIN_ACCESS_KEY
      }
    }
  );
  const data = await response.json();
  console.log('response', data);
  return data.record.refresh_token;
};

const setRefreshToken = async (refresh_token) => {
  const response = await fetch('https://api.jsonbin.io/v3/b/62966133449a1f3821f825ef',
    {
      method: 'put',
      headers:
      {
        "X-Master-Key": process.env.JSON_BIN_MASTER_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refresh_token
      })
    }
  );
  const data = await response.json();
  console.log('response', data);
  return data.record.refresh_token;
};

const refreshTheToken = async () => {
  const refreshToken = await getRefreshToken();
  console.log('Refreshing the Token', refreshToken)
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('client_id', process.env.CLIENT_ID);
  params.append('client_secret', process.env.CLIENT_SECRET);
  params.append('refresh_token', refreshToken);
  const response = await fetch('https://api.monzo.com/oauth2/token', { method: 'post', body: params });

  const data = await response.json();
  accessToken = data.access_token;
  await setRefreshToken(data.refresh_token)
  console.log('oauth data refreshed', data);
}

app.get("/post-message", (req, res) => {
  const fireOff = async () => {
    const stateToken = 'gareth123';

    if (req.query.code) {
      await exchangeCode(req.query.code);
      res.send('Oauth Complete, listening for messages');
    } else {
      console.log('Redirection to OAuth')
      res.redirect(`https://auth.monzo.com/?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURI(process.env.REDIRECT_URI)}&response_type=code&state=${stateToken}`)
    }
  }
  fireOff();
});

const sendMessage = async (message) => {
  // $ http --form POST "https://api.monzo.com/feed" \
  // "Authorization: Bearer $access_token" \
  // "account_id=$account_id" \
  // "type=basic" \
  // "url=https://www.example.com/a_page_to_open_on_tap.html" \
  // "params[title]=My custom item" \
  // "params[image_url]=www.example.com/image.png" \
  // "params[background_color]=#FCF1EE" \
  // "params[body_color]=#FCF1EE" \
  // "params[title_color]=#333333" \
  // "params[body]=Some body text to display"
  await refreshTheToken();
  console.log('sending a message');
  const params = new URLSearchParams();
  console.log('Access Token: ', accessToken);
  params.append('account_id', process.env.ACCOUNT_ID);
  params.append('type', 'basic');
  params.append('params[title]', message);
  params.append('params[image_url]', 'https://azhzuyujdm.cloudimg.io/v7/dearevelina.com/img/screen-shot-2020-07-18-at-11-27-23.png?w=1024&q=70&force_format=jpeg&sharp=1');
  console.log(params)
  const response = await fetch('https://api.monzo.com/feed', { method: 'post', body: params, headers: { 'Authorization': "Bearer " + accessToken } });
  const data = await response.json();
  console.log('response', data);
};

app.get("/send-message", (req, res) => {
  const fireOff = async () => {
    await sendMessage(req.query.message);
  }
  fireOff();
});

const pots = async (opts = {}) => {
  await refreshTheToken();
  const params = new URLSearchParams();
  let response;
  console.log('pots opts Amount: ', opts.amount);
  console.log('pots opts PotId: ', opts.potId);
  if (opts.amount && opts.potId) {
    params.append('destination_account_id', process.env.ACCOUNT_ID);
    params.append('amount', opts.amount);
    params.append('dedupe_id', Math.random());
    response = await fetch(`https://api.monzo.com/pots/${opts.potId}/withdraw`, { method: 'put', body: params, headers: { 'Authorization': "Bearer " + accessToken } });
  } else {
    response = await fetch(`https://api.monzo.com/pots?current_account_id=${process.env.ACCOUNT_ID}`, { headers: { 'Authorization': "Bearer " + accessToken } });
    console.log(response)
  }
  const data = await response.json();
  console.log('response', data);
};

app.get("/pots", (req, res) => {
  const fireOff = async () => {
    if (req.query.potId && req.query.amount) {
      await pots({ potId: req.query.potId, amount: req.query.amount });
    }
    await pots();
    res.send('DONE');
  }
  fireOff();
});

app.get("/webhooks", (req, res) => {
  (async () => {
    await refreshTheToken();
    const response = await fetch(`https://api.monzo.com/webhooks?account_id=${process.env.ACCOUNT_ID}`, { headers: { 'Authorization': "Bearer " + accessToken } });
    const data = await response.json();
    console.log('response', data);
    res.send(`store:` + store++);
  })()

})

app.get("/transactions", (req, res) => {
  (async () => {
    const response = await fetch(`https://api.monzo.com/transactions?account_id=${process.env.ACCOUNT_ID}`, { headers: { 'Authorization': "Bearer " + accessToken } });
    const data = await response.json();
    console.log(data)
    res.send('DONE');
  })()

})

const parseTransaction = async (reqBody) => {
  // Make sure we don't have an existing pot transfer that contains the bacs record id 
  // in the dedupe_id field
  const matcher = bacsIds.filter((id) => reqBody?.data?.dedupe_id.match(id));
  console.log('MATCHER LENGTH: ', matcher.length);
  console.log('catPotMap: ', catPotMap[reqBody?.data?.category]);
  if (catPotMap[reqBody?.data?.category] && reqBody?.type === 'transaction.created' && matcher.length === 0) {
    await pots({ potId: catPotMap[reqBody?.data?.category], amount: Math.abs(reqBody.data.amount) })
  }
}

app.post("/transaction-created", (req, res) => {
  const fireOff = async () => {
    const {category, amount, created, description, dedupe_id} = req.body.data;
    console.log('------------------------')
    console.log('Description: ', description);
    console.log('Type: ', req.body.type);
    console.log('Category: ', category);
    console.log('Amount: ', amount);
    console.log('Created: ', created);
    console.log('Dedupe ID: ', dedupe_id);
    console.log('bacs_record_id: ', req.body.data.metadata['bacs_record_id']);
    await parseTransaction(req.body);
    bacsIds.push(req.body.data.metadata['bacs_record_id']);
    console.log('------------------------')
    res.send('DONE');
  }
  fireOff();
});

const html = `
<!DOCTYPE html>
<html>
  <head>
    <title>Hello from Gareth!</title>
    <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.5.1/dist/confetti.browser.min.js"></script>
    <script>
      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          disableForReducedMotion: true
        });
      }, 500);
    </script>
    <style>
      @import url("https://p.typekit.net/p.css?s=1&k=vnd5zic&ht=tk&f=39475.39476.39477.39478.39479.39480.39481.39482&a=18673890&app=typekit&e=css");
      @font-face {
        font-family: "neo-sans";
        src: url("https://use.typekit.net/af/00ac0a/00000000000000003b9b2033/27/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n7&v=3") format("woff2"), url("https://use.typekit.net/af/00ac0a/00000000000000003b9b2033/27/d?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n7&v=3") format("woff"), url("https://use.typekit.net/af/00ac0a/00000000000000003b9b2033/27/a?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n7&v=3") format("opentype");
        font-style: normal;
        font-weight: 700;
      }
      html {
        font-family: neo-sans;
        font-weight: 700;
        font-size: calc(62rem / 16);
      }
      body {
        background: white;
      }
      section {
        border-radius: 1em;
        padding: 1em;
        position: absolute;
        top: 50%;
        left: 50%;
        margin-right: -50%;
        transform: translate(-50%, -50%);
      }
    </style>
  </head>
  <body>
    <section>
      Monzo API Test
    </section>
  </body>
</html>
`
