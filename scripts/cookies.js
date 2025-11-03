#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const domainFilter = process.argv[2] === "--domain" ? process.argv[3] : null;

if (process.argv[2] && process.argv[2] !== "--domain") {
    console.log("Usage: cookies.js [--domain <domain>]");
    console.log("\nExamples:");
    console.log("  cookies.js                    # Extract all cookies");
    console.log("  cookies.js --domain google.com # Extract cookies for domain");
    process.exit(1);
}

const b = await puppeteer.connect({
    browserURL: "http://localhost:9222",
    defaultViewport: null,
});

const p = (await b.pages()).at(-1);

if (!p) {
    console.error("✗ No active tab found");
    process.exit(1);
}

const cookies = await p.cookies();

const filteredCookies = domainFilter 
    ? cookies.filter(cookie => 
        cookie.domain.includes(domainFilter) || 
        cookie.domain.includes(`.${domainFilter}`)
      )
    : cookies;

if (filteredCookies.length === 0) {
    console.log(domainFilter ? `No cookies found for domain: ${domainFilter}` : "No cookies found");
} else {
    filteredCookies.forEach(cookie => {
        console.log(`${cookie.name}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}; HttpOnly=${cookie.httpOnly}; Secure=${cookie.secure}`);
    });
}

await b.disconnect();