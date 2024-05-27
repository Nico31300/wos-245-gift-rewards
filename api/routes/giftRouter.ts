import express, { Request, Response } from 'express';
import crypto, { BinaryLike } from "crypto";
import axios, { AxiosError } from "axios";
import sqlite3 from 'sqlite3';
import path from 'path';
const db_name = path.join(__dirname, "..", "data", "wos.db");
const router = express.Router();
const hash = "tB87#kPtkxqOS2";
type Player = {
  playerId: Number,
  playerName: String,
  furnaceLevel?: Number,
  lastMessage: String
}

type WosResponseData = {

}

type signInResponse = {
  data: {
    fid: Number,
    nickname: String,
    kid: Number,
    stove_lv: Number,
    stove_lv_content: Number,
    avatar_image: String
  },
  'x-ratelimit-remaining': Number
}

type WosResponse = {
  code: Number,
  data: [] | WosResponseData,
  msg: String;
  err_code: Number;
}

type msgKey = keyof typeof msg;
const msg = {
  40007: {
    code: 1,
    msg: "TIME ERROR.",
    err_code: 40007,
    descr: "Gift code expired.",
  },
  40014: {
    code: 1,
    msg: "CDK NOT FOUND.",
    err_code: 40014,
    descr: "Gift code does not exist.",
  },
  40008: {
    code: 1,
    msg: "RECEIVED.",
    err_code: 40008,
    descr: "Gift code already used.",
  },
  40010: {
    code: 0,
    msg: "SUCCESS",
    err_code: 20000,
    descr: "Gift code send.",
  },
};

/**
 * 
 * @param text Text to convert to MD5
 * @returns 
 */
const md5 = (text: BinaryLike) => {
  return crypto.createHash("md5").update(text).digest("hex");
};

/**
 * 
 * @param Player ID
 * @returns 
 */
const signIn = async (fid: Number): Promise<signInResponse> => {
  const time = new Date().getTime();
  const params = new URLSearchParams();
  params.append(
    "sign",
    md5(`fid=${fid.toString()}&time=${time.toString()}${hash}`)
  );
  params.append("fid", fid.toString());
  params.append("time", time.toString());

  const response = await axios.post(
    "https://wos-giftcode-api.centurygame.com/api/player",
    params,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  return {
    data: response.data.data,
    "x-ratelimit-remaining": parseInt(response.headers["x-ratelimit-remaining"]) | 0,
  };
};

/**
 * 
 * @param fid Player ID
 * @param giftCode Gift code
 * @returns 
 */
const sendGiftCode = async (fid: Number, giftCode: String) => {
  const time = new Date().getTime();
  const params = new URLSearchParams();
  params.append(
    "sign",
    md5(
      `cdk=${giftCode.toString()}&fid=${fid.toString()}&time=${time.toString()}${hash}`
    )
  );
  params.append("fid", fid.toString());
  params.append("time", time.toString());
  params.append("cdk", giftCode.toString());

  const response = await axios.post(
    "https://wos-giftcode-api.centurygame.com/api/gift_code",
    params,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  return response.data;
};

router.get('/', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.write(`<!DOCTYPE html> <html lang="en"> <head> <meta charset="utf-8"> <meta name="viewport" content="width=device-width, initial-scale=1"> <title>State 245: Rewards</title> </head> <body>`)
  res.write('<h1>State 245 rewards: Available pages</h1>')
  res.write('- Database players <a href="/players">/players</a><br/>')
  res.write('- Send a reward <a href="/send/giftcode">/send/[giftcode]</a><br/>')
  res.write('- Add a player <a href="/add/playerId">/add/[playerId]</a><br/>')
  res.write('- Remove a player <a href="/remove/playerId">/remove/[playerId]</a><br/>')
  res.write('<br/><u>Note:</u> The website wos-giftcode-api.centurygame.com has a rate limit of 30 calls by minutes. So maybe the request must be sent several times. Just wait to execute it again.<br/>')
  res.write('<br/><a href="https://github.com/Nico31300/wos-245-gift-rewards">Github repository</a>')
  res.write(`</body> </html>`)
  res.end();
});

router.get('/players', async (req: Request, res: Response) => {
  const db = new sqlite3.Database(db_name, (err) => {
    if (err) {
      return console.error(err.message);
    }
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  db.all(`SELECT * FROM Players`, async (err, rows: Player[]) => {
    if (err) {
      return console.error(err.message);
    }
    for (let index = 0; index < rows.length; index++) {
      const row: Player = rows[index];
      res.write(`${row.playerName}(${row.playerId}): ${row.lastMessage} <br/>`)
    }
    res.end()
  });
  db.close()
});

router.get('/remove/:playerId', async (req: Request, res: Response) => {
  const playerId = req.params.playerId;
  const db = new sqlite3.Database(db_name, (err) => {
    if (err) {
      return console.error(err.message);
    }
  });
  db.run(`DELETE FROM Players WHERE playerId=?`, playerId, function (err) {
    if (err) {
      res.send(err.message)
      return
    }
    res.send("Player removed from database")
  });
  db.close()
});

router.get('/add/:playerId', async (req: Request, res: Response) => {
  const playerId = req.params.playerId;
  let playerName: String = "";
  const db = new sqlite3.Database(db_name, (err) => {
    if (err) {
      return console.error(err.message);
    }
  });
  try {
    const signInResponse = await signIn(parseInt(playerId));
    playerName = signInResponse.data.nickname;
    if (signInResponse.data.kid === 245) {
      db.run(`INSERT INTO Players(playerId, playerName) VALUES(?, ?)`, [parseInt(playerId), playerName], function (err) {
        if (err) {
          return console.log(err.message);
        }
        res.send(`Player ${playerName} inserted into database`)
      });
    }
    else
    {
      res.send(`Only player from state 245 are allowed`)
    }
  } catch (error) {
    console.log(error);
  }
  db.close()
});

router.get('/send/:giftCode', async (req: Request, res: Response) => {
  const giftCode = req.params.giftCode;
  const sql = `UPDATE Players
            SET lastMessage = ?
            WHERE playerId = ?`;
  const db = new sqlite3.Database(db_name, (err) => {
    if (err) {
      return console.error(err.message);
    }
  });
  db.all(`SELECT * FROM Players where lastMessage not like '%${giftCode}%' or lastMessage is null`, async (err, rows: Player[]) => {
    if (err) {
      return console.error(err.message);
    }
    type APIResponse = {
      playerId: Number;
      playerName: String;
      message: String;
      code: String;
    }
    let response: APIResponse[] = [];

    let cdkNotFound = false;
    let tooManyAttempts = false;
    for (let index = 0; index < rows.length; index++) {
      const row: Player = rows[index];
      if (!tooManyAttempts) {
        try {
          const signInResponse = await signIn(row.playerId)
          console.log(signInResponse);
          const giftResponse = await sendGiftCode(row.playerId, giftCode)
          console.log(giftResponse);
          if (msg[giftResponse.err_code as msgKey].err_code === 40014) {
            cdkNotFound = true;
            res.send({
              code: giftCode,
              message: msg[giftResponse.err_code as msgKey].descr
            })
            break;
          }
          response.push({ playerId: row.playerId, playerName: row.playerName, message: msg[giftResponse.err_code as msgKey].descr, code: giftCode })
          const data = [`${giftCode}: ${msg[giftResponse.err_code as msgKey].descr}`, row.playerId];
          db.run(sql, data, function (err) {
            if (err) {
              return console.error(err.message);
            }
            console.log(`${row.playerName} updated: ${this.changes} rows`);
          });
        } catch (e) {
          const error = e as AxiosError;
          switch (error.response?.status) {
            case 429: //Too Many Requests
              const ratelimitReset = error?.response?.headers['x-ratelimit-reset'];
              console.log(`Request at ${new Date()}`);
              console.log(`Reseted at ${new Date(ratelimitReset * 1000)}`);
              tooManyAttempts = true;
              break;
            default:
              console.log(e);
              break;
          }
          const data = [`${error.code}: ${error.message}`];
          db.run(sql, data, function (err) {
            if (err) {
              return console.error(err.message);
            }
            console.log(`${row.playerName} updated: ${this.changes} rows`);
          });
        }
      }
    }
    if (cdkNotFound === false) {
      db.close();
      res.send(response);
    }
  });
});

export default router;