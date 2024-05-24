import express, { Express, Request, Response } from "express";
import giftRouter from './routes/giftRouter';
import dotenv from "dotenv";
dotenv.config();

const app: Express = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(giftRouter);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

module.exports = app;