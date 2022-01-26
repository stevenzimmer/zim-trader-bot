const functions = require("firebase-functions");

const { Configuration, OpenAIApi } = require("openai");
require("dotenv").config();
// console.log(process.env.ALPACA_PAPER_KEY_ID);
// console.log(process.env.ALPACA_PAPER_SECRET_KEY);

const configuration = new Configuration({
    organization: process.env.OPENAI_ID,
    apiKey: process.env.OPENAI_KEY,
});

const openai = new OpenAIApi(configuration);

const puppeteer = require("puppeteer");

async function scrape() {
    const browser = await puppeteer.launch();

    const page = await browser.newPage();

    await page.goto("https://twitter.com/jimcramer", {
        waitUntil: "networkidle2",
    });

    await page.waitForTimeout(3000);

    await page.screenshot({ path: "example.png" });

    const tweets = await page.evaluate(async () => {
        return document.body.innerText;
    });

    await browser.close();

    return tweets;
}

const Alpaca = require("@alpacahq/alpaca-trade-api");

const alpaca = new Alpaca({
    keyId: process.env.ALPACA_PAPER_KEY_ID,
    secretKey: process.env.ALPACA_PAPER_SECRET_KEY,
    paper: true,
});

// console.log(alpaca);
// Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.helloWorld = functions.https.onRequest(async (request, response) => {
    // functions.logger.info("Hello logs!", { structuredData: true });
    // response.send("Hello from Firebase!");
    console.log("hello world");
});

exports.getRichQuick = functions
    .runWith({ memory: "4GB" })
    .pubsub.schedule("0 10 * * 1-5")
    .timeZone("America/New_York")
    .onRun(async (ctx) => {
        console.log(ctx);
        console.log("This runs Every minute");
        // this.helloWorld();
        const tweets = await scrape();

        console.log(tweets);

        const gptCompletion = await openai.createCompletion(
            "text-davinci-001",
            {
                prompt: `${tweets}. Jim Cramer recommends selling the following stock tickers`,
                temperature: 0.7,
                max_tokens: 32,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            }
        );

        // console.log(gptCompletion);

        const stocksToBuy =
            gptCompletion.data.choices[0].text.match(/\b[A-Z]+\b/g);
        console.log(stocksToBuy);
        if (!stocksToBuy) {
            console.log("sitting this one out");
            return null;
        }

        // close all positions
        const cancel = await alpaca.cancelAllOrders();
        const liquidate = await alpaca.closeAllPositions();

        const account = await alpaca.getAccount();

        console.log(account);
        // const liquidate = await alpaca.closeAllPositions();
        console.log(`dry powder: ${account.buying_power}`);

        const order = await alpaca.createOrder({
            symbol: stocksToBuy[0],
            qty: 1,
            // notional: account.buying_power * 0.9,
            side: "buy",
            type: "market",
            time_in_force: "day",
        });

        // response.send(order);
        console.log(`look mom i bought stonks: ${order.id}`);

        // console.log("This will run M-F at 10am Eastern");
        return null;
    });
