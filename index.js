const puppeteer = require('puppeteer');
const puppeteerExtra = require('puppeteer-extra');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
require('dotenv').config();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sendWebhook = async (payload) => {
    const url = process.env.WEBHOOK_URL;
    if (!url) return;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch (error) {
        console.log('Webhook error:', error.message);
    }
};

puppeteerExtra.use(RecaptchaPlugin({
    provider: { id: '2captcha', token: process.env.TWO_CAPTCHA_KEY },
    visualFeedback: true,
}));

(async () => {
    const browser = await puppeteerExtra.launch({
        headless: true,
        defaultViewport: { width: 1920, height: 1080 },
        slowMo: 50,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1920,1080',
        ],
    });

    const page = await browser.newPage();

    await page.goto('https://www.rakuten.com/account/login?targetpage=%2Fin-store');
    await delay(3000);

    // --- Login flow ---
    await page.waitForSelector('.chakra-modal__content-container');
    const iframeElement = await page.waitForSelector('iframe#auth-microsite-iframe-inline');
    const iframe = await iframeElement.contentFrame();

    await iframe.waitForSelector('input[name="emailAddress"]');
    await iframe.type('input[name="emailAddress"]', process.env.LOGIN_EMAIL);
    await iframe.type('input[name="password"]', process.env.LOGIN_PASSWORD);

    await delay(5000);

    try {
        await iframe.solveRecaptchas();
    } catch (error) {
        console.log('Error solving reCAPTCHA:', error);
    }

    await iframe.waitForSelector('#email-auth-btn');
    await iframe.click('#email-auth-btn');

    try {
        await page.waitForNavigation({ waitUntil: 'networkidle0' });
    } catch (error) {
        console.log('Error during navigation:', error);
    }

    console.log('Logged in');

    // Dismiss any post-login popup
    try {
        await page.waitForSelector('.chakra-modal__content-container', { timeout: 5000 });
        await page.click('.chakra-modal__close-btn');
    } catch {}

    // --- Expand all offers via "See More" ---
    while (true) {
        const tilesBefore = await page.$$eval(
            'div[data-testid="offer_tile"]',
            els => els.length
        );

        const clicked = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
                .find(b => b.offsetParent !== null && b.innerText.trim().startsWith('See More'));
            if (!btn) return false;
            btn.scrollIntoView({ block: 'center' });
            btn.click();
            return true;
        });

        if (!clicked) break;

        await delay(3000);

        const tilesAfter = await page.$$eval(
            'div[data-testid="offer_tile"]',
            els => els.length
        );
        if (tilesAfter === tilesBefore) break;
    }

    console.log('All offers loaded');

    // --- Click every "Add" button on an available offer ---
    const clickedOffers = new Set();

    while (true) {
        const offerId = await page.evaluate((alreadyClicked) => {
            const tiles = Array.from(
                document.querySelectorAll('div[data-testid="offer_tile"][offerstatus="available"]')
            );
            for (const tile of tiles) {
                if (alreadyClicked.includes(tile.id)) continue;
                const card = tile.closest('.chakra-linkbox');
                const addBtn = card?.querySelector('button[data-testid="add_offer_button"]');
                if (addBtn) {
                    addBtn.scrollIntoView({ block: 'center' });
                    addBtn.click();
                    return tile.id;
                }
            }
            return null;
        }, Array.from(clickedOffers));

        if (!offerId) break;

        clickedOffers.add(offerId);
        console.log(`Added offer ${offerId} (${clickedOffers.size} total)`);

        await delay(5000);

        // Dismiss popup if one appeared
        try {
            await page.waitForSelector('.chakra-modal__content-container', { timeout: 1000 });
            await page.click('.chakra-modal__close-btn');
        } catch {}

        await delay(1000);
    }

    console.log(`Finished — added ${clickedOffers.size} offers`);

    await sendWebhook({
        embeds: [{
            title: 'Rakuten Offer Linker',
            description: clickedOffers.size > 0
                ? `Added **${clickedOffers.size}** offer${clickedOffers.size !== 1 ? 's' : ''}`
                : 'No new offers were available to add',
            color: clickedOffers.size > 0 ? 0x00c851 : 0xaaaaaa,
            fields: clickedOffers.size > 0 ? [{
                name: 'Offer IDs',
                value: Array.from(clickedOffers).join('\n'),
            }] : [],
            timestamp: new Date().toISOString(),
        }],
    });

    await browser.close();
})();