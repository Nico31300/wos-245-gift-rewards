import express, { Request, Response } from 'express';
import crypto, { BinaryLike } from "crypto";
import axios, { AxiosError } from "axios";
import { sql } from '@vercel/postgres';
const router = express.Router();
const hash = "tB87#kPtkxqOS2";

type WosResponseData = {

}

type signInResponse = {
  data: {
    fid: Number,
    nickname: string,
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


router.get('/initDb', async (req: Request, res: Response) => {
  try {
    const result = await sql`CREATE TABLE players ( player_id varchar(255), player_name varchar(255), last_message varchar(255) );`;
    res.send(result)
  } catch (error) {
    res.json(error);
  }
});

router.get('/players', async (req: Request, res: Response) => {
  const { rows } = await sql`SELECT * FROM Players;`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    res.write(`${row.player_name}(${row.player_id}): ${row.last_message} <br/>`)
  }
  res.end()
});

router.get('/remove/:playerId', async (req: Request, res: Response) => {
  const playerId = req.params.playerId;
  await sql`DELETE FROM players WHERE player_id = ${playerId}`;
  res.send(`Player removed from database`)
});

router.get('/add/:playerId', async (req: Request, res: Response) => {
  const playerId = req.params.playerId;
  try {
    const signInResponse = await signIn(parseInt(playerId));
    if (signInResponse.data.kid === 245) {
      await sql`INSERT INTO players (player_id, player_name, last_message) VALUES (${playerId}, ${signInResponse.data.nickname}, 'Created');`;
      res.send(`Player ${signInResponse.data.nickname} inserted into database`)
    }
    else {
      res.send(`Only player from state 245 are allowed`)
    }
  } catch (error) {
    console.log(error);
  }
});

router.get('/send/:giftCode', async (req: Request, res: Response) => {
  const giftCode = req.params.giftCode;
  type APIResponse = {
    playerId: Number;
    playerName: String;
    message: String;
    code: String;
  }
  let response: APIResponse[] = [];
  let resetAt: Date = new Date();
  const { rows } = await sql`SELECT * FROM players where last_message not like ${`%${giftCode}%`} or last_message is null`;

  let cdkNotFound = false;
  let tooManyAttempts = false;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!tooManyAttempts) {
      try {
        await signIn(row.player_id)
        const giftResponse = await sendGiftCode(row.player_id, giftCode)
        if (msg[giftResponse.err_code as msgKey].err_code === 40014) //Gift code does not exist
        {
          cdkNotFound = true;
          res.send({
            code: giftCode,
            message: msg[giftResponse.err_code as msgKey].descr
          })
          break;
        }
        response.push({ playerId: row.player_id, playerName: row.player_name, message: msg[giftResponse.err_code as msgKey].descr, code: giftCode })
        await sql`UPDATE Players SET last_message = ${`${giftCode}: ${msg[giftResponse.err_code as msgKey].descr}`} WHERE player_id = ${row.player_id}`;
      } catch (e) {
        const error = e as AxiosError;
        switch (error.response?.status) {
          case 429: //Too Many Requests
            const ratelimitReset = error?.response?.headers['x-ratelimit-reset'];
            console.log(`Request at ${new Date()}`);
            console.log(`Reseted at ${resetAt}`);
            resetAt = new Date(ratelimitReset * 1000);
            tooManyAttempts = true;
            break;
          default:
            console.log(e);
            break;
        }
        const resetIn = Math.floor(( resetAt.getTime() - new Date().getTime()) / 1000); //time in seconds
        await sql`UPDATE Players SET last_message = ${`Too many attempts: Retry in ${resetIn} seconds(${resetAt.toLocaleTimeString()})`} WHERE player_id = ${row.player_id}`;
      }
    }
    else{
      const resetIn = Math.floor(( resetAt.getTime() - new Date().getTime()) / 1000); //time in seconds
      await sql`UPDATE Players SET last_message = ${`Too many attempts: Retry in ${resetIn} seconds(${resetAt.toLocaleTimeString()})`} WHERE player_id = ${row.player_id}`;
    }
  }
  if (cdkNotFound === false) {
    res.send(response);
  }
});

export default router;