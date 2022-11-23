const puppeteer = require('puppeteer-extra');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
require('dotenv').config()

puppeteer.use(StealthPlugin())
puppeteer.use(
    RecaptchaPlugin({
        provider: {
            id: '2captcha',
            token: process.env.TWO_CAPTCHA_KEY
        },
        visualFeedback: true,
        throwOnError: true
    })
)

function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
}

async function linkOffers() {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: [
            '--start-maximized',
            '--app=https://www.rakuten.com/in-store.htm',
            '--disable-features=IsolateOrigins,site-per-process,SitePerProcess',
            '--flag-switches-begin --disable-site-isolation-trials --flag-switches-end'
        ]
    });

    const [page] = await browser.pages();

    // Click sign in button
    try {
        await page.waitForSelector('.btn-sign-in', {
            timeout: 3000
        });
        await page.click('.btn-sign-in');
    } catch {
        browser.close();
        linkOffers();
        return;
    }


    // Enter email
    try {
        await page.waitForSelector('.validation-required.auto-correct.email-address.text', {
            timeout: 5000
        });
        await page.type(".validation-required.auto-correct.email-address.text", process.env.LOGIN_EMAIL);
    } catch {
        browser.close();
        linkOffers();
        return;
    }

    // Enter password
    try {
        await page.waitForSelector('.text.validation-required.password', {
            timeout: 5000
        });
        await page.type(".text.validation-required.password", process.env.LOGIN_PASSWORD);
    } catch {
        browser.close();
        linkOffers();
        return;
    }

    // Solve reCAPTCHA
    page.solveRecaptchas();

    let recaptchaSolved = false;

    // Check if reCAPTCHA is solved in intervals of 10 seconds with a maximum wait time of 2 minutes
    for (let i = 0; i < 12; i++) {
        let recaptchaResponseElement = await page.$('#g-recaptcha-response');
        let recaptchaResponse = await recaptchaResponseElement.evaluate(el => el.textContent);

        if (recaptchaResponse.length <= 0) {
            await delay(10000);
        } else {
            recaptchaSolved = true;
            break;
        }
    }

    if (!recaptchaSolved) {
        browser.close();
        linkOffers();
        return;
    }

    // Submit sign in form
    try {
        await page.waitForSelector('.button.primary.stretch.join-button.submit-button', {
            timeout: 5000
        });
        await page.click('.button.primary.stretch.join-button.submit-button');
    } catch {
        browser.close();
        linkOffers();
        return;
    }

    await delay(1000);

    try {
        await page.waitForSelector('#h-search > div > div > div > ul > li > a > span.user-name > svg', {
            timeout: 5000
        });
    } catch {
        browser.close();
        linkOffers();
        return;
    }

    // Get offer count
    await page.waitForSelector('.frt.f-16.lh-20.mar-20-r.mar-15-t', {
        timeout: 0
    });
    let offerCountElement = await page.$('.frt.f-16.lh-20.mar-20-r.mar-15-t');
    let offerCountString = await offerCountElement.evaluate(el => el.textContent);
    let offerCount = parseInt(offerCountString.replace(/[^0-9]/g, ''));

    // Loop through offers and link them
    for (let i = 1; i < offerCount + 1; i++) {
        try {
            let linkButton = '#clo-offers-cont > div:nth-child(' + i + ') > a.button.primary.ghost.int.mar-10-b.w-123.link-offer.no-select.msg-dismissive.int'
            await page.waitForSelector(linkButton, {
                timeout: 0
            });
            let offerStatusElement = await page.$(linkButton);
            let offerStatus = await offerStatusElement.evaluate(el => el.textContent);

            if (offerStatus == "Link Offer") {
                await page.click(linkButton);
                try {
                    await page.waitForSelector('.fa-check-circle', {
                        timeout: 5000,
                        visible: true
                    });
                } catch {
                    await page.click(linkButton);
                }
                await page.click(linkButton);
                await console.log('Successfully linked offer')
                await delay(1000);
            }
        } catch {
            continue;
        }
    }

    await console.log('Finished linking offers');
    await browser.close();
}

setInterval(function () {
    linkOffers();
}, 43200000);

linkOffers();