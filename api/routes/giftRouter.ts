import express, { Request, Response } from 'express';
import crypto, { BinaryLike } from "crypto";
import axios from "axios";
import sqlite3 from 'sqlite3';
import path from 'path';
const db_name = path.join(__dirname, "..", "data", "wos.db");
const db = new sqlite3.Database(db_name, (err) => {
  if (err) {
    return console.error(err.message);
  }
});
const router = express.Router();
const hash = "tB87#kPtkxqOS2";
type Player = {
  playerId: Number,
  playerName: String,
  furnaceLevel: Number,
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

router.get('/send/:giftCode', async (req: Request, res: Response) => {
  const giftCode = req.params.giftCode;
  db.all(`SELECT * FROM Players`, async (err, rows: Player[]) => {
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
    for (let index = 0; index < rows.length; index++) {
      const row: Player = rows[index];
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
      response.push({ playerId: row.playerId, playerName: row.playerName, message: msg[giftResponse.err_code as msgKey].descr, code: giftCode})
    }
    if(cdkNotFound === false){
      res.send(response)
    }
  });
});

export default router;