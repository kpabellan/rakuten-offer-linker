const puppeteerExtra = require('puppeteer-extra');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
require('dotenv').config();

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Add the Recaptcha plugin to puppeteerExtra
puppeteerExtra.use(RecaptchaPlugin({
    provider: { id: '2captcha', token: process.env.TWO_CAPTCHA_KEY },
    visualFeedback: true,
}));

(async () => {
    // Launch the browser with puppeteerExtra
    const browser = await puppeteerExtra.launch({
        executablePath: '/usr/bin/google-chrome',
        headless: true,
        defaultViewport: null,
    });

    // Create a new page
    const page = await browser.newPage();

    // Go to the login page, targeting the in-store login
    await page.goto('https://www.rakuten.com/account/login?targetpage=%2Fin-store');

    // Wait for the page to load
    await delay(3000);

    // Wait for the modal to appear
    await page.waitForSelector('.chakra-modal__content-container');

    // Wait for the iframe inside the modal to load
    const iframeElement = await page.waitForSelector('iframe#auth-microsite-iframe-inline');

    // Get the iframe's content frame
    const iframe = await iframeElement.contentFrame();

    // Wait for the email input inside the iframe
    await iframe.waitForSelector('input[name="emailAddress"]');

    // Type the email into the email input
    await iframe.type('input[name="emailAddress"]', process.env.LOGIN_EMAIL);

    // Type the password into the password input
    await iframe.type('input[name="password"]', process.env.LOGIN_PASSWORD);

    // Allow time for the reCAPTCHA to load
    await delay(5000);

    // Solve the reCAPTCHA challenge
    try {
        await iframe.solveRecaptchas();
    } catch (error) {
        console.log('Error solving reCAPTCHA:', error);
    }

    // Wait for the sign in button to be available and click it
    await iframe.waitForSelector('#email-auth-btn');
    await iframe.click('#email-auth-btn');

    // Wait for the response or page navigation
    try {
        await page.waitForNavigation({ waitUntil: 'networkidle0' });
    } catch (error) {
        console.log('Error during navigation:', error);
    }

    // Successfully logged in
    console.log('Logged in');

    // Check and remove the popup if it appears
    try {
        await page.waitForSelector('.chakra-modal__content-container', { timeout: 5000 });
        await page.click('.chakra-modal__close-btn');
    } catch {
        // console.log('No popup appeared');
    }

    // Click the "See More" button if it exists
    while (true) {
        // Get all the buttons on the page
        const buttons = await page.$$('button');
        let seeMoreButtons = [];

        // Iterate over all the buttons to check for "See More"
        for (let button of buttons) {
            const buttonText = await page.evaluate(button => button.innerText, button);
            if (buttonText.includes('See More')) {
                seeMoreButtons.push(button);
            }
        }

        // If there are multiple "See More" buttons, click the first one
        if (seeMoreButtons.length > 1) {
            await seeMoreButtons[0].click();

            // Wait for the page to load after clicking
            await delay(3000);
        } else {
            break;
        }
    }

    // Wait for all "Add" buttons and click them
    const addButtons = await page.$$('button');
    for (let i = 0; i < addButtons.length; i++) {
        const buttonText = await page.evaluate(button => button.innerText, addButtons[i]);

        if (buttonText === 'Add') {
            try {
                // Click the "Add" button
                await addButtons[i].click();

                // Wait for the network to be idle after clicking the button
                await page.waitForNetworkIdle({ timeout: 10000 }); // Timeout after 10 seconds if network doesn't become idle

                console.log('Added offer');
            } catch (error) {
                //console.log(`Error clicking "Add" button ${i + 1}:`, error);
            }
        }
    }

    console.log('Finished adding offers');

    await browser.close();
})();