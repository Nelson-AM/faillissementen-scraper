// ISSUES
// pakt niet alle dagen.
// @TODO ook noteren welke requests nooit iets teruggegeven om uit scrape te halen

const { nutsPad } = require("./config.js");
const { pakScript } = require(nutsPad);

async function init() {
  const dagenDatabase = pakScript("dagen-database");
  const scraper = pakScript("scraper");
  const adressen = pakScript("adressen");
  const consolidatie = pakScript("consolidatie");

  try {
    const db = await dagenDatabase.pakDagenData();
    if (db.dagenTeDoen.length) {
      const scraperAntwoord = await scraper.scrapeDagen(db.dagenTeDoen);
      await dagenDatabase.zetGescraped(scraperAntwoord);
    }
    await adressen.zoekAdressen();
    await adressen.consolideerAdressen();
    await consolidatie.consolideerResponsesEnAdressen();
    console.log("einde init");
  } catch (error) {
    console.error(error);
  }
}

init();
