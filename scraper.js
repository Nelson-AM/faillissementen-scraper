const opties = require("./config.js");
const axios = require("axios").default;
const fs = require("fs");

async function scrapeDagen(dagenTeDoen) {
  const reedsGescraped = dagenTeDoen.filter((d) => d.gescraped);
  const nietGescrapedVolgensDb = dagenTeDoen.filter((d) => !d.gescraped);
  const teScrapen = opties.overschrijfAlleRequest
    ? nietGescrapedVolgensDb
    : nietGescrapedVolgensDb.filter((dbDag) => {
        return !fs.existsSync("opslag/responses/kvk/" + dbDag.route + ".json");
      });

  const exitTijd = teScrapen.length * 800 + 800;
  console.log(
    "EXIT OVER ",
    exitTijd / 60000,
    "minuten; scrape ",
    teScrapen.length,
    " dagen"
  );

  return new Promise((resolve) => {
    const gescraped = [];
    const hadMeldingen = [];
    teScrapen.forEach((dag, index) => {
      const planningVanafNu = index * 800;
      const url = `https://insolventies.rechtspraak.nl/Services/BekendmakingenService/haalOp/${dag.route}`;

      setTimeout(function () {
        axios
          .get(url)
          .then(function (response) {
            const iplus = index + 1;
            if (iplus % 10 === 0) {
              console.log(iplus, " dagen gescraped");
            }
            if (opties.schrijfAlleRequestsWeg) {
              if (response.data.Instanties && response.data.Instanties.length) {
                fs.writeFileSync(
                  "opslag/responses/kvk/" + dag.route + ".json",
                  JSON.stringify(response.data)
                );
                hadMeldingen.push(dag);
              }
              gescraped.push(dag);
            }
          })
          .catch(function (error) {
            // handle error
            console.log(error);
          });
      }, planningVanafNu);
    });
    setTimeout(function () {
      resolve({
        gescraped,
        reedsGescraped,
        hadMeldingen,
      });
    }, exitTijd);
  });
}

module.exports = {
  scrapeDagen,
};
